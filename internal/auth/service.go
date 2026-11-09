// Package auth owns Users (the allowlist), sessions and the middleware that
// resolves the current User. It has no routes; see auth/httpapi.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
)

const (
	// CookieName is the session cookie.
	CookieName = "feeder_session"
	// SessionTTL is the idle lifetime of a session; every use slides it.
	SessionTTL = 30 * 24 * time.Hour

	slideThrottle = time.Minute
	timeFormat    = time.RFC3339
)

var (
	ErrNotFound   = errors.New("auth: not found")
	ErrEmailTaken = errors.New("auth: email already on the allowlist")
	ErrNoSession  = errors.New("auth: no valid session")
)

// User is a person on the allowlist.
type User struct {
	ID          int64
	Email       string
	DisplayName string
	IsAdmin     bool
	CreatedAt   time.Time
}

// Service manages Users and sessions.
type Service struct {
	db       *sql.DB
	clk      clock.Clock
	secure   bool
	onRevoke []func(key string)
}

// NewService returns a Service. secureCookies sets the Secure flag on cookies.
func NewService(d *sql.DB, clk clock.Clock, secureCookies bool) *Service {
	return &Service{db: d, clk: clk, secure: secureCookies}
}

// UserKey is the revocation key for every session of user id.
func UserKey(id int64) string { return "user:" + strconv.FormatInt(id, 10) }

// SessionKey is the revocation key for the session row id.
func SessionKey(id int64) string { return "session:" + strconv.FormatInt(id, 10) }

// OnRevoke registers fn to be called with the revocation key (UserKey or
// SessionKey) whenever access ends: DeleteUser, EndSession, and when an expired
// session is deleted during Authenticate.
func (s *Service) OnRevoke(fn func(key string)) {
	s.onRevoke = append(s.onRevoke, fn)
}

func (s *Service) revoked(key string) {
	for _, fn := range s.onRevoke {
		fn(key)
	}
}

// SeedAdmin makes email an Admin: it creates the User if absent, or promotes
// an existing one. Idempotent.
func (s *Service) SeedAdmin(ctx context.Context, email string) (User, error) {
	email = normalizeEmail(email)
	u, err := s.UserByEmail(ctx, email)
	switch {
	case errors.Is(err, ErrNotFound):
		return s.AddUser(ctx, email, localPart(email), true)
	case err != nil:
		return User{}, err
	case u.IsAdmin:
		return u, nil
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE users SET is_admin = 1 WHERE id = ?`, u.ID); err != nil {
		return User{}, err
	}
	u.IsAdmin = true
	return u, nil
}

// AddUser adds an email to the allowlist. ErrEmailTaken if it is already there.
func (s *Service) AddUser(ctx context.Context, email, displayName string, isAdmin bool) (User, error) {
	email = normalizeEmail(email)
	now := s.clk.Now().UTC().Truncate(time.Second)
	res, err := s.db.ExecContext(ctx,
		`INSERT INTO users(email, display_name, is_admin, created_at) VALUES (?, ?, ?, ?)`,
		email, displayName, isAdmin, now.Format(timeFormat))
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return User{}, ErrEmailTaken
		}
		return User{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return User{}, err
	}
	return User{ID: id, Email: email, DisplayName: displayName, IsAdmin: isAdmin, CreatedAt: now}, nil
}

// UserByEmail looks a User up, case-insensitively. ErrNotFound if absent.
func (s *Service) UserByEmail(ctx context.Context, email string) (User, error) {
	return scanUser(s.db.QueryRowContext(ctx,
		`SELECT id, email, display_name, is_admin, created_at FROM users WHERE email = ?`,
		normalizeEmail(email)))
}

// DeleteUser removes a User from the allowlist; their sessions go with them.
// OnRevoke hooks receive UserKey(id).
func (s *Service) DeleteUser(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	s.revoked(UserKey(id))
	return nil
}

// CreateSession starts a session for userID. It returns the raw token (only
// its hash is stored) and the expiry.
func (s *Service) CreateSession(ctx context.Context, userID int64) (string, time.Time, error) {
	var b [32]byte
	if _, err := rand.Read(b[:]); err != nil {
		return "", time.Time{}, err
	}
	token := base64.RawURLEncoding.EncodeToString(b[:])
	now := s.clk.Now().UTC().Truncate(time.Second)
	exp := now.Add(SessionTTL)
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO sessions(token_hash, user_id, created_at, expires_at, last_seen) VALUES (?, ?, ?, ?, ?)`,
		hashToken(token), userID, now.Format(timeFormat), exp.Format(timeFormat), now.Format(timeFormat))
	if err != nil {
		return "", time.Time{}, err
	}
	return token, exp, nil
}

