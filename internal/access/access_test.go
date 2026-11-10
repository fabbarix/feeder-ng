package access_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/access"
	"github.com/fabbarix/feeder-ng/internal/auth"
)

var ctx = context.Background()

func TestDefaultLimitsAreTheDesignDefaults(t *testing.T) {
	l := access.DefaultLimits()
	want := access.Limits{TTL: 14 * 24 * time.Hour, MaxPending: 50, PerIPPerHour: 10, PerEmailPerWeek: 3, DenyCooldown: 24 * time.Hour}
	if l != want {
		t.Fatalf("DefaultLimits = %+v, want %+v", l, want)
	}
}

// --- who gets in without asking ---

func TestAPreAddedAddressSignsInAndCreatesNoRequest(t *testing.T) {
	w := newWorld(t)
	w.users.AddUser(ctx, "nonna@example.test", "nonna", false)
	d := w.signIn("1.1.1.1", ident("Nonna@Example.Test", "Nonna"))
	if d.Kind != access.SignedIn || d.User.Email != "nonna@example.test" {
		t.Fatalf("decision = %+v", d)
	}
	if n, _ := w.svc.Count(ctx); n != 0 || len(w.store.kinds()) != 0 || len(w.pushed) != 0 {
		t.Fatalf("a User's sign-in must leave no request, event or push (count %d, events %v)", n, w.store.kinds())
	}
}

func TestAPreAddedUserIsNeverThrottled(t *testing.T) {
	w := newWorld(t, func(l *access.Limits) { l.PerIPPerHour = 1; l.MaxPending = 1 })
	w.signIn("9.9.9.9", ident("a@example.test", "A")) // fills the queue and the IP's quota
	for range 5 {
		if d := w.signIn("9.9.9.9", ident(w.user.Email, "User")); d.Kind != access.SignedIn {
			t.Fatalf("a User behind a throttled IP and a full queue = %+v", d)
		}
	}
}

func TestAMemberLinkedAddressBecomesAUserLinkedToTheMemberAndSignsIn(t *testing.T) {
	w := newWorld(t)
	w.members.byEmail["nonna@example.test"] = access.MemberRef{ID: 7, Name: "Nonna"}
	d := w.signIn("1.1.1.1", ident("Nonna@example.test", "Nonna Rossi"))
	if d.Kind != access.SignedIn || d.User.Email != "nonna@example.test" || d.User.IsAdmin {
		t.Fatalf("decision = %+v", d)
	}
	if w.members.links[7] != d.User.ID {
		t.Fatalf("Member 7 must be linked to the new User %d, links = %v", d.User.ID, w.members.links)
	}
	if _, err := w.users.UserByEmail(ctx, "nonna@example.test"); err != nil {
		t.Fatalf("the Member's address must now be a User: %v", err)
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("no Access Request for a Member's address, count = %d", n)
	}
}

func TestAMemberLinkedAddressStillNeedsAVerifiedEmail(t *testing.T) {
	w := newWorld(t)
	w.members.byEmail["nonna@example.test"] = access.MemberRef{ID: 7, Name: "Nonna"}
	id := ident("nonna@example.test", "Nonna")
	id.EmailVerified = false
	if d := w.signIn("1.1.1.1", id); d.Kind != access.Unverified {
		t.Fatalf("decision = %+v, want Unverified", d)
	}
	if _, err := w.users.UserByEmail(ctx, "nonna@example.test"); err == nil || len(w.members.links) != 0 {
		t.Fatal("an unverified address must not become a User or be linked")
	}
}

func TestAnUnverifiedUserAddressDoesNotSignIn(t *testing.T) {
	w := newWorld(t)
	id := ident(w.user.Email, "User")
	id.EmailVerified = false
	if d := w.signIn("1.1.1.1", id); d.Kind != access.Unverified {
		t.Fatalf("decision = %+v, want Unverified", d)
	}
}

// --- unknown accounts ---

