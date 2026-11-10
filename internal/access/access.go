// Package access decides who may sign in and handles Access Requests: a verified Google account that is not yet a
// User asks to join, and any signed-in User approves or denies it. This package is domain logic only: no net/http, no
// database/sql. Storage, Users, Members and notification arrive through the ports below (design:
// docs/dev/design/a1-access-requests.md).
package access

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"net"
	"net/url"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
)

var (
	// ErrNotFound is returned when an Access Request does not exist (or has expired).
	ErrNotFound = errors.New("access: request not found")
	// ErrMemberUnavailable is returned by ApproveLinked when the chosen Member does not exist or already has a User
	// (including a Member linked between the picker opening and the approval). Nothing is created or linked.
	ErrMemberUnavailable = errors.New("access: member unavailable")
)

// Request is one pending Access Request. Name and Picture come from Google and are untrusted display text.
type Request struct {
	ID          int64
	Email       string // normalised (lower-case)
	Name        string
	Picture     string // https Google avatar URL, or ""
	RequestedAt time.Time
	LastSeenAt  time.Time
	ExpiresAt   time.Time
}

// Limits are the anti-flood and lifetime rules.
type Limits struct {
	TTL             time.Duration // a pending request expires this long after it was made
	MaxPending      int           // global cap on pending requests
	PerIPPerHour    int           // sign-in submissions from one IP that reach the queue, per rolling hour
	PerEmailPerWeek int           // requests one address may create per rolling 7 days
	DenyCooldown    time.Duration // after a denial the address must wait this long before asking again
}

// DefaultLimits are the defaults of the design: 14 days, 50 pending, 10 per IP per hour, 3 per address per week,
// 24 h cooldown after a denial.
func DefaultLimits() Limits {
	return Limits{TTL: 14 * 24 * time.Hour, MaxPending: 50, PerIPPerHour: 10, PerEmailPerWeek: 3, DenyCooldown: 24 * time.Hour}
}

// EventKind is one line of the audit trail.
type EventKind string

// The audit trail kinds.
const (
	EventRequested EventKind = "requested"
	EventApproved  EventKind = "approved"
	EventDenied    EventKind = "denied"
	EventExpired   EventKind = "expired"
)

// Event is one audit trail entry. ActorUserID and ActorEmail are set for approved and denied only; ActorEmail is kept
// even if the actor is later removed.
type Event struct {
	ID          int64
	At          time.Time
	Kind        EventKind
	Email       string
	Name        string
	ActorUserID int64
	ActorEmail  string
	// MemberID and MemberName are set for "approved" events that linked the new User to a Member (0 and "" otherwise).
	// Like ActorEmail they are a snapshot with no foreign key.
	MemberID   int64
	MemberName string
}

// Store is the persistence port (SQLite in access/store). Tokens are stored hashed (SHA-256 hex).
type Store interface {
	ByEmail(ctx context.Context, email string) (Request, bool, error)
	ByTokenHash(ctx context.Context, hash string) (Request, bool, error)
	ByID(ctx context.Context, id int64) (Request, bool, error)
	Insert(ctx context.Context, r Request, tokenHash string) (Request, error)
	// Refresh updates name, picture, last seen and the token hash of a pending request; it never moves ExpiresAt.
	Refresh(ctx context.Context, id int64, name, picture, tokenHash string, seen time.Time) error
	Delete(ctx context.Context, id int64) error
	// ListPending returns the requests not yet expired at now, oldest first.
	ListPending(ctx context.Context, now time.Time) ([]Request, error)
	CountPending(ctx context.Context, now time.Time) (int, error)
	// DeleteExpired removes and returns the requests whose ExpiresAt is at or before now.
	DeleteExpired(ctx context.Context, now time.Time) ([]Request, error)
	AddEvent(ctx context.Context, e Event) error
	CountEvents(ctx context.Context, email string, kind EventKind, since time.Time) (int, error)
	LastEvent(ctx context.Context, email string, kind EventKind) (time.Time, bool, error)
	// Events returns the newest entries first.
	Events(ctx context.Context, limit int) ([]Event, error)
}

