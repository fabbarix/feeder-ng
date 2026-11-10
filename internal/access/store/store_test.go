package store_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/access"
	"github.com/fabbarix/feeder-ng/internal/access/store"
	"github.com/fabbarix/feeder-ng/internal/db"
)

var (
	ctx = context.Background()
	now = time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)
)

func open(t *testing.T) (*store.Store, *sql.DB) {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	return store.New(d), d
}

func req(email string, at time.Time) access.Request {
	return access.Request{Email: email, Name: "Zia", Picture: "https://lh3.googleusercontent.com/a/x",
		RequestedAt: at, LastSeenAt: at, ExpiresAt: at.Add(14 * 24 * time.Hour)}
}

func TestMigration1200CreatesTheTables(t *testing.T) {
	_, d := open(t)
	for _, table := range []string{"access_requests", "access_events"} {
		var n int
		if err := d.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?`, table).Scan(&n); err != nil || n != 1 {
			t.Errorf("table %s missing (n=%d, err=%v)", table, n, err)
		}
	}
}

func TestInsertAndLookups(t *testing.T) {
	s, _ := open(t)
	got, err := s.Insert(ctx, req("zia@example.test", now), "hash1")
	if err != nil || got.ID == 0 {
		t.Fatalf("Insert = %+v, %v", got, err)
	}
	for name, find := range map[string]func() (access.Request, bool, error){
		"ByID":        func() (access.Request, bool, error) { return s.ByID(ctx, got.ID) },
		"ByEmail":     func() (access.Request, bool, error) { return s.ByEmail(ctx, "ZIA@Example.Test") },
		"ByTokenHash": func() (access.Request, bool, error) { return s.ByTokenHash(ctx, "hash1") },
	} {
		r, ok, err := find()
		if err != nil || !ok || r.ID != got.ID || r.Email != "zia@example.test" || r.Name != "Zia" ||
			r.Picture != "https://lh3.googleusercontent.com/a/x" || !r.RequestedAt.Equal(now) || !r.ExpiresAt.Equal(now.Add(14*24*time.Hour)) {
			t.Errorf("%s = %+v, %v, %v", name, r, ok, err)
		}
	}
	if _, ok, _ := s.ByTokenHash(ctx, "other"); ok {
		t.Error("an unknown token hash must not match")
	}
	if _, ok, _ := s.ByEmail(ctx, "nobody@example.test"); ok {
		t.Error("an unknown email must not match")
	}
}

func TestAnAddressHasOnePendingRequest(t *testing.T) {
	s, _ := open(t)
	s.Insert(ctx, req("zia@example.test", now), "h1")
	if _, err := s.Insert(ctx, req("ZIA@example.test", now), "h2"); err == nil {
		t.Fatal("a second request for the same address (any case) must be refused by the schema")
	}
	if _, err := s.Insert(ctx, req("other@example.test", now), "h1"); err == nil {
		t.Fatal("a token hash must be unique")
	}
}

func TestRefreshKeepsRequestedAtAndExpiry(t *testing.T) {
	s, _ := open(t)
	r, _ := s.Insert(ctx, req("zia@example.test", now), "h1")
	later := now.Add(3 * time.Hour)
	if err := s.Refresh(ctx, r.ID, "Zia R.", "", "h2", later); err != nil {
		t.Fatal(err)
	}
	got, _, _ := s.ByID(ctx, r.ID)
	if got.Name != "Zia R." || got.Picture != "" || !got.LastSeenAt.Equal(later) || !got.RequestedAt.Equal(now) || !got.ExpiresAt.Equal(r.ExpiresAt) {
		t.Fatalf("after Refresh = %+v", got)
	}
	if _, ok, _ := s.ByTokenHash(ctx, "h1"); ok {
		t.Error("the old token hash must stop working")
	}
	if _, ok, _ := s.ByTokenHash(ctx, "h2"); !ok {
		t.Error("the new token hash must work")
	}
}

func TestListCountAndExpiry(t *testing.T) {
	s, _ := open(t)
	s.Insert(ctx, req("b@example.test", now.Add(time.Minute)), "h1")
	s.Insert(ctx, req("a@example.test", now), "h2")
	old := req("old@example.test", now.Add(-20*24*time.Hour))
	s.Insert(ctx, old, "h3")

	l, err := s.ListPending(ctx, now)
	if err != nil || len(l) != 2 || l[0].Email != "a@example.test" || l[1].Email != "b@example.test" {
		t.Fatalf("ListPending = %+v, %v (oldest first, expired excluded)", l, err)
	}
	if n, _ := s.CountPending(ctx, now); n != 2 {
		t.Fatalf("CountPending = %d", n)
	}
	gone, err := s.DeleteExpired(ctx, now)
	if err != nil || len(gone) != 1 || gone[0].Email != "old@example.test" {
		t.Fatalf("DeleteExpired = %+v, %v", gone, err)
	}
	if _, ok, _ := s.ByEmail(ctx, "old@example.test"); ok {
		t.Fatal("expired row must be deleted")
	}
	if err := s.Delete(ctx, l[0].ID); err != nil {
		t.Fatal(err)
	}
	if n, _ := s.CountPending(ctx, now); n != 1 {
		t.Fatalf("after Delete, count = %d", n)
	}
}

func TestEventsCountLastAndOrder(t *testing.T) {
	s, d := open(t)
	add := func(kind access.EventKind, email string, at time.Time, actor int64, actorEmail string) {
		t.Helper()
		if err := s.AddEvent(ctx, access.Event{At: at, Kind: kind, Email: email, Name: "Zia", ActorUserID: actor, ActorEmail: actorEmail}); err != nil {
			t.Fatal(err)
		}
	}
	add(access.EventRequested, "zia@example.test", now.Add(-8*24*time.Hour), 0, "")
	add(access.EventRequested, "zia@example.test", now.Add(-2*24*time.Hour), 0, "")
	add(access.EventDenied, "zia@example.test", now.Add(-time.Hour), 3, "user@example.test")
	add(access.EventRequested, "other@example.test", now, 0, "")

	if n, _ := s.CountEvents(ctx, "ZIA@example.test", access.EventRequested, now.Add(-7*24*time.Hour)); n != 1 {
		t.Fatalf("CountEvents in 7 days = %d, want 1", n)
	}
	at, ok, _ := s.LastEvent(ctx, "zia@example.test", access.EventDenied)
	if !ok || !at.Equal(now.Add(-time.Hour)) {
		t.Fatalf("LastEvent = %v, %v", at, ok)
	}
	if _, ok, _ := s.LastEvent(ctx, "other@example.test", access.EventDenied); ok {
		t.Fatal("no denial recorded for other")
	}
	ev, err := s.Events(ctx, 3)
	if err != nil || len(ev) != 3 || ev[0].Email != "other@example.test" || ev[1].Kind != access.EventDenied || ev[1].ActorEmail != "user@example.test" || ev[1].ActorUserID != 3 {
		t.Fatalf("Events = %+v, %v (newest first, capped)", ev, err)
	}
	// The audit trail must survive the actor being removed from the allowlist (no foreign key on the actor).
	if _, err := d.Exec(`DELETE FROM users WHERE email = 'user@example.test'`); err != nil {
		t.Fatal(err)
	}
	if ev, _ := s.Events(ctx, 10); len(ev) != 4 {
		t.Fatalf("events after removing the actor = %d, want 4", len(ev))
	}
}

// An approval that linked a Member keeps the Member's id and name in the audit trail (decision A3). This needs
// member_id / member_name columns on access_events (migration 1200 may be edited: nothing is released).
func TestAnApprovedEventKeepsTheLinkedMember(t *testing.T) {
	s, d := open(t)
	err := s.AddEvent(ctx, access.Event{At: now, Kind: access.EventApproved, Email: "zia@example.test", Name: "Zia",
		ActorUserID: 3, ActorEmail: "user@example.test", MemberID: 7, MemberName: "Nonna"})
	if err != nil {
		t.Fatal(err)
	}
	if err := s.AddEvent(ctx, access.Event{At: now.Add(time.Minute), Kind: access.EventApproved, Email: "rex@example.test", Name: "Rex",
		ActorUserID: 3, ActorEmail: "user@example.test"}); err != nil {
		t.Fatal(err)
	}
	ev, err := s.Events(ctx, 10)
	if err != nil || len(ev) != 2 {
		t.Fatalf("Events = %+v, %v", ev, err)
	}
	if ev[1].MemberID != 7 || ev[1].MemberName != "Nonna" {
		t.Errorf("linked approval = %+v, want Member 7 Nonna", ev[1])
	}
	if ev[0].MemberID != 0 || ev[0].MemberName != "" {
		t.Errorf("approval without a Member = %+v, want none", ev[0])
	}
	// Snapshot, no foreign key: the Member can be deleted afterwards.
	if _, err := d.Exec(`DELETE FROM members`); err != nil {
		t.Fatal(err)
	}
	if ev, _ := s.Events(ctx, 10); len(ev) != 2 || ev[1].MemberName != "Nonna" {
		t.Errorf("after the Member is deleted: %+v", ev)
	}
}