func TestAnUnverifiedUnknownAddressIsRefusedWithoutARequest(t *testing.T) {
	w := newWorld(t)
	id := ident("stranger@example.test", "Stranger")
	id.EmailVerified = false
	if d := w.signIn("1.1.1.1", id); d.Kind != access.Unverified {
		t.Fatalf("decision = %+v, want Unverified", d)
	}
	if n, _ := w.svc.Count(ctx); n != 0 || len(w.store.kinds()) != 0 || len(w.pushed) != 0 {
		t.Fatal("an unverified address must leave no request, event or push")
	}
}

func TestAMalformedAddressIsRefusedWithoutARequest(t *testing.T) {
	w := newWorld(t)
	for _, e := range []string{"not-an-email", "a b@example.test", "x@@example.test", ""} {
		d, err := w.svc.SignIn(ctx, "1.1.1.1", ident(e, "X"))
		if err != nil || d.Kind != access.Unverified {
			t.Errorf("%q: decision %+v, err %v; want Unverified", e, d, err)
		}
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("count = %d", n)
	}
}

func TestAnUnknownVerifiedAddressBecomesAPendingRequest(t *testing.T) {
	w := newWorld(t)
	d := w.signIn("1.1.1.1", ident("  Zia@Example.Test ", "Zia Rosa"))
	if d.Kind != access.Pending || d.Token == "" {
		t.Fatalf("decision = %+v", d)
	}
	r := d.Request
	if r.Email != "zia@example.test" || r.Name != "Zia Rosa" || r.Picture != "https://lh3.googleusercontent.com/a/photo" {
		t.Fatalf("request = %+v", r)
	}
	if !r.RequestedAt.Equal(t0) || !r.ExpiresAt.Equal(t0.Add(14*24*time.Hour)) {
		t.Fatalf("times = %v .. %v", r.RequestedAt, r.ExpiresAt)
	}
	if _, err := w.users.UserByEmail(ctx, "zia@example.test"); err == nil {
		t.Fatal("asking must not add the person as a User")
	}
	if got := w.store.kinds(); len(got) != 1 || got[0] != access.EventRequested {
		t.Fatalf("events = %v", got)
	}
	if len(w.pushed) != 1 || w.pushed[0].Email != "zia@example.test" {
		t.Fatalf("OnRequested calls = %+v", w.pushed)
	}
	// Only a hash of the token is stored.
	for _, h := range w.store.hashes {
		if h == d.Token || h == "" {
			t.Fatalf("stored token hash %q must be a hash, not the token", h)
		}
	}
}

func TestRepeatSignInsDoNotDuplicateTheRequest(t *testing.T) {
	w := newWorld(t)
	first := w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	w.clk.Advance(3 * time.Hour)
	again := ident("ZIA@example.test", "Zia R.")
	again.Picture = ""
	second := w.signIn("1.1.1.1", again)
	if second.Kind != access.Pending || second.Request.ID != first.Request.ID {
		t.Fatalf("second = %+v, first = %+v", second, first)
	}
	list, _ := w.svc.List(ctx)
	if len(list) != 1 {
		t.Fatalf("%d requests, want 1", len(list))
	}
	got := list[0]
	if got.Name != "Zia R." || got.Picture != "" || !got.LastSeenAt.Equal(t0.Add(3*time.Hour)) {
		t.Fatalf("refreshed request = %+v", got)
	}
	if !got.RequestedAt.Equal(t0) || !got.ExpiresAt.Equal(t0.Add(14*24*time.Hour)) {
		t.Fatalf("a repeat sign-in must not move RequestedAt or ExpiresAt: %+v", got)
	}
	if len(w.pushed) != 1 || len(w.store.kinds()) != 1 {
		t.Fatalf("a repeat sign-in must not notify or log again: pushed %d, events %v", len(w.pushed), w.store.kinds())
	}
	// The waiting page works with the newest token; the old one stops working.
	if st, _ := w.svc.Status(ctx, second.Token); st.State != "pending" {
		t.Fatalf("status with the new token = %+v", st)
	}
	if st, _ := w.svc.Status(ctx, first.Token); st.State != "none" {
		t.Fatalf("status with the replaced token = %+v", st)
	}
}