// Users is the allowlist (satisfied by *auth.Service).
type Users interface {
	UserByEmail(ctx context.Context, email string) (auth.User, error)
	AddUser(ctx context.Context, email, displayName string, isAdmin bool) (auth.User, error)
}

// MemberRef is a Member that carries a sign-in e-mail address and is not yet linked to a User.
type MemberRef struct {
	ID   int64
	Name string
}

// Members is the Household side of sign-in (satisfied by an adapter over the household store, phase 2; may be nil).
type Members interface {
	// ByEmail returns the Member whose e-mail is email and who has no User yet.
	ByEmail(ctx context.Context, email string) (MemberRef, bool, error)
	// Unlinked lists the Members that have no User yet, in the Members list order.
	Unlinked(ctx context.Context) ([]MemberRef, error)
	// LinkUser links an unlinked Member to a User. It returns ErrMemberUnavailable when the Member is gone or was
	// linked meanwhile.
	LinkUser(ctx context.Context, memberID, userID int64) error
}

// MemberEmails is an optional extra of a Members adapter: whether any Member carries an address.
type MemberEmails interface {
	HasEmail(ctx context.Context, email string) (bool, error)
}

// MemberEmailTaken reports whether a Member carries the address, so the allowlist can refuse it.
func (s *Service) MemberEmailTaken(ctx context.Context, email string) (bool, error) {
	if me, ok := s.members.(MemberEmails); ok {
		return me.HasEmail(ctx, strings.ToLower(strings.TrimSpace(email)))
	}
	return false, nil
}

// DecisionKind is what a Google sign-in leads to.
type DecisionKind int

// The sign-in outcomes.
const (
	// SignedIn: the person is a User (pre-added, Member-linked, or approved): start a session.
	SignedIn DecisionKind = iota + 1
	// Pending: an Access Request exists; show the waiting page. Token is the raw waiting-page token.
	Pending
	// Unverified: Google has not verified the address; nothing is created. Redirect to /not-invited.
	Unverified
	// Limited: a rate limit applies (IP, address or denial cooldown); nothing is created. RetryAfter says when.
	Limited
	// QueueFull: the global cap of pending requests is reached; nothing is created.
	QueueFull
)

// Decision is the outcome of SignIn.
type Decision struct {
	Kind       DecisionKind
	User       auth.User     // SignedIn
	Request    Request       // Pending
	Token      string        // Pending: raw token for the waiting-page cookie (only its hash is stored)
	RetryAfter time.Duration // Limited
}

// Status is what the waiting page may learn: only what Google already told us about the visitor themselves.
type Status struct {
	State       string // "pending" or "none" (answered, expired, unknown token: sign in again)
	Email, Name string
	RequestedAt time.Time
}

// Service holds the Access Request rules.
type Service struct {
	store   Store
	users   Users
	members Members
	clk     clock.Clock
	limits  Limits
	onReq   []func(Request)

	mu     sync.Mutex
	ipHits map[string][]time.Time // submissions that reached the queue, per IP (in memory: a restart only forgives)
}

// NewService returns a Service. members may be nil.
func NewService(store Store, users Users, members Members, clk clock.Clock, limits Limits) *Service {
	return &Service{store: store, users: users, members: members, clk: clk, limits: limits, ipHits: map[string][]time.Time{}}
}

// OnRequested registers fn, called once for each newly created Access Request (not for refreshes). The push
// notification and the live-update event hang here.
func (s *Service) OnRequested(fn func(Request)) { s.onReq = append(s.onReq, fn) }

