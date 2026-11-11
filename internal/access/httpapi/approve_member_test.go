package httpapi_test

import (
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// Decision A3: approving offers "link to Member" in one step. Body: {"memberId": <id>} or none.
//
//	empty body, {} or {"memberId":null}  approve without a Member (as before)
//	{"memberId":"x"} or other bad JSON    400 bad_request
//	{"memberId":0} or negative            422 validation_failed
//	Member missing or already has a User  409 member_unavailable; nothing is created, the request stays pending
//
// PHASE 1 (red now): the body, the validation and the refusal with no Members port. PHASE 2 (red until the household
// adapter exists): the cases that really link a Member (marked below).

func approvePath(id int64) string { return fmt.Sprintf("/api/access-requests/%d/approve", id) }

func (g *rig) askAndFind(email, name string, as *testkit.Client) int64 {
	g.t.Helper()
	g.ask(email, name)
	return g.idOf(as, email)
}

func TestApproveAcceptsNoBodyAnEmptyObjectOrANullMember(t *testing.T) {
	g := start(t)
	user := g.env.LoginUser(t)
	for i, body := range []any{nil, map[string]any{}, map[string]any{"memberId": nil}} {
		email := fmt.Sprintf("zia%d@example.test", i)
		id := g.askAndFind(email, "Zia", user)
		if r := user.Post(approvePath(id), body); r.Status != 200 {
			t.Errorf("approve with body %v = %d %s", body, r.Status, r.Body)
		}
	}
}

func TestApproveRejectsABadMemberId(t *testing.T) {
	g := start(t)
	user := g.env.LoginUser(t)
	id := g.askAndFind("zia@example.test", "Zia", user)
	for body, want := range map[string]struct {
		status int
		code   string
	}{
		`{"memberId":"seven"}`: {400, "bad_request"},
		`{"memberId":1.5}`:     {400, "bad_request"},
		`{"memberId":0}`:       {422, "validation_failed"},
		`{"memberId":-3}`:      {422, "validation_failed"},
	} {
		r := rawPost(t, g.env, user, approvePath(id), body, nil)
		if r.Status != want.status || r.ErrorCode() != want.code {
			t.Errorf("approve with %s = %d %s, want %d %s", body, r.Status, r.Body, want.status, want.code)
		}
	}
	if g.pending(user).Count != 1 {
		t.Fatal("a refused approval must leave the request pending")
	}
	if _, err := g.env.Auth.UserByEmail(t.Context(), "zia@example.test"); err == nil {
		t.Fatal("a refused approval must not create the User")
	}
}

func TestApproveWithAMemberThatDoesNotExistIsRefusedAndNothingIsCreated(t *testing.T) {
	g := start(t)
	user := g.env.LoginUser(t)
	id := g.askAndFind("zia@example.test", "Zia", user)
	r := user.Post(approvePath(id), map[string]any{"memberId": 9999})
	if r.Status != 409 || r.ErrorCode() != "member_unavailable" {
		t.Fatalf("approve with an unknown Member = %d %s, want 409 member_unavailable", r.Status, r.Body)
	}
	if g.pending(user).Count != 1 {
		t.Fatal("the request must stay pending so the approver can choose again")
	}
	if _, err := g.env.Auth.UserByEmail(t.Context(), "zia@example.test"); err == nil {
		t.Fatal("no User may be created when the Member is refused")
	}
	if r := user.Post(approvePath(id), nil); r.Status != 200 { // approving without a Member still works afterwards
		t.Fatalf("approve after the refusal = %d %s", r.Status, r.Body)
	}
}

func TestApproveWithAMemberStillNeedsASignedInUserAndTheCSRFGuard(t *testing.T) {
	g := start(t)
	user := g.env.LoginUser(t)
	id := g.askAndFind("zia@example.test", "Zia", user)
	if r := g.env.Anonymous().Post(approvePath(id), map[string]any{"memberId": 1}); r.Status != 401 {
		t.Errorf("anonymous = %d, want 401", r.Status)
	}
	if r := rawPost(t, g.env, user, approvePath(id), `{"memberId":1}`, map[string]string{"Origin": "https://evil.example"}); r.Status != 403 {
		t.Errorf("cross-origin = %d, want 403", r.Status)
	}
	if r := rawPost(t, g.env, user, approvePath(id), `{"memberId":1}`, map[string]string{"Content-Type": "text/plain"}); r.Status != 415 {
		t.Errorf("form body = %d, want 415", r.Status)
	}
	if g.pending(user).Count != 1 {
		t.Fatal("still pending")
	}
}

// --- PHASE 2: need the household adapter behind access.Members ---

type memberOut struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	Email  *string `json:"email"`
	UserID *int64  `json:"userId"`
}