func TestAnUnverifiedSignInDoesNotRefreshAPendingRequest(t *testing.T) {
	w := newWorld(t)
	w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	w.clk.Advance(time.Hour)
	id := ident("zia@example.test", "Hacker")
	id.EmailVerified = false
	if d := w.signIn("1.1.1.1", id); d.Kind != access.Unverified {
		t.Fatalf("decision = %+v", d)
	}
	list, _ := w.svc.List(ctx)
	if len(list) != 1 || list[0].Name != "Zia" {
		t.Fatalf("list = %+v", list)
	}
}

func TestCleanName(t *testing.T) {
	long := strings.Repeat("é", 150)
	cases := []struct{ name, email, want string }{
		{"  Zia Rosa  ", "zia@example.test", "Zia Rosa"},
		{"Zia\n\tRosa\x00", "zia@example.test", "ZiaRosa"},
		{"", "zia@example.test", "zia"},
		{"   ", "zia@example.test", "zia"},
		{long, "zia@example.test", strings.Repeat("é", 100)},
		{"<script>alert(1)</script>", "zia@example.test", "<script>alert(1)</script>"}, // stored as text; React escapes it
	}
	for _, c := range cases {
		if got := access.CleanName(c.name, c.email); got != c.want {
			t.Errorf("CleanName(%q) = %q, want %q", c.name, got, c.want)
		}
	}
}

func TestCleanPictureKeepsOnlyHTTPSGoogleAvatars(t *testing.T) {
	cases := map[string]string{
		"https://lh3.googleusercontent.com/a/abc=s96-c": "https://lh3.googleusercontent.com/a/abc=s96-c",
		"http://lh3.googleusercontent.com/a/abc":        "",
		"https://evil.example/a.png":                    "",
		"https://googleusercontent.com.evil.example/a":  "",
		"javascript:alert(1)":                           "",
		"data:image/png;base64,AAAA":                    "",
		"":                                              "",
		"https://lh3.googleusercontent.com/" + strings.Repeat("a", 600): "",
	}
	for in, want := range cases {
		if got := access.CleanPicture(in); got != want {
			t.Errorf("CleanPicture(%.60q) = %q, want %q", in, got, want)
		}
	}
}

func TestStoredFieldsAreCleaned(t *testing.T) {
	w := newWorld(t)
	id := ident("zia@example.test", "Zia\x00 Rosa")
	id.Picture = "https://evil.example/x.png"
	d := w.signIn("1.1.1.1", id)
	if d.Request.Name != "Zia Rosa" || d.Request.Picture != "" {
		t.Fatalf("request = %+v", d.Request)
	}
}

// --- approve and deny ---

func TestApproveAddsTheUserRemovesTheRequestAndRecordsWho(t *testing.T) {
	w := newWorld(t)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia Rosa")).Request
	w.clk.Advance(time.Hour)
	u, err := w.svc.Approve(ctx, req.ID, w.user) // a plain User approves
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "zia@example.test" || u.DisplayName != "Zia Rosa" || u.IsAdmin {
		t.Fatalf("new User = %+v (must be a non-Admin named after Google)", u)
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("count = %d after approval", n)
	}
	h, _ := w.svc.History(ctx, 10)
	if len(h) < 1 || h[0].Kind != access.EventApproved || h[0].Email != "zia@example.test" ||
		h[0].ActorUserID != w.user.ID || h[0].ActorEmail != w.user.Email || !h[0].At.Equal(t0.Add(time.Hour)) {
		t.Fatalf("history = %+v", h)
	}
	// The next sign-in goes straight in.
	if d := w.signIn("1.1.1.1", ident("zia@example.test", "Zia Rosa")); d.Kind != access.SignedIn {
		t.Fatalf("after approval, decision = %+v", d)
	}
}

func TestApproveNeedsNoAdminRole(t *testing.T) {
	w := newWorld(t)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	plain := auth.User{ID: 99, Email: "plain@example.test", IsAdmin: false}
	if _, err := w.svc.Approve(ctx, req.ID, plain); err != nil {
		t.Fatalf("a non-Admin User must be able to approve: %v", err)
	}
}