// SignIn is the Google callback's decision. ip is the visitor's address (see ClientIP). Order: a User signs in; a
// Member-linked address becomes a User and signs in; an unverified or malformed address is refused without a trace;
// then the IP limit, the existing pending request (refreshed, never duplicated), the denial cooldown, the per-address
// limit and the global cap; otherwise a new request is created and OnRequested fires.
func (s *Service) SignIn(ctx context.Context, ip string, id auth.Identity) (Decision, error) {
	email := strings.ToLower(strings.TrimSpace(id.Email))
	if !id.EmailVerified || !validEmail(email) {
		return Decision{Kind: Unverified}, nil
	}
	u, err := s.users.UserByEmail(ctx, email)
	if err == nil {
		return Decision{Kind: SignedIn, User: u}, nil
	}
	if !errors.Is(err, auth.ErrNotFound) {
		return Decision{}, err
	}
	if s.members != nil {
		ref, ok, err := s.members.ByEmail(ctx, email)
		if err != nil {
			return Decision{}, err
		}
		if ok {
			u, err := s.users.AddUser(ctx, email, CleanName(id.Name, email), false)
			if errors.Is(err, auth.ErrEmailTaken) {
				u, err = s.users.UserByEmail(ctx, email)
			}
			if err != nil {
				return Decision{}, err
			}
			if err := s.members.LinkUser(ctx, ref.ID, u.ID); err != nil {
				return Decision{}, err
			}
			return Decision{Kind: SignedIn, User: u}, nil
		}
	}

	now := s.clk.Now()
	if wait := s.ipWait(ip, now); wait > 0 {
		return Decision{Kind: Limited, RetryAfter: wait}, nil
	}
	name, picture := CleanName(id.Name, email), CleanPicture(id.Picture)

	req, found, err := s.store.ByEmail(ctx, email)
	if err != nil {
		return Decision{}, err
	}
	if found && !req.ExpiresAt.After(now) {
		if err := s.expire(ctx, req, now); err != nil {
			return Decision{}, err
		}
		found = false
	}
	if found {
		token, hash, err := newToken()
		if err != nil {
			return Decision{}, err
		}
		if err := s.store.Refresh(ctx, req.ID, name, picture, hash, now); err != nil {
			return Decision{}, err
		}
		req.Name, req.Picture, req.LastSeenAt = name, picture, now
		s.recordIP(ip, now)
		return Decision{Kind: Pending, Request: req, Token: token}, nil
	}

	if last, ok, err := s.store.LastEvent(ctx, email, EventDenied); err != nil {
		return Decision{}, err
	} else if ok && now.Before(last.Add(s.limits.DenyCooldown)) {
		return Decision{Kind: Limited, RetryAfter: last.Add(s.limits.DenyCooldown).Sub(now)}, nil
	}
	n, err := s.store.CountEvents(ctx, email, EventRequested, now.Add(-7*24*time.Hour))
	if err != nil {
		return Decision{}, err
	}
	if n >= s.limits.PerEmailPerWeek {
		return Decision{Kind: Limited, RetryAfter: 7 * 24 * time.Hour}, nil // upper bound: the oldest request leaves the window within a week
	}
	pending, err := s.store.CountPending(ctx, now)
	if err != nil {
		return Decision{}, err
	}
	if pending >= s.limits.MaxPending {
		return Decision{Kind: QueueFull}, nil
	}

	token, hash, err := newToken()
	if err != nil {
		return Decision{}, err
	}
	req, err = s.store.Insert(ctx, Request{
		Email: email, Name: name, Picture: picture,
		RequestedAt: now, LastSeenAt: now, ExpiresAt: now.Add(s.limits.TTL),
	}, hash)
	if err != nil {
		return Decision{}, err
	}
	if err := s.store.AddEvent(ctx, Event{At: now, Kind: EventRequested, Email: email, Name: name}); err != nil {
		return Decision{}, err
	}
	s.recordIP(ip, now)
	for _, fn := range s.onReq {
		fn(req)
	}
	return Decision{Kind: Pending, Request: req, Token: token}, nil
}

// List returns the pending requests, oldest first (expired ones are not listed).
func (s *Service) List(ctx context.Context) ([]Request, error) {
	return s.store.ListPending(ctx, s.clk.Now())
}

// Count is the number of pending requests (the badge).
func (s *Service) Count(ctx context.Context) (int, error) {
	return s.store.CountPending(ctx, s.clk.Now())
}

// pending loads an unexpired request or returns ErrNotFound.
func (s *Service) pending(ctx context.Context, id int64) (Request, error) {
	r, ok, err := s.store.ByID(ctx, id)
	if err != nil {
		return Request{}, err
	}
	if !ok || !r.ExpiresAt.After(s.clk.Now()) {
		return Request{}, ErrNotFound
	}
	return r, nil
}

