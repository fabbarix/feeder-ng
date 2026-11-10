// Package access decides who may sign in and handles Access Requests: a verified Google account that is not yet a
// User asks to join, and any signed-in User approves or denies it. This package is domain logic only: no net/http, no
// database/sql. Storage, Users, Members and notification arrive through the ports below (design:
// docs/dev/design/a1-access-requests.md).
package access

import (
	"context"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
)

var (
	// ErrNotFound is returned when an Access Request does not exist (or has expired).
	ErrNotFound = errors.New("access: request not found")
	// ErrNotImplemented marks the skeleton the Developer replaces.
	ErrNotImplemented = errors.New("access: not implemented")
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

// Members looks Members up by e-mail (satisfied by an adapter over the household store; may be nil in tests).
type Members interface {
	// ByEmail returns the Member whose e-mail is email and who has no User yet.
	ByEmail(ctx context.Context, email string) (MemberRef, bool, error)
	LinkUser(ctx context.Context, memberID, userID int64) error
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
}

// NewService returns a Service. members may be nil.
func NewService(store Store, users Users, members Members, clk clock.Clock, limits Limits) *Service {
	return &Service{store: store, users: users, members: members, clk: clk, limits: limits}
}

// OnRequested registers fn, called once for each newly created Access Request (not for refreshes). The push
// notification and the live-update event hang here.
func (s *Service) OnRequested(fn func(Request)) { s.onReq = append(s.onReq, fn) }

// SignIn is the Google callback's decision. ip is the visitor's address (see ClientIP). Order: a User signs in; a
// Member-linked address becomes a User and signs in; an unverified or malformed address is refused without a trace;
// then the IP limit, the existing pending request (refreshed, never duplicated), the denial cooldown, the per-address
// limit and the global cap; otherwise a new request is created and OnRequested fires.
func (s *Service) SignIn(ctx context.Context, ip string, id auth.Identity) (Decision, error) {
	return Decision{}, ErrNotImplemented
}

// List returns the pending requests, oldest first (expired ones are not listed).
func (s *Service) List(ctx context.Context) ([]Request, error) { return nil, ErrNotImplemented }

// Count is the number of pending requests (the badge).
func (s *Service) Count(ctx context.Context) (int, error) { return 0, ErrNotImplemented }

// Approve adds the requester as a non-Admin User named after their Google name, removes the request and records who
// approved. Any User may approve. ErrNotFound for an unknown or expired request. If the address became a User in the
// meantime the request is simply removed.
func (s *Service) Approve(ctx context.Context, id int64, actor auth.User) (auth.User, error) {
	return auth.User{}, ErrNotImplemented
}

// Deny removes the request and records who denied. The address may ask again after DenyCooldown.
func (s *Service) Deny(ctx context.Context, id int64, actor auth.User) error {
	return ErrNotImplemented
}

// Status answers the waiting page for the holder of token.
func (s *Service) Status(ctx context.Context, token string) (Status, error) {
	return Status{}, ErrNotImplemented
}

// Purge removes expired requests and records an "expired" event for each. It returns how many went.
func (s *Service) Purge(ctx context.Context) (int, error) { return 0, ErrNotImplemented }

// History returns the newest audit trail entries.
func (s *Service) History(ctx context.Context, limit int) ([]Event, error) {
	return nil, ErrNotImplemented
}

// CleanName makes a Google display name safe to store and show: trimmed, control characters removed, at most 100
// characters. An empty result falls back to the local part of email.
func CleanName(name, email string) string { return "" }

// CleanPicture keeps a Google avatar URL only if it is https, on a googleusercontent.com host, and at most 500
// characters; anything else becomes "".
func CleanPicture(u string) string { return "x" }

// ClientIP is the visitor's address for rate limiting. With trustProxy it is the last X-Forwarded-For entry (the one
// the operator's own reverse proxy appended); otherwise the host part of remoteAddr.
func ClientIP(remoteAddr, forwardedFor string, trustProxy bool) string { return "" }