func TestApproveAnUnknownOrExpiredRequestIsNotFound(t *testing.T) {
	w := newWorld(t)
	if _, err := w.svc.Approve(ctx, 404, w.user); !errors.Is(err, access.ErrNotFound) {
		t.Fatalf("unknown: %v", err)
	}
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	w.clk.Advance(14*24*time.Hour + time.Second)
	if _, err := w.svc.Approve(ctx, req.ID, w.user); !errors.Is(err, access.ErrNotFound) {
		t.Fatalf("expired: %v", err)
	}
	if _, err := w.users.UserByEmail(ctx, "zia@example.test"); err == nil {
		t.Fatal("an expired request must not add a User")
	}
}

func TestApproveWhenTheAddressWasAddedMeanwhileJustClearsTheRequest(t *testing.T) {
	w := newWorld(t)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	w.users.AddUser(ctx, "zia@example.test", "zia", false) // an Admin added them to the allowlist first
	if _, err := w.svc.Approve(ctx, req.ID, w.user); err != nil {
		t.Fatalf("approve after a manual add: %v", err)
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("count = %d", n)
	}
}

// --- approve with "link to Member" (decision A3: one step, any User approves) ---

// withMembers puts Nonna (7) and Sam (8) in the Household, both without a User.
func withMembers(w *world) {
	w.members.all = []access.MemberRef{{ID: 7, Name: "Nonna"}, {ID: 8, Name: "Sam"}}
}

func TestApproveLinkedAddsTheUserAndLinksTheChosenMember(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia Rosa")).Request
	w.clk.Advance(time.Hour)
	plain := auth.User{ID: 99, Email: "plain@example.test"} // a non-Admin approves
	u, err := w.svc.ApproveLinked(ctx, req.ID, plain, 7)
	if err != nil {
		t.Fatal(err)
	}
	if u.Email != "zia@example.test" || u.IsAdmin || u.DisplayName != "Zia Rosa" {
		t.Fatalf("new User = %+v", u)
	}
	if w.members.links[7] != u.ID || len(w.members.links) != 1 {
		t.Fatalf("Member 7 must be linked to User %d, links = %v", u.ID, w.members.links)
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("count = %d after approval", n)
	}
	h, _ := w.svc.History(ctx, 10)
	if len(h) < 1 || h[0].Kind != access.EventApproved || h[0].ActorEmail != plain.Email || h[0].MemberID != 7 || h[0].MemberName != "Nonna" {
		t.Fatalf("the audit event must name the approver and the linked Member: %+v", h)
	}
}

func TestApproveWithoutAMemberStillWorksAndLinksNothing(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	if _, err := w.svc.Approve(ctx, req.ID, w.user); err != nil {
		t.Fatal(err)
	}
	if len(w.members.links) != 0 {
		t.Fatalf("no Member was chosen, links = %v", w.members.links)
	}
	if h, _ := w.svc.History(ctx, 1); len(h) != 1 || h[0].MemberID != 0 || h[0].MemberName != "" {
		t.Fatalf("an approval without a Member records none: %+v", h)
	}
}

func TestApproveLinkedRefusesAMemberWhoAlreadyHasAUser(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	w.members.links[8] = w.user.ID // Sam is linked
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	_, err := w.svc.ApproveLinked(ctx, req.ID, w.user, 8)
	if !errors.Is(err, access.ErrMemberUnavailable) {
		t.Fatalf("linked Member: err = %v, want ErrMemberUnavailable", err)
	}
	if _, err := w.users.UserByEmail(ctx, "zia@example.test"); err == nil {
		t.Fatal("a refused link must not create the User")
	}
	if n, _ := w.svc.Count(ctx); n != 1 {
		t.Fatalf("the request must stay pending, count = %d", n)
	}
	if len(w.store.kinds()) != 1 { // only "requested"
		t.Fatalf("nothing is audited for a refusal: %v", w.store.kinds())
	}
}