// Approve adds the requester as a non-Admin User named after their Google name, removes the request and records who
// approved. Any User may approve. ErrNotFound for an unknown or expired request. If the address became a User in the
// meantime the request is simply removed.
func (s *Service) Approve(ctx context.Context, id int64, actor auth.User) (auth.User, error) {
	r, err := s.pending(ctx, id)
	if err != nil {
		return auth.User{}, err
	}
	u, err := s.users.AddUser(ctx, r.Email, CleanName(r.Name, r.Email), false)
	if errors.Is(err, auth.ErrEmailTaken) {
		u, err = s.users.UserByEmail(ctx, r.Email)
	}
	if err != nil {
		return auth.User{}, err
	}
	if err := s.store.Delete(ctx, r.ID); err != nil {
		return auth.User{}, err
	}
	err = s.store.AddEvent(ctx, Event{At: s.clk.Now(), Kind: EventApproved, Email: r.Email, Name: r.Name, ActorUserID: actor.ID, ActorEmail: actor.Email})
	return u, err
}

// ApproveLinked is Approve plus "link to Member" in one step: the new User is linked to the unlinked Member
// memberID. The Member is checked first (ErrMemberUnavailable when it is not among Members.Unlinked, or when there
// is no Members port) before anything is created, so a refusal leaves the request pending. The audit event records
// the Member. If the address became a User meanwhile, that User is the one linked.
func (s *Service) ApproveLinked(ctx context.Context, id int64, actor auth.User, memberID int64) (auth.User, error) {
	r, err := s.pending(ctx, id)
	if err != nil {
		return auth.User{}, err
	}
	if s.members == nil {
		return auth.User{}, ErrMemberUnavailable
	}
	free, err := s.members.Unlinked(ctx)
	if err != nil {
		return auth.User{}, err
	}
	var member MemberRef
	found := false
	for _, m := range free {
		if m.ID == memberID {
			member, found = m, true
			break
		}
	}
	if !found {
		return auth.User{}, ErrMemberUnavailable
	}
	u, err := s.users.AddUser(ctx, r.Email, CleanName(r.Name, r.Email), false)
	if errors.Is(err, auth.ErrEmailTaken) {
		u, err = s.users.UserByEmail(ctx, r.Email)
	}
	if err != nil {
		return auth.User{}, err
	}
	if err := s.members.LinkUser(ctx, member.ID, u.ID); err != nil {
		return auth.User{}, err
	}
	if err := s.store.Delete(ctx, r.ID); err != nil {
		return auth.User{}, err
	}
	err = s.store.AddEvent(ctx, Event{At: s.clk.Now(), Kind: EventApproved, Email: r.Email, Name: r.Name, ActorUserID: actor.ID,
		ActorEmail: actor.Email, MemberID: member.ID, MemberName: member.Name})
	return u, err
}

// Deny removes the request and records who denied. The address may ask again after DenyCooldown.
func (s *Service) Deny(ctx context.Context, id int64, actor auth.User) error {
	r, err := s.pending(ctx, id)
	if err != nil {
		return err
	}
	if err := s.store.Delete(ctx, r.ID); err != nil {
		return err
	}
	return s.store.AddEvent(ctx, Event{At: s.clk.Now(), Kind: EventDenied, Email: r.Email, Name: r.Name, ActorUserID: actor.ID, ActorEmail: actor.Email})
}

// Status answers the waiting page for the holder of token.
func (s *Service) Status(ctx context.Context, token string) (Status, error) {
	none := Status{State: "none"}
	if token == "" {
		return none, nil
	}
	r, ok, err := s.store.ByTokenHash(ctx, hashToken(token))
	if err != nil {
		return Status{}, err
	}
	if !ok || !r.ExpiresAt.After(s.clk.Now()) {
		return none, nil
	}
	return Status{State: "pending", Email: r.Email, Name: r.Name, RequestedAt: r.RequestedAt}, nil
}

