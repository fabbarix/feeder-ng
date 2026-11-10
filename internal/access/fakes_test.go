package access_test

import (
	"context"
	"sort"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/access"
	"github.com/fabbarix/feeder-ng/internal/auth"
	"github.com/fabbarix/feeder-ng/internal/clock"
)

var t0 = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)

// memStore is an in-memory access.Store for the domain tests.
type memStore struct {
	mu     sync.Mutex
	next   int64
	reqs   map[int64]access.Request
	hashes map[int64]string
	events []access.Event
}

func newMemStore() *memStore {
	return &memStore{reqs: map[int64]access.Request{}, hashes: map[int64]string{}}
}

func (m *memStore) ByEmail(_ context.Context, email string) (access.Request, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, r := range m.reqs {
		if strings.EqualFold(r.Email, email) {
			return r, true, nil
		}
	}
	return access.Request{}, false, nil
}
func (m *memStore) ByTokenHash(_ context.Context, h string) (access.Request, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, hh := range m.hashes {
		if hh == h {
			return m.reqs[id], true, nil
		}
	}
	return access.Request{}, false, nil
}
func (m *memStore) ByID(_ context.Context, id int64) (access.Request, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	r, ok := m.reqs[id]
	return r, ok, nil
}
func (m *memStore) Insert(_ context.Context, r access.Request, h string) (access.Request, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.next++
	r.ID = m.next
	m.reqs[r.ID], m.hashes[r.ID] = r, h
	return r, nil
}
func (m *memStore) Refresh(_ context.Context, id int64, name, pic, h string, seen time.Time) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	r := m.reqs[id]
	r.Name, r.Picture, r.LastSeenAt = name, pic, seen
	m.reqs[id], m.hashes[id] = r, h
	return nil
}
func (m *memStore) Delete(_ context.Context, id int64) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.reqs, id)
	delete(m.hashes, id)
	return nil
}
func (m *memStore) ListPending(_ context.Context, now time.Time) ([]access.Request, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []access.Request
	for _, r := range m.reqs {
		if r.ExpiresAt.After(now) {
			out = append(out, r)
		}
	}
	sort.Slice(out, func(i, j int) bool {
		return out[i].RequestedAt.Before(out[j].RequestedAt) || (out[i].RequestedAt.Equal(out[j].RequestedAt) && out[i].ID < out[j].ID)
	})
	return out, nil
}
func (m *memStore) CountPending(ctx context.Context, now time.Time) (int, error) {
	l, _ := m.ListPending(ctx, now)
	return len(l), nil
}
func (m *memStore) DeleteExpired(_ context.Context, now time.Time) ([]access.Request, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []access.Request
	for id, r := range m.reqs {
		if !r.ExpiresAt.After(now) {
			out = append(out, r)
			delete(m.reqs, id)
			delete(m.hashes, id)
		}
	}
	return out, nil
}
func (m *memStore) AddEvent(_ context.Context, e access.Event) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	e.ID = int64(len(m.events) + 1)
	m.events = append(m.events, e)
	return nil
}
func (m *memStore) CountEvents(_ context.Context, email string, kind access.EventKind, since time.Time) (int, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	n := 0
	for _, e := range m.events {
		if e.Kind == kind && strings.EqualFold(e.Email, email) && !e.At.Before(since) {
			n++
		}
	}
	return n, nil
}
func (m *memStore) LastEvent(_ context.Context, email string, kind access.EventKind) (time.Time, bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	var last time.Time
	found := false
	for _, e := range m.events {
		if e.Kind == kind && strings.EqualFold(e.Email, email) && (!found || e.At.After(last)) {
			last, found = e.At, true
		}
	}
	return last, found, nil
}
func (m *memStore) Events(_ context.Context, limit int) ([]access.Event, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	out := append([]access.Event(nil), m.events...)
	sort.SliceStable(out, func(i, j int) bool { return out[i].ID > out[j].ID })
	if limit > 0 && len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}

// kinds returns the audit kinds recorded so far, oldest first.
func (m *memStore) kinds() []access.EventKind {
	m.mu.Lock()
	defer m.mu.Unlock()
	var out []access.EventKind
	for _, e := range m.events {
		out = append(out, e.Kind)
	}
	return out
}

// memUsers is an in-memory access.Users.
type memUsers struct {
	byEmail map[string]auth.User
	next    int64
}

func newMemUsers() *memUsers { return &memUsers{byEmail: map[string]auth.User{}} }

func (u *memUsers) UserByEmail(_ context.Context, email string) (auth.User, error) {
	if x, ok := u.byEmail[strings.ToLower(strings.TrimSpace(email))]; ok {
		return x, nil
	}
	return auth.User{}, auth.ErrNotFound
}
func (u *memUsers) AddUser(_ context.Context, email, name string, admin bool) (auth.User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if _, ok := u.byEmail[email]; ok {
		return auth.User{}, auth.ErrEmailTaken
	}
	u.next++
	x := auth.User{ID: u.next, Email: email, DisplayName: name, IsAdmin: admin}
	u.byEmail[email] = x
	return x, nil
}

// memMembers is an in-memory access.Members.
type memMembers struct {
	byEmail map[string]access.MemberRef
	all     []access.MemberRef // every Member, linked or not, in list order
	links   map[int64]int64    // member -> user
	linkErr error              // returned by LinkUser (simulates a Member linked meanwhile)
}

// Unlinked lists the Members without a User.
func (m *memMembers) Unlinked(_ context.Context) ([]access.MemberRef, error) {
	var out []access.MemberRef
	for _, r := range m.all {
		if _, linked := m.links[r.ID]; !linked {
			out = append(out, r)
		}
	}
	return out, nil
}

func (m *memMembers) ByEmail(_ context.Context, email string) (access.MemberRef, bool, error) {
	r, ok := m.byEmail[strings.ToLower(email)]
	return r, ok, nil
}
func (m *memMembers) LinkUser(_ context.Context, member, user int64) error {
	if m.linkErr != nil {
		return m.linkErr
	}
	m.links[member] = user
	return nil
}

// world is one Service on in-memory ports and a fake clock.
type world struct {
	t       *testing.T
	svc     *access.Service
	store   *memStore
	users   *memUsers
	members *memMembers
	clk     *clock.Fake
	pushed  []access.Request
	admin   auth.User
	user    auth.User
}

func newWorld(t *testing.T, mutate ...func(*access.Limits)) *world {
	t.Helper()
	lim := access.DefaultLimits()
	for _, f := range mutate {
		f(&lim)
	}
	w := &world{t: t, store: newMemStore(), users: newMemUsers(), clk: clock.NewFake(t0),
		members: &memMembers{byEmail: map[string]access.MemberRef{}, links: map[int64]int64{}}}
	w.svc = access.NewService(w.store, w.users, w.members, w.clk, lim)
	w.svc.OnRequested(func(r access.Request) { w.pushed = append(w.pushed, r) })
	w.admin, _ = w.users.AddUser(context.Background(), "admin@example.test", "Admin", true)
	w.user, _ = w.users.AddUser(context.Background(), "user@example.test", "User", false)
	return w
}

func ident(email, name string) auth.Identity {
	return auth.Identity{Email: email, EmailVerified: true, Name: name, Picture: "https://lh3.googleusercontent.com/a/photo"}
}

// signIn runs SignIn from ip and fails the test on an error.
func (w *world) signIn(ip string, id auth.Identity) access.Decision {
	w.t.Helper()
	d, err := w.svc.SignIn(context.Background(), ip, id)
	if err != nil {
		w.t.Fatalf("SignIn(%s, %s): %v", ip, id.Email, err)
	}
	return d
}