func TestApproveLinkedRefusesAnUnknownMemberAndWorksWithoutAMembersPort(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	for _, id := range []int64{0, -1, 999} {
		if _, err := w.svc.ApproveLinked(ctx, req.ID, w.user, id); !errors.Is(err, access.ErrMemberUnavailable) {
			t.Errorf("Member %d: err = %v, want ErrMemberUnavailable", id, err)
		}
	}
	// Phase 1 runs with no Members port at all: a Member cannot be chosen, but approving still works.
	bare := access.NewService(w.store, w.users, nil, w.clk, access.DefaultLimits())
	if _, err := bare.ApproveLinked(ctx, req.ID, w.user, 7); !errors.Is(err, access.ErrMemberUnavailable) {
		t.Errorf("no Members port: err = %v, want ErrMemberUnavailable", err)
	}
	if _, err := bare.Approve(ctx, req.ID, w.user); err != nil {
		t.Errorf("Approve without a Members port: %v", err)
	}
}

// (moved to answer_test.go: a failed link after the User was created is audited, decision A9b)

func TestApproveLinkedOfAnUnknownOrExpiredRequestIsNotFound(t *testing.T) {
	w := newWorld(t)
	withMembers(w)
	if _, err := w.svc.ApproveLinked(ctx, 404, w.user, 7); !errors.Is(err, access.ErrNotFound) {
		t.Fatalf("unknown: %v", err)
	}
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	w.clk.Advance(14*24*time.Hour + time.Second)
	if _, err := w.svc.ApproveLinked(ctx, req.ID, w.user, 7); !errors.Is(err, access.ErrNotFound) {
		t.Fatalf("expired: %v", err)
	}
	if len(w.members.links) != 0 {
		t.Fatalf("links = %v", w.members.links)
	}
}

// --- Member email must not hijack a User (decision A1; the household side is in internal/access/httpapi/member_email_test.go) ---

// Regression guard (green today): the User row wins over a Member email.
func TestAMemberEmailThatAlreadyBelongsToAUserSignsInAsThatUser(t *testing.T) {
	w := newWorld(t)
	w.members.byEmail[w.user.Email] = access.MemberRef{ID: 7, Name: "Nonna"} // must not happen (the API refuses it), but sign-in must still be safe
	d := w.signIn("1.1.1.1", ident(w.user.Email, "Someone Else"))
	if d.Kind != access.SignedIn || d.User.ID != w.user.ID {
		t.Fatalf("decision = %+v, want the existing User %d", d, w.user.ID)
	}
	if len(w.members.links) != 0 {
		t.Fatalf("the Member must not be linked to an existing User through its email: %v", w.members.links)
	}
}

func TestDenyRemovesTheRequestAndRecordsWho(t *testing.T) {
	w := newWorld(t)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	if err := w.svc.Deny(ctx, req.ID, w.admin); err != nil {
		t.Fatal(err)
	}
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("count = %d", n)
	}
	if _, err := w.users.UserByEmail(ctx, "zia@example.test"); err == nil {
		t.Fatal("a denied address must not be a User")
	}
	h, _ := w.svc.History(ctx, 10)
	if len(h) < 1 || h[0].Kind != access.EventDenied || h[0].ActorEmail != w.admin.Email || h[0].Email != "zia@example.test" {
		t.Fatalf("history = %+v", h)
	}
	if err := w.svc.Deny(ctx, req.ID, w.admin); !errors.Is(err, access.ErrNotFound) {
		t.Fatalf("second deny = %v, want ErrNotFound", err)
	}
}

func TestADeniedAddressMustWaitBeforeAskingAgain(t *testing.T) {
	w := newWorld(t)
	req := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")).Request
	w.svc.Deny(ctx, req.ID, w.user)
	w.clk.Advance(2 * time.Hour)
	d := w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	if d.Kind != access.Limited || d.RetryAfter != 22*time.Hour {
		t.Fatalf("within the cooldown: %+v (RetryAfter want 22h)", d)
	}
	if n, _ := w.svc.Count(ctx); n != 0 || len(w.pushed) != 1 {
		t.Fatalf("a limited sign-in must create nothing: count %d, pushes %d", n, len(w.pushed))
	}
	w.clk.Advance(22 * time.Hour)
	d = w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	if d.Kind != access.Pending {
		t.Fatalf("after the cooldown: %+v", d)
	}
	if len(w.pushed) != 2 {
		t.Fatalf("the new request must notify again, pushes = %d", len(w.pushed))
	}
}

