package access_test

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/access"
)

// Review send-back (Opus): answering a request is atomic (decision A8), a request whose address is already a User is
// answered, never denied (A9), plus the audit and sign-in nits. Design note §12.

// race starts every fn at the same instant and waits for all of them.
func race(fns ...func()) {
	var ready, done sync.WaitGroup
	start := make(chan struct{})
	for _, fn := range fns {
		ready.Add(1)
		done.Add(1)
		go func() {
			defer done.Done()
			ready.Done()
			<-start
			fn()
		}()
	}
	ready.Wait()
	close(start)
	done.Wait()
}

// hookStore lets a test run code at a precise point of SignIn.
type hookStore struct {
	*memStore
	afterByEmail func()
	beforeInsert func()
}

func (h *hookStore) ByEmail(ctx context.Context, email string) (access.Request, bool, error) {
	r, ok, err := h.memStore.ByEmail(ctx, email)
	if h.afterByEmail != nil {
		h.afterByEmail()
	}
	return r, ok, err
}

func (h *hookStore) Insert(ctx context.Context, r access.Request, hash string) (access.Request, error) {
	if h.beforeInsert != nil {
		h.beforeInsert()
	}
	return h.memStore.Insert(ctx, r, hash)
}

// --- A8: approve and deny serialise ---

func TestApproveAndDenyAtTheSameTimeHaveExactlyOneOutcome(t *testing.T) {
	w := newWorld(t)
	w.store.delay = 10 * time.Millisecond
	for i, email := range []string{"a@example.test", "b@example.test", "c@example.test"} {
		req := w.signIn("1.1.1.1", ident(email, "Zia")).Request
		var aErr, dErr error
		race(
			func() { _, aErr = w.svc.Approve(ctx, req.ID, w.admin) },
			func() { dErr = w.svc.Deny(ctx, req.ID, w.user) },
		)
		approved, denied := aErr == nil, dErr == nil
		if approved == denied {
			t.Fatalf("round %d: approve err = %v, deny err = %v, want exactly one to win", i, aErr, dErr)
		}
		loser := dErr
		if denied {
			loser = aErr
		}
		if !errors.Is(loser, access.ErrNotFound) {
			t.Fatalf("round %d: the loser got %v, want ErrNotFound", i, loser)
		}
		_, userErr := w.users.UserByEmail(ctx, email)
		if approved != (userErr == nil) {
			t.Fatalf("round %d: approved = %v but the User exists = %v", i, approved, userErr == nil)
		}
		if a, d := w.store.count(access.EventApproved, email), w.store.count(access.EventDenied, email); a+d != 1 || (a == 1) != approved {
			t.Fatalf("round %d: %d approved and %d denied events for approved = %v", i, a, d, approved)
		}
	}
}

func TestTwoApprovalsAtTheSameTimeCreateOneUserAndOneEvent(t *testing.T) {
	w := newWorld(t)
	w.store.delay = 10 * time.Millisecond
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	before := w.users.size()
	var e1, e2 error
	race(
		func() { _, e1 = w.svc.Approve(ctx, req.ID, w.admin) },
		func() { _, e2 = w.svc.Approve(ctx, req.ID, w.user) },
	)
	if (e1 == nil) == (e2 == nil) || !(errors.Is(e1, access.ErrNotFound) || errors.Is(e2, access.ErrNotFound)) {
		t.Fatalf("errors = %v and %v, want one success and one ErrNotFound", e1, e2)
	}
	if got := w.users.size() - before; got != 1 {
		t.Fatalf("%d Users created, want 1", got)
	}
	if n := w.store.count(access.EventApproved, "zia@example.test"); n != 1 {
		t.Fatalf("%d approved events, want 1", n)
	}
}