func addMember(t *testing.T, admin *testkit.Client, name string) memberOut {
	t.Helper()
	var m memberOut
	r := admin.Post("/api/members", map[string]any{"name": name, "colour": "#3366cc", "portionFactor": 1})
	r.MustJSON(t, &m)
	if r.Status != 201 {
		t.Fatalf("create Member %s = %d %s", name, r.Status, r.Body)
	}
	return m
}

func membersOf(t *testing.T, c *testkit.Client) map[int64]memberOut {
	t.Helper()
	var list []memberOut
	c.Get("/api/members").MustJSON(t, &list)
	out := map[int64]memberOut{}
	for _, m := range list {
		out[m.ID] = m
	}
	return out
}

func TestPhase2AnyUserApprovesAndLinksAnUnlinkedMemberInOneStep(t *testing.T) {
	g := start(t)
	admin := g.env.LoginAdmin(t)
	nonna := addMember(t, admin, "Nonna")
	sam := addMember(t, admin, "Sam")
	plain := g.env.LoginUser(t) // not an Admin
	id := g.askAndFind("zia@example.test", "Zia Rosa", plain)

	var u struct {
		ID      int64 `json:"id"`
		IsAdmin bool  `json:"isAdmin"`
	}
	r := plain.Post(approvePath(id), map[string]any{"memberId": nonna.ID})
	r.MustJSON(t, &u)
	if r.Status != 200 || u.ID == 0 || u.IsAdmin {
		t.Fatalf("approve with a Member = %d %s", r.Status, r.Body)
	}
	ms := membersOf(t, plain)
	if ms[nonna.ID].UserID == nil || *ms[nonna.ID].UserID != u.ID {
		t.Fatalf("Nonna must be linked to the new User %d: %+v", u.ID, ms[nonna.ID])
	}
	if ms[sam.ID].UserID != nil {
		t.Fatalf("Sam must stay unlinked: %+v", ms[sam.ID])
	}
	if g.pending(plain).Count != 0 {
		t.Fatal("the request must be gone")
	}
	var h struct {
		Events []struct {
			Kind       string `json:"kind"`
			ActorEmail string `json:"actorEmail"`
			MemberName string `json:"memberName"`
		} `json:"events"`
	}
	plain.Get("/api/access-requests/history").MustJSON(t, &h)
	if len(h.Events) == 0 || h.Events[0].Kind != "approved" || h.Events[0].ActorEmail != testkit.UserEmail || h.Events[0].MemberName != "Nonna" {
		t.Fatalf("history = %+v, want an approval by the User that names the Member", h.Events)
	}
	// An event without a Member has an empty memberName.
	id2 := g.askAndFind("rex@example.test", "Rex", plain)
	plain.Post(approvePath(id2), nil)
	plain.Get("/api/access-requests/history").MustJSON(t, &h)
	if h.Events[0].MemberName != "" {
		t.Fatalf("approval without a Member: %+v", h.Events[0])
	}
}

func TestPhase2ApproveWithAMemberWhoAlreadyHasAUserIsRefused(t *testing.T) {
	g := start(t)
	admin := g.env.LoginAdmin(t)
	sam := addMember(t, admin, "Sam")
	me := struct{ ID int64 }{}
	g.env.LoginUser(t).Get("/api/me").MustJSON(t, &me)
	if r := admin.Put(fmt.Sprintf("/api/members/%d/user", sam.ID), map[string]any{"userId": me.ID}); r.Status != 200 {
		t.Fatalf("link = %d %s", r.Status, r.Body)
	}
	plain := g.env.LoginUser(t)
	id := g.askAndFind("zia@example.test", "Zia", plain)
	r := plain.Post(approvePath(id), map[string]any{"memberId": sam.ID})
	if r.Status != 409 || r.ErrorCode() != "member_unavailable" {
		t.Fatalf("approve with a linked Member = %d %s, want 409 member_unavailable", r.Status, r.Body)
	}
	if g.pending(plain).Count != 1 {
		t.Fatal("the request must stay pending")
	}
	if _, err := g.env.Auth.UserByEmail(t.Context(), "zia@example.test"); err == nil {
		t.Fatal("no User may be created")
	}
	if got := membersOf(t, plain)[sam.ID]; got.UserID == nil || *got.UserID != me.ID {
		t.Fatalf("Sam must keep his User: %+v", got)
	}
}