func TestAnAddressMayCreateAtMostThreeRequestsAWeek(t *testing.T) {
	w := newWorld(t)
	for i := range 3 {
		d := w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
		if d.Kind != access.Pending {
			t.Fatalf("request %d = %+v", i+1, d)
		}
		w.svc.Deny(ctx, d.Request.ID, w.user)
		w.clk.Advance(25 * time.Hour)
	}
	d := w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	if d.Kind != access.Limited || d.RetryAfter <= 0 || d.RetryAfter > 7*24*time.Hour {
		t.Fatalf("4th request in a week = %+v", d)
	}
	w.clk.Advance(5 * 24 * time.Hour) // the first request is now more than 7 days old
	if d := w.signIn("1.1.1.1", ident("zia@example.test", "Zia")); d.Kind != access.Pending {
		t.Fatalf("after the window = %+v", d)
	}
}

// --- floods ---

func TestOneIPCannotFloodTheQueue(t *testing.T) {
	w := newWorld(t)
	for i := range 10 {
		if d := w.signIn("5.5.5.5", ident(strings.Repeat("a", i+1)+"@example.test", "X")); d.Kind != access.Pending {
			t.Fatalf("submission %d = %+v", i+1, d)
		}
	}
	d := w.signIn("5.5.5.5", ident("onemore@example.test", "X"))
	if d.Kind != access.Limited || d.RetryAfter <= 0 || d.RetryAfter > time.Hour {
		t.Fatalf("11th submission in an hour = %+v", d)
	}
	if n, _ := w.svc.Count(ctx); n != 10 {
		t.Fatalf("count = %d, want 10", n)
	}
	if d := w.signIn("6.6.6.6", ident("onemore@example.test", "X")); d.Kind != access.Pending {
		t.Fatalf("another IP = %+v", d)
	}
	w.clk.Advance(61 * time.Minute)
	if d := w.signIn("5.5.5.5", ident("later@example.test", "X")); d.Kind != access.Pending {
		t.Fatalf("an hour later = %+v", d)
	}
}

func TestRefreshesCountTowardsTheIPLimit(t *testing.T) {
	w := newWorld(t, func(l *access.Limits) { l.PerIPPerHour = 3 })
	for range 3 {
		w.signIn("5.5.5.5", ident("zia@example.test", "Zia"))
	}
	if d := w.signIn("5.5.5.5", ident("zia@example.test", "Zia")); d.Kind != access.Limited {
		t.Fatalf("4th = %+v", d)
	}
}

func TestTheQueueHasAGlobalCap(t *testing.T) {
	w := newWorld(t, func(l *access.Limits) { l.MaxPending = 3 })
	var ids []int64
	for i, e := range []string{"a", "b", "c"} {
		d := w.signIn("10.0.0."+string(rune('1'+i)), ident(e+"@example.test", e))
		ids = append(ids, d.Request.ID)
	}
	if d := w.signIn("10.0.0.9", ident("d@example.test", "d")); d.Kind != access.QueueFull {
		t.Fatalf("4th = %+v, want QueueFull", d)
	}
	if n, _ := w.svc.Count(ctx); n != 3 {
		t.Fatalf("count = %d", n)
	}
	if d := w.signIn("10.0.0.1", ident("a@example.test", "a")); d.Kind != access.Pending {
		t.Fatalf("a request already in the queue must still refresh: %+v", d)
	}
	w.svc.Deny(ctx, ids[0], w.user)
	if d := w.signIn("10.0.0.9", ident("d@example.test", "d")); d.Kind != access.Pending {
		t.Fatalf("after room is made = %+v", d)
	}
}

func TestAFullQueueDoesNotBlockUsers(t *testing.T) {
	w := newWorld(t, func(l *access.Limits) { l.MaxPending = 1 })
	w.signIn("1.1.1.1", ident("a@example.test", "a"))
	if d := w.signIn("2.2.2.2", ident(w.user.Email, "User")); d.Kind != access.SignedIn {
		t.Fatalf("decision = %+v", d)
	}
}