func TestTwoDenialsAtTheSameTimeRecordOneEvent(t *testing.T) {
	w := newWorld(t)
	w.store.delay = 10 * time.Millisecond
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	var e1, e2 error
	race(
		func() { e1 = w.svc.Deny(ctx, req.ID, w.admin) },
		func() { e2 = w.svc.Deny(ctx, req.ID, w.user) },
	)
	if (e1 == nil) == (e2 == nil) || !(errors.Is(e1, access.ErrNotFound) || errors.Is(e2, access.ErrNotFound)) {
		t.Fatalf("errors = %v and %v, want one success and one ErrNotFound", e1, e2)
	}
	if n := w.store.count(access.EventDenied, "zia@example.test"); n != 1 {
		t.Fatalf("%d denied events, want 1", n)
	}
}

func TestApproveLinkedAndDenyAtTheSameTimeHaveExactlyOneOutcome(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	w.store.delay = 10 * time.Millisecond
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	var aErr, dErr error
	race(
		func() { _, aErr = w.svc.ApproveLinked(ctx, req.ID, w.admin, 7) },
		func() { dErr = w.svc.Deny(ctx, req.ID, w.user) },
	)
	if (aErr == nil) == (dErr == nil) {
		t.Fatalf("approve err = %v, deny err = %v, want exactly one to win", aErr, dErr)
	}
	a, d := w.store.count(access.EventApproved, "zia@example.test"), w.store.count(access.EventDenied, "zia@example.test")
	if a+d != 1 {
		t.Fatalf("%d approved and %d denied events, want one in all", a, d)
	}
	if (aErr == nil) != (len(w.members.links) == 1) {
		t.Fatalf("links = %v with approve err %v: the Member is linked only when the approval won", w.members.links, aErr)
	}
}

// A request that disappears between the read and the claim (a purge, or the other answer) is ErrNotFound and never
// creates a User or an event.
func TestAnApprovalLosingTheClaimCreatesNothing(t *testing.T) {
	w := newWorld(t)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	before := w.users.size()
	w.store.Delete(ctx, req.ID) // claimed by someone else behind the Service's back
	if _, err := w.svc.Approve(ctx, req.ID, w.admin); !errors.Is(err, access.ErrNotFound) {
		t.Fatalf("Approve = %v, want ErrNotFound", err)
	}
	if w.users.size() != before || w.store.count(access.EventApproved, "zia@example.test") != 0 {
		t.Fatal("a lost claim must create no User and no event")
	}
}

// --- A9: a request whose address is already a User ---

func TestDenyOfAnAddressThatIsAlreadyAUserClearsItWithoutADeniedEvent(t *testing.T) {
	w := newWorld(t)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	w.users.AddUser(ctx, "zia@example.test", "zia", false) // allowlisted (or half-approved) meanwhile
	if err := w.svc.Deny(ctx, req.ID, w.admin); !errors.Is(err, access.ErrAlreadyUser) {
		t.Fatalf("Deny = %v, want ErrAlreadyUser", err)
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("the request must be cleared, count = %d", n)
	}
	if n := w.store.count(access.EventDenied, "zia@example.test"); n != 0 {
		t.Fatalf("%d denied events for a User, want none", n)
	}
	if err := w.svc.Deny(ctx, req.ID, w.admin); !errors.Is(err, access.ErrNotFound) {
		t.Fatalf("a second deny = %v, want ErrNotFound", err)
	}
}

func TestListAndCountClearRequestsOfAddressesThatAreAlreadyUsers(t *testing.T) {
	w := newWorld(t)
	w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	w.signIn("1.1.1.2", ident("rex@example.test", "Rex"))
	w.users.AddUser(ctx, "zia@example.test", "zia", false)
	l, err := w.svc.List(ctx)
	if err != nil || len(l) != 1 || l[0].Email != "rex@example.test" {
		t.Fatalf("List = %+v, %v, want only Rex", l, err)
	}
	if n, _ := w.svc.Count(ctx); n != 1 {
		t.Fatalf("Count = %d, want 1", n)
	}
	if _, ok, _ := w.store.ByEmail(ctx, "zia@example.test"); ok {
		t.Fatal("the answered request must be deleted, not only hidden")
	}
	if n := w.store.count(access.EventDenied, "zia@example.test"); n != 0 {
		t.Fatalf("%d denied events, want none", n)
	}
}

