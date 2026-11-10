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
	"net/netip"
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
	// ErrAlreadyUser is returned by Deny when the address is already a User: the request is cleared without a
	// "denied" event (HTTP 409 already_a_user).
	ErrAlreadyUser = errors.New("access: address is already a user")
	// ErrRequestExists is returned by Store.Insert when a request for the address already exists (UNIQUE conflict,
	// two first sign-ins racing). SignIn re-reads and treats it as a repeat sign-in.
	ErrRequestExists = errors.New("access: request already exists")
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
	// Delete removes the request and reports whether a row was removed (false: already answered, purged or expired).
	Delete(ctx context.Context, id int64) (bool, error)
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
	// PruneEvents deletes audit entries older than before and returns how many went.
	PruneEvents(ctx context.Context, before time.Time) (int, error)
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

	// answerMu serialises every answering path (Approve, ApproveLinked, Deny and the List/Count cleanup) so a request is
	// answered once. One process owns the SQLite file, so a mutex is enough.
	answerMu sync.Mutex

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
			if err := s.recordMemberSignIn(ctx, email, CleanName(id.Name, email), ref); err != nil {
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
		return s.refresh(ctx, req, name, picture, ip, now)
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
	if errors.Is(err, ErrRequestExists) {
		// Lost the race with another first sign-in of this address: carry on as a repeat sign-in.
		existing, ok, err := s.store.ByEmail(ctx, email)
		if err != nil {
			return Decision{}, err
		}
		if !ok {
			return Decision{}, ErrRequestExists
		}
		return s.refresh(ctx, existing, name, picture, ip, now)
	}
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

// refresh updates an existing pending request and issues a new waiting-page token.
func (s *Service) refresh(ctx context.Context, req Request, name, picture, ip string, now time.Time) (Decision, error) {
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

// recordMemberSignIn audits a Member-email sign-in as an "approved" event with no actor and clears any pending
// request for the address.
func (s *Service) recordMemberSignIn(ctx context.Context, email, name string, m MemberRef) error {
	s.answerMu.Lock()
	defer s.answerMu.Unlock()
	if r, ok, err := s.store.ByEmail(ctx, email); err != nil {
		return err
	} else if ok {
		if _, err := s.store.Delete(ctx, r.ID); err != nil {
			return err
		}
	}
	return s.store.AddEvent(ctx, Event{At: s.clk.Now(), Kind: EventApproved, Email: email, Name: name, MemberID: m.ID, MemberName: m.Name})
}

// isUser reports whether the address already has a User.
func (s *Service) isUser(ctx context.Context, email string) (bool, error) {
	_, err := s.users.UserByEmail(ctx, email)
	if err == nil {
		return true, nil
	}
	if errors.Is(err, auth.ErrNotFound) {
		return false, nil
	}
	return false, err
}

// livePending lists the unexpired requests and clears (no event) those whose address is already a User. The caller
// holds answerMu.
func (s *Service) livePending(ctx context.Context) ([]Request, error) {
	all, err := s.store.ListPending(ctx, s.clk.Now())
	if err != nil {
		return nil, err
	}
	out := all[:0:0]
	for _, r := range all {
		user, err := s.isUser(ctx, r.Email)
		if err != nil {
			return nil, err
		}
		if user {
			if _, err := s.store.Delete(ctx, r.ID); err != nil {
				return nil, err
			}
			continue
		}
		out = append(out, r)
	}
	return out, nil
}

// List returns the pending requests, oldest first (expired ones are not listed; requests whose address became a User
// are cleared and not listed).
func (s *Service) List(ctx context.Context) ([]Request, error) {
	s.answerMu.Lock()
	defer s.answerMu.Unlock()
	return s.livePending(ctx)
}

// Count is the number of pending requests (the badge), after the same cleanup as List.
func (s *Service) Count(ctx context.Context) (int, error) {
	s.answerMu.Lock()
	defer s.answerMu.Unlock()
	rs, err := s.livePending(ctx)
	return len(rs), err
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

// claim removes the request; false means someone else answered, purged or expired it first.
func (s *Service) claim(ctx context.Context, id int64) error {
	removed, err := s.store.Delete(ctx, id)
	if err != nil {
		return err
	}
	if !removed {
		return ErrNotFound
	}
	return nil
}

// addUser creates the User for a request, or returns the existing one.
func (s *Service) addUser(ctx context.Context, r Request) (auth.User, error) {
	u, err := s.users.AddUser(ctx, r.Email, CleanName(r.Name, r.Email), false)
	if errors.Is(err, auth.ErrEmailTaken) {
		u, err = s.users.UserByEmail(ctx, r.Email)
	}
	return u, err
}

// Approve adds the requester as a non-Admin User named after their Google name, removes the request and records who
// approved. Any User may approve. ErrNotFound for an unknown, expired or already answered request. If the address
// became a User in the meantime the request is simply removed. Order: read, claim, AddUser, AddEvent.
func (s *Service) Approve(ctx context.Context, id int64, actor auth.User) (auth.User, error) {
	s.answerMu.Lock()
	defer s.answerMu.Unlock()
	r, err := s.pending(ctx, id)
	if err != nil {
		return auth.User{}, err
	}
	if err := s.claim(ctx, r.ID); err != nil {
		return auth.User{}, err
	}
	u, err := s.addUser(ctx, r)
	if err != nil {
		return auth.User{}, err
	}
	err = s.store.AddEvent(ctx, Event{At: s.clk.Now(), Kind: EventApproved, Email: r.Email, Name: r.Name, ActorUserID: actor.ID, ActorEmail: actor.Email})
	return u, err
}

// ApproveLinked is Approve plus "link to Member" in one step: the new User is linked to the unlinked Member
// memberID. The Member is checked first (ErrMemberUnavailable when it is not among Members.Unlinked, or when there
// is no Members port) before anything is created, so such a refusal leaves the request pending. If LinkUser fails
// after the User was created, the approval stands: the request is cleared and "approved" is recorded without a Member;
// ErrMemberUnavailable is returned when that is why it failed, any other error is returned as it is.
func (s *Service) ApproveLinked(ctx context.Context, id int64, actor auth.User, memberID int64) (auth.User, error) {
	s.answerMu.Lock()
	defer s.answerMu.Unlock()
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
	if err := s.claim(ctx, r.ID); err != nil {
		return auth.User{}, err
	}
	u, err := s.addUser(ctx, r)
	if err != nil {
		return auth.User{}, err
	}
	ev := Event{At: s.clk.Now(), Kind: EventApproved, Email: r.Email, Name: r.Name, ActorUserID: actor.ID, ActorEmail: actor.Email}
	if err := s.members.LinkUser(ctx, member.ID, u.ID); err != nil {
		if aerr := s.store.AddEvent(ctx, ev); aerr != nil {
			return auth.User{}, aerr
		}
		if errors.Is(err, ErrMemberUnavailable) {
			return auth.User{}, ErrMemberUnavailable
		}
		return auth.User{}, err
	}
	ev.MemberID, ev.MemberName = member.ID, member.Name
	return u, s.store.AddEvent(ctx, ev)
}

// Deny removes the request and records who denied. The address may ask again after DenyCooldown. If the address is
// already a User the request is cleared without an event and ErrAlreadyUser is returned.
func (s *Service) Deny(ctx context.Context, id int64, actor auth.User) error {
	s.answerMu.Lock()
	defer s.answerMu.Unlock()
	r, err := s.pending(ctx, id)
	if err != nil {
		return err
	}
	user, err := s.isUser(ctx, r.Email)
	if err != nil {
		return err
	}
	if err := s.claim(ctx, r.ID); err != nil {
		return err
	}
	if user {
		return ErrAlreadyUser
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
	if _, err := s.store.PruneEvents(ctx, now.AddDate(-1, 0, 0)); err != nil {
		return 0, err
	}
	return len(gone), nil
}

// History returns the newest audit trail entries.
func (s *Service) History(ctx context.Context, limit int) ([]Event, error) {
	return s.store.Events(ctx, limit)
}

func (s *Service) expire(ctx context.Context, r Request, now time.Time) error {
	removed, err := s.store.Delete(ctx, r.ID)
	if err != nil || !removed {
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

// ClientIP is the visitor's rate-limit key. With trustProxy the address is the last X-Forwarded-For entry (the one the
// operator's own reverse proxy appended; see JoinForwardedFor); otherwise the host part of remoteAddr. An unparsable
// entry falls back to the peer. IPv4 is returned as is, an IPv4-mapped IPv6 address as IPv4, and any other IPv6
// address as its /64 network in CIDR form.
func ClientIP(remoteAddr, forwardedFor string, trustProxy bool) string {
	host := remoteAddr
	if h, _, err := net.SplitHostPort(remoteAddr); err == nil {
		host = h
	}
	if trustProxy {
		parts := strings.Split(forwardedFor, ",")
		last := strings.TrimSpace(parts[len(parts)-1])
		if _, err := netip.ParseAddr(last); err == nil {
			host = last
		}
	}
	a, err := netip.ParseAddr(host)
	if err != nil {
		return host
	}
	a = a.WithZone("")
	if a.Is4In6() {
		return a.Unmap().String()
	}
	if a.Is6() {
		return netip.PrefixFrom(a, 64).Masked().String()
	}
	return a.String()
}

// JoinForwardedFor joins every X-Forwarded-For header line with "," verbatim so ClientIP sees the last entry of the
// last line (the one the operator's proxy appended); Header.Get would return the first line, which the client wrote.
func JoinForwardedFor(lines []string) string { return strings.Join(lines, ",") }