// Purge removes expired requests and records an "expired" event for each. It returns how many went.
func (s *Service) Purge(ctx context.Context) (int, error) {
	now := s.clk.Now()
	gone, err := s.store.DeleteExpired(ctx, now)
	if err != nil {
		return 0, err
	}
	for _, r := range gone {
		if err := s.store.AddEvent(ctx, Event{At: now, Kind: EventExpired, Email: r.Email, Name: r.Name}); err != nil {
			return 0, err
		}
	}
	return len(gone), nil
}

// History returns the newest audit trail entries.
func (s *Service) History(ctx context.Context, limit int) ([]Event, error) {
	return s.store.Events(ctx, limit)
}

func (s *Service) expire(ctx context.Context, r Request, now time.Time) error {
	if err := s.store.Delete(ctx, r.ID); err != nil {
		return err
	}
	return s.store.AddEvent(ctx, Event{At: now, Kind: EventExpired, Email: r.Email, Name: r.Name})
}

// ipWait returns how long ip must wait, or 0 when it is under PerIPPerHour.
func (s *Service) ipWait(ip string, now time.Time) time.Duration {
	s.mu.Lock()
	defer s.mu.Unlock()
	hits := s.ipHits[ip][:0:0]
	for _, t := range s.ipHits[ip] {
		if t.After(now.Add(-time.Hour)) {
			hits = append(hits, t)
		}
	}
	if len(hits) == 0 {
		delete(s.ipHits, ip)
	} else {
		s.ipHits[ip] = hits
	}
	if len(hits) >= s.limits.PerIPPerHour {
		return hits[len(hits)-s.limits.PerIPPerHour].Add(time.Hour).Sub(now)
	}
	return 0
}

func (s *Service) recordIP(ip string, now time.Time) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.ipHits[ip] = append(s.ipHits[ip], now)
}

func validEmail(e string) bool {
	at := strings.IndexByte(e, '@')
	if at <= 0 || at == len(e)-1 || strings.Count(e, "@") != 1 {
		return false
	}
	return !strings.ContainsFunc(e, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) })
}

func newToken() (token, hash string, err error) {
	b := make([]byte, 32)
	if _, err = rand.Read(b); err != nil {
		return "", "", err
	}
	token = base64.RawURLEncoding.EncodeToString(b)
	return token, hashToken(token), nil
}

func hashToken(token string) string {
	h := sha256.Sum256([]byte(token))
	return hex.EncodeToString(h[:])
}

// CleanName makes a Google display name safe to store and show: trimmed, control characters removed, at most 100
// characters. An empty result falls back to the local part of email.
func CleanName(name, email string) string {
	name = strings.TrimSpace(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return -1
		}
		return r
	}, name))
	if rs := []rune(name); len(rs) > 100 {
		name = strings.TrimSpace(string(rs[:100]))
	}
	if name == "" {
		name, _, _ = strings.Cut(strings.TrimSpace(email), "@")
	}
	return name
}

// CleanPicture keeps a Google avatar URL only if it is https, on a googleusercontent.com host, and at most 500
// characters; anything else becomes "".
func CleanPicture(u string) string {
	if u == "" || len(u) > 500 {
		return ""
	}
	p, err := url.Parse(u)
	if err != nil || p.Scheme != "https" {
		return ""
	}
	h := strings.ToLower(p.Hostname())
	if h != "googleusercontent.com" && !strings.HasSuffix(h, ".googleusercontent.com") {
		return ""
	}
	return u
}

// ClientIP is the visitor's address for rate limiting. With trustProxy it is the last X-Forwarded-For entry (the one
// the operator's own reverse proxy appended); otherwise the host part of remoteAddr.
func ClientIP(remoteAddr, forwardedFor string, trustProxy bool) string {
	if trustProxy {
		parts := strings.Split(forwardedFor, ",")
		last := strings.TrimSpace(parts[len(parts)-1])
		if net.ParseIP(last) != nil {
			return last
		}
	}
	if host, _, err := net.SplitHostPort(remoteAddr); err == nil {
		return host
	}
	return remoteAddr
}