func TestCountAloneAlsoDropsAnsweredRequests(t *testing.T) {
	w := newWorld(t)
	w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	w.users.AddUser(ctx, "zia@example.test", "zia", false)
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("Count = %d, the badge must not count a request of an existing User", n)
	}
}

// Decision A9b: when the new User cannot be linked, the approval still stands (the User exists, so it is audited) and
// the approver is told with 409 member_unavailable. Nothing is rolled back: a created User with no audit line is the
// bug being fixed.
func TestApproveLinkedWhenTheLinkFailsStillRecordsTheApprovalWithoutAMember(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	w.members.linkErr = access.ErrMemberUnavailable // another Admin linked Nonna between the check and the link
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	if _, err := w.svc.ApproveLinked(ctx, req.ID, w.user, 7); !errors.Is(err, access.ErrMemberUnavailable) {
		t.Fatalf("err = %v, want ErrMemberUnavailable", err)
	}
	if _, err := w.users.UserByEmail(ctx, "zia@example.test"); err != nil {
		t.Fatalf("the User was created and stays: %v", err)
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("the request is answered, count = %d", n)
	}
	e, ok := w.store.last(access.EventApproved, "zia@example.test")
	if !ok || e.ActorEmail != w.user.Email || e.MemberID != 0 || e.MemberName != "" {
		t.Fatalf("approved event = %+v (found %v), want one by %s with no Member", e, ok, w.user.Email)
	}
	if len(w.members.links) != 0 {
		t.Fatalf("links = %v", w.members.links)
	}
}

// --- nits ---

func TestPurgePrunesAuditEntriesOlderThanOneYear(t *testing.T) {
	w := newWorld(t)
	w.store.AddEvent(ctx, access.Event{At: t0.AddDate(-1, 0, -1), Kind: access.EventDenied, Email: "old@example.test"})
	w.store.AddEvent(ctx, access.Event{At: t0.AddDate(-1, 0, 1), Kind: access.EventDenied, Email: "recent@example.test"})
	if _, err := w.svc.Purge(ctx); err != nil {
		t.Fatal(err)
	}
	h, _ := w.svc.History(ctx, 10)
	if len(h) != 1 || h[0].Email != "recent@example.test" {
		t.Fatalf("history = %+v, want only the entry from under a year ago", h)
	}
}

func TestAMemberEmailSignInIsAuditedAndClearsAPendingRequest(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	w.signIn("1.1.1.1", ident("nonna@example.test", "Nonna Rosa")) // asked before an Admin gave Nonna her address
	w.members.byEmail["nonna@example.test"] = access.MemberRef{ID: 7, Name: "Nonna"}
	if d := w.signIn("1.1.1.1", ident("nonna@example.test", "Nonna Rosa")); d.Kind != access.SignedIn {
		t.Fatalf("decision = %+v", d)
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("the pending request must be cleared, count = %d", n)
	}
	e, ok := w.store.last(access.EventApproved, "nonna@example.test")
	if !ok || e.ActorUserID != 0 || e.ActorEmail != "" || e.MemberID != 7 || e.MemberName != "Nonna" {
		t.Fatalf("approved event = %+v (found %v), want an approval with no actor that names Member Nonna", e, ok)
	}
	if n := w.store.count(access.EventApproved, "nonna@example.test"); n != 1 {
		t.Fatalf("%d approved events, want 1", n)
	}
}

func TestAMemberEmailSignInWithoutARequestIsAuditedToo(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	w.members.byEmail["sam@example.test"] = access.MemberRef{ID: 8, Name: "Sam"}
	w.signIn("1.1.1.1", ident("sam@example.test", "Sam"))
	if e, ok := w.store.last(access.EventApproved, "sam@example.test"); !ok || e.MemberID != 8 {
		t.Fatalf("approved event = %+v (found %v)", e, ok)
	}
}