// --- expiry ---

func TestPendingRequestsExpireAfterFourteenDays(t *testing.T) {
	w := newWorld(t)
	d := w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	w.clk.Advance(14*24*time.Hour - time.Second)
	if n, _ := w.svc.Count(ctx); n != 1 {
		t.Fatalf("one second before expiry, count = %d", n)
	}
	w.clk.Advance(time.Second)
	if n, _ := w.svc.Count(ctx); n != 0 {
		t.Fatalf("at expiry, count = %d", n)
	}
	if l, _ := w.svc.List(ctx); len(l) != 0 {
		t.Fatalf("at expiry, list = %+v", l)
	}
	if st, _ := w.svc.Status(ctx, d.Token); st.State != "none" {
		t.Fatalf("status of an expired request = %+v", st)
	}
}

func TestPurgeRemovesExpiredRequestsAndLogsThem(t *testing.T) {
	w := newWorld(t)
	w.signIn("1.1.1.1", ident("old@example.test", "Old"))
	w.clk.Advance(10 * 24 * time.Hour)
	w.signIn("1.1.1.1", ident("fresh@example.test", "Fresh"))
	w.clk.Advance(5 * 24 * time.Hour) // old is 15 days, fresh is 5
	n, err := w.svc.Purge(ctx)
	if err != nil || n != 1 {
		t.Fatalf("Purge = %d, %v", n, err)
	}
	if _, ok, _ := w.store.ByEmail(ctx, "old@example.test"); ok {
		t.Fatal("expired row must be gone")
	}
	if l, _ := w.svc.List(ctx); len(l) != 1 || l[0].Email != "fresh@example.test" {
		t.Fatalf("list = %+v", l)
	}
	h, _ := w.svc.History(ctx, 10)
	if h[0].Kind != access.EventExpired || h[0].Email != "old@example.test" || h[0].ActorEmail != "" {
		t.Fatalf("history = %+v", h)
	}
}

func TestAnExpiredAddressMayRequestAgain(t *testing.T) {
	w := newWorld(t)
	w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	w.clk.Advance(15 * 24 * time.Hour) // not purged yet: the sign-in itself clears the stale row
	d := w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	if d.Kind != access.Pending || !d.Request.ExpiresAt.Equal(w.clk.Now().Add(14*24*time.Hour)) {
		t.Fatalf("decision = %+v", d)
	}
	if l, _ := w.svc.List(ctx); len(l) != 1 {
		t.Fatalf("list = %+v", l)
	}
}

// --- listing, status, history ---

func TestListIsOldestFirstAndCountMatches(t *testing.T) {
	w := newWorld(t)
	for _, e := range []string{"b", "a", "c"} {
		w.signIn("1.1.1.1", ident(e+"@example.test", e))
		w.clk.Advance(time.Minute)
	}
	l, _ := w.svc.List(ctx)
	if len(l) != 3 || l[0].Email != "b@example.test" || l[2].Email != "c@example.test" {
		t.Fatalf("list = %+v", l)
	}
	if n, _ := w.svc.Count(ctx); n != 3 {
		t.Fatalf("count = %d", n)
	}
}

func TestStatusTellsTheVisitorOnlyWhatGoogleSaid(t *testing.T) {
	w := newWorld(t)
	d := w.signIn("1.1.1.1", ident("zia@example.test", "Zia"))
	st, err := w.svc.Status(ctx, d.Token)
	if err != nil || st.State != "pending" || st.Email != "zia@example.test" || st.Name != "Zia" || !st.RequestedAt.Equal(t0) {
		t.Fatalf("status = %+v, %v", st, err)
	}
	for _, tok := range []string{"", "nope", d.Token + "x"} {
		if st, _ := w.svc.Status(ctx, tok); st.State != "none" || st.Email != "" || st.Name != "" {
			t.Errorf("status(%q) = %+v, want none and no details", tok, st)
		}
	}
	w.svc.Approve(ctx, d.Request.ID, w.user)
	if st, _ := w.svc.Status(ctx, d.Token); st.State != "none" {
		t.Fatalf("after approval, status = %+v (the visitor then simply signs in again)", st)
	}
}