// Authenticate returns the User behind token, sliding the session expiry.
// ErrNoSession if the token is unknown or expired.
func (s *Service) Authenticate(ctx context.Context, token string) (User, error) {
	r, err := s.resolve(ctx, token)
	return r.user, err
}

// EndSession ends the session for token. Idempotent. OnRevoke hooks receive
// the SessionKey of a session that was ended.
func (s *Service) EndSession(ctx context.Context, token string) error {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM sessions WHERE token_hash = ?`, hashToken(token)).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, id); err != nil {
		return err
	}
	s.revoked(SessionKey(id))
	return nil
}

// SessionCookie is the cookie that carries a session token.
func (s *Service) SessionCookie(token string, expires time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		Expires:  expires,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.secure,
	}
}

// ClearCookie expires the session cookie in the browser.
func (s *Service) ClearCookie() *http.Cookie {
	return &http.Cookie{
		Name:     CookieName,
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   s.secure,
	}
}

// resolved is the outcome of validating a session token.
type resolved struct {
	user      User
	sessionID int64
	expiresAt time.Time
	slid      bool // expiry was moved; expiresAt is the new expiry
}

// resolve validates a token. An expired session is deleted and reported to the
// OnRevoke hooks.
func (s *Service) resolve(ctx context.Context, token string) (resolved, error) {
	if token == "" {
		return resolved{}, ErrNoSession
	}
	var (
		r                  resolved
		u                  = &r.user
		created, exp, seen string
	)
	err := s.db.QueryRowContext(ctx, `SELECT u.id, u.email, u.display_name, u.is_admin, u.created_at,
			s.id, s.expires_at, s.last_seen
		FROM sessions s JOIN users u ON u.id = s.user_id
		WHERE s.token_hash = ?`, hashToken(token)).
		Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsAdmin, &created, &r.sessionID, &exp, &seen)
	if errors.Is(err, sql.ErrNoRows) {
		return resolved{}, ErrNoSession
	}
	if err != nil {
		return resolved{}, err
	}
	if u.CreatedAt, err = time.Parse(timeFormat, created); err != nil {
		return resolved{}, err
	}
	if r.expiresAt, err = time.Parse(timeFormat, exp); err != nil {
		return resolved{}, err
	}
	lastSeen, err := time.Parse(timeFormat, seen)
	if err != nil {
		return resolved{}, err
	}

	now := s.clk.Now().UTC().Truncate(time.Second)
	if !now.Before(r.expiresAt) {
		if _, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE id = ?`, r.sessionID); err == nil {
			s.revoked(SessionKey(r.sessionID))
		}
		return resolved{}, ErrNoSession
	}
	if now.Sub(lastSeen) > slideThrottle {
		r.expiresAt = now.Add(SessionTTL)
		if _, err := s.db.ExecContext(ctx,
			`UPDATE sessions SET expires_at = ?, last_seen = ? WHERE id = ?`,
			r.expiresAt.Format(timeFormat), now.Format(timeFormat), r.sessionID); err != nil {
			return resolved{}, err
		}
		r.slid = true
	}
	return r, nil
}

func normalizeEmail(email string) string { return strings.ToLower(strings.TrimSpace(email)) }

func localPart(email string) string { return strings.SplitN(email, "@", 2)[0] }

func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}