func TestTwoFirstSignInsOfANewAddressBothGetPending(t *testing.T) {
	w := newWorld(t)
	var d1, d2 access.Decision
	var e1, e2 error
	race(
		func() { d1, e1 = w.svc.SignIn(ctx, "1.1.1.1", ident("zia@example.test", "Zia")) },
		func() { d2, e2 = w.svc.SignIn(ctx, "1.1.1.2", ident("zia@example.test", "Zia")) },
	)
	if e1 != nil || e2 != nil || d1.Kind != access.Pending || d2.Kind != access.Pending {
		t.Fatalf("decisions = %+v / %+v, errors = %v / %v, want Pending for both", d1, d2, e1, e2)
	}
	if l, _ := w.svc.List(ctx); len(l) != 1 {
		t.Fatalf("%d requests, want 1", len(l))
	}
	if n := w.store.count(access.EventRequested, "zia@example.test"); n != 1 {
		t.Fatalf("%d requested events, want 1", n)
	}
	if len(w.pushed) != 1 {
		t.Fatalf("%d notifications, want 1", len(w.pushed))
	}
}

// The loser of the UNIQUE conflict re-reads the winner's request and continues as a repeat sign-in: its token works.
func TestALostInsertRaceFallsBackToTheExistingRequest(t *testing.T) {
	w := newWorld(t)
	hs := &hookStore{memStore: w.store}
	hs.beforeInsert = func() { // another browser's request for the same address lands first
		hs.beforeInsert = nil
		w.store.Insert(ctx, access.Request{Email: "zia@example.test", Name: "Zia", RequestedAt: t0, LastSeenAt: t0, ExpiresAt: t0.Add(14 * 24 * time.Hour)}, "winner-hash")
	}
	svc := access.NewService(hs, w.users, w.members, w.clk, access.DefaultLimits())
	var pushed int
	svc.OnRequested(func(access.Request) { pushed++ })
	d, err := svc.SignIn(ctx, "1.1.1.1", ident("zia@example.test", "Zia"))
	if err != nil || d.Kind != access.Pending || d.Token == "" {
		t.Fatalf("SignIn = %+v, %v, want Pending with a token", d, err)
	}
	if st, _ := svc.Status(ctx, d.Token); st.State != "pending" {
		t.Fatalf("the loser's token must work, status = %+v", st)
	}
	if pushed != 0 {
		t.Fatalf("the loser notified %d times, only the creator does", pushed)
	}
	if n := w.store.count(access.EventRequested, "zia@example.test"); n != 0 {
		t.Fatalf("the loser recorded %d requested events", n)
	}
}

// An expired request is removed and logged by whoever deletes it, once.
func TestAnExpiredRequestIsLoggedOnceEvenWhenSignInAndPurgeMeet(t *testing.T) {
	w := newWorld(t)
	w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	w.clk.Advance(15 * 24 * time.Hour)
	hs := &hookStore{memStore: w.store}
	svc := access.NewService(hs, w.users, w.members, w.clk, access.DefaultLimits())
	hs.afterByEmail = func() { // SignIn has just read the expired row; the daily purge runs before SignIn removes it
		hs.afterByEmail = nil
		if _, err := svc.Purge(ctx); err != nil {
			t.Error(err)
		}
	}
	if d, err := svc.SignIn(ctx, "1.1.1.1", ident("zia@example.test", "Zia")); err != nil || d.Kind != access.Pending {
		t.Fatalf("SignIn = %+v, %v", d, err)
	}
	if n := w.store.count(access.EventExpired, "zia@example.test"); n != 1 {
		t.Fatalf("%d expired events, want 1", n)
	}
}

func TestPurgingTwiceLogsExpiredOnce(t *testing.T) {
	w := newWorld(t)
	w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	w.clk.Advance(15 * 24 * time.Hour)
	for range 2 {
		w.svc.Purge(ctx)
	}
	if n := w.store.count(access.EventExpired, "zia@example.test"); n != 1 {
		t.Fatalf("%d expired events, want 1", n)
	}
}