func TestHistoryIsNewestFirstAndCapped(t *testing.T) {
	w := newWorld(t)
	a := w.signIn("1.1.1.1", ident("a@example.test", "A")).Request
	w.clk.Advance(time.Minute)
	w.svc.Approve(ctx, a.ID, w.user)
	w.clk.Advance(time.Minute)
	b := w.signIn("1.1.1.1", ident("b@example.test", "B")).Request
	w.svc.Deny(ctx, b.ID, w.admin)
	h, _ := w.svc.History(ctx, 3)
	if len(h) != 3 || h[0].Kind != access.EventDenied || h[1].Kind != access.EventRequested || h[2].Kind != access.EventApproved {
		t.Fatalf("history = %+v", h)
	}
}

// --- client IP ---

func TestClientIP(t *testing.T) {
	cases := []struct {
		remote, xff string
		trust       bool
		want        string
	}{
		{"203.0.113.9:51234", "", false, "203.0.113.9"},
		{"203.0.113.9:51234", "198.51.100.1", false, "203.0.113.9"}, // not trusted: header ignored
		{"10.0.0.2:4000", "198.51.100.1", true, "198.51.100.1"},
		{"10.0.0.2:4000", "6.6.6.6, 198.51.100.1", true, "198.51.100.1"}, // the proxy appended the last one; earlier ones are client-supplied
		{"10.0.0.2:4000", "", true, "10.0.0.2"},
		// IPv6 clients are bucketed per /64 (one subscriber holds a whole /64): the key is the network in CIDR form.
		{"[2001:db8::1]:443", "", false, "2001:db8::/64"},
		{"[2001:db8:1:2:aaaa:bbbb:cccc:dddd]:443", "", false, "2001:db8:1:2::/64"},
		{"[2001:db8:1:2:1111:2222:3333:4444]:443", "", false, "2001:db8:1:2::/64"},
		{"[2001:db8:1:3::1]:443", "", false, "2001:db8:1:3::/64"},
		{"10.0.0.2:4000", "2001:db8:1:2:aaaa:bbbb:cccc:dddd", true, "2001:db8:1:2::/64"},
		{"[::ffff:203.0.113.9]:443", "", false, "203.0.113.9"}, // an IPv4-mapped peer is an IPv4 client
		{"10.0.0.2:4000", "6.6.6.6,198.51.100.1", true, "198.51.100.1"},
		{"10.0.0.2:4000", "6.6.6.6, 7.7.7.7,198.51.100.1", true, "198.51.100.1"},
		{"10.0.0.2:4000", "not an ip", true, "10.0.0.2"},
	}
	for _, c := range cases {
		if got := access.ClientIP(c.remote, c.xff, c.trust); got != c.want {
			t.Errorf("ClientIP(%q, %q, %v) = %q, want %q", c.remote, c.xff, c.trust, got, c.want)
		}
	}
}

// The handler joins every X-Forwarded-For header line (Header.Get would return only the first, which the client
// wrote): proxies such as HAProxy and Envoy append their own line.
func TestJoinForwardedForKeepsEveryHeaderLineInOrder(t *testing.T) {
	cases := []struct {
		lines []string
		want  string
	}{
		{nil, ""},
		{[]string{"1.1.1.1"}, "1.1.1.1"},
		{[]string{"6.6.6.6", "198.51.100.1"}, "6.6.6.6,198.51.100.1"},
		{[]string{"6.6.6.6, 7.7.7.7", "198.51.100.1"}, "6.6.6.6, 7.7.7.7,198.51.100.1"},
	}
	for _, c := range cases {
		if got := access.JoinForwardedFor(c.lines); got != c.want {
			t.Errorf("JoinForwardedFor(%q) = %q, want %q", c.lines, got, c.want)
		}
	}
	if got := access.ClientIP("10.0.0.2:4000", access.JoinForwardedFor([]string{"6.6.6.6", "198.51.100.1"}), true); got != "198.51.100.1" {
		t.Errorf("ClientIP over two header lines = %q, want the proxy's own line", got)
	}
}
