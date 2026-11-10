package httpapi_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// PHASE 2 (red until the household changes land: migration 1210_member_email.sql, household.MemberInput.Email, the
// store and the members handlers). Decision A1: the optional Member email.
//
// API (POST /api/members, PATCH /api/members/{id}; Admin only; PATCH replaces, so an omitted email clears it):
//
//	email omitted, null or ""             no email ("email": null in every Member)
//	email given                           trimmed and lower-cased; shown to every User in GET /api/members
//	not name@host, or over 254 chars      422 validation_failed, message names "email"
//	same address (any case) as another
//	  Member, any User, or the allowlist  409 email_taken
//	the address of the User this Member
//	  is itself linked to                 allowed (the User row stays authoritative)
//
// And the other way round: POST /api/allowlist with an address that is a Member's email is 409 email_taken.
// Sign-in order (domain): a User wins over a Member email; a Member email signs in only while the Member has no User.

type emailMember struct {
	ID     int64   `json:"id"`
	Name   string  `json:"name"`
	Email  *string `json:"email"`
	UserID *int64  `json:"userId"`
}

func memberBody(name string, email any) map[string]any {
	b := map[string]any{"name": name, "colour": "#3366cc", "portionFactor": 1}
	if email != "<omit>" {
		b["email"] = email
	}
	return b
}

func createWithEmail(t *testing.T, admin *testkit.Client, name string, email any) (*testkit.Response, emailMember) {
	t.Helper()
	var m emailMember
	r := admin.Post("/api/members", memberBody(name, email))
	if r.Status == 201 {
		r.MustJSON(t, &m)
	}
	return r, m
}

func wantConflict(t *testing.T, what string, r *testkit.Response) {
	t.Helper()
	if r.Status != 409 || r.ErrorCode() != "email_taken" {
		t.Errorf("%s = %d %s, want 409 email_taken", what, r.Status, r.Body)
	}
}

func TestPhase2AMemberEmailIsNormalisedAndShownToEveryUser(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	r, m := createWithEmail(t, admin, "Nonna", "  Nonna@Example.TEST ")
	if r.Status != 201 || m.Email == nil || *m.Email != "nonna@example.test" {
		t.Fatalf("create = %d %s", r.Status, r.Body)
	}
	var list []emailMember
	env.LoginUser(t).Get("/api/members").MustJSON(t, &list)
	if len(list) != 1 || list[0].Email == nil || *list[0].Email != "nonna@example.test" {
		t.Fatalf("a plain User must see the Member email: %+v", list)
	}
	for _, empty := range []any{"<omit>", nil, "", "   "} {
		r, m := createWithEmail(t, admin, fmt.Sprintf("NoMail%v", empty), empty)
		if r.Status != 201 || m.Email != nil {
			t.Errorf("email %#v: %d %s, want 201 with email null", empty, r.Status, r.Body)
		}
	}
}

func TestPhase2AnInvalidMemberEmailIsAValidationError(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	long := strings.Repeat("a", 250) + "@example.test"
	for _, bad := range []string{"nonna", "nonna@", "@example.test", "a b@example.test", "a@b@example.test", long, "nonna@example.test, sam@example.test"} {
		r := admin.Post("/api/members", memberBody("Nonna", bad))
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(strings.ToLower(string(r.Body)), "email") {
			t.Errorf("email %q = %d %s, want 422 validation_failed naming email", bad, r.Status, r.Body)
		}
	}
	if r := admin.Post("/api/members", map[string]any{"name": "Nonna", "colour": "#3366cc", "portionFactor": 1, "email": 42}); r.Status != 400 {
		t.Errorf("a non-string email = %d, want 400 bad_request", r.Status)
	}
	var list []emailMember
	admin.Get("/api/members").MustJSON(t, &list)
	if len(list) != 0 {
		t.Fatalf("nothing may be created by the refused calls: %+v", list)
	}
}

func TestPhase2AMemberEmailIsUniqueAcrossMembersIgnoringCase(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	_, nonna := createWithEmail(t, admin, "Nonna", "nonna@example.test")
	wantConflict(t, "second Member, same address", func() *testkit.Response { r, _ := createWithEmail(t, admin, "Zia", "nonna@example.test"); return r }())
	wantConflict(t, "second Member, other case", func() *testkit.Response { r, _ := createWithEmail(t, admin, "Zia", "NONNA@Example.test"); return r }())
	_, zia := createWithEmail(t, admin, "Zia", "zia@example.test")
	wantConflict(t, "PATCH onto another Member's address", admin.Patch(fmt.Sprintf("/api/members/%d", zia.ID), memberBody("Zia", "Nonna@example.test")))
	// Keeping your own address on a PATCH is not a conflict.
	if r := admin.Patch(fmt.Sprintf("/api/members/%d", nonna.ID), memberBody("Nonna Rossi", "NONNA@example.test")); r.Status != 200 {
		t.Errorf("PATCH keeping own address = %d %s", r.Status, r.Body)
	}
	// PATCH without email clears it, which frees the address; deleting a Member frees it too.
	var cleared emailMember
	r := admin.Patch(fmt.Sprintf("/api/members/%d", nonna.ID), memberBody("Nonna Rossi", "<omit>"))
	r.MustJSON(t, &cleared)
	if r.Status != 200 || cleared.Email != nil {
		t.Fatalf("PATCH without email = %d %s, want it cleared", r.Status, r.Body)
	}
	if r, _ := createWithEmail(t, admin, "Sam", "nonna@example.test"); r.Status != 201 {
		t.Errorf("the cleared address is free again: %d %s", r.Status, r.Body)
	}
	if r := admin.Delete(fmt.Sprintf("/api/members/%d", zia.ID)); r.Status != 204 {
		t.Fatalf("delete = %d", r.Status)
	}
	if r, _ := createWithEmail(t, admin, "Rex", "zia@example.test"); r.Status != 201 {
		t.Errorf("a deleted Member's address is free again: %d %s", r.Status, r.Body)
	}
}

// The hijack rule: a Member email must never hand a Member to an existing User, or make a sign-in ambiguous.
func TestPhase2AMemberEmailCannotBeTheAddressOfAUserOrAnAllowlistEntry(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	for _, taken := range []string{testkit.UserEmail, strings.ToUpper(testkit.UserEmail), env.Config.AdminEmail} {
		r, _ := createWithEmail(t, admin, "Nonna", taken)
		wantConflict(t, "create with the address of User "+taken, r)
	}
	if r := admin.Post("/api/allowlist", map[string]any{"email": "cousin@example.test"}); r.Status != 201 {
		t.Fatalf("allowlist add = %d %s", r.Status, r.Body)
	}
	r, _ := createWithEmail(t, admin, "Nonna", "cousin@example.test")
	wantConflict(t, "create with an allowlist address", r)

	// PATCH onto a User's address is refused as well, and the Member keeps what it had.
	_, nonna := createWithEmail(t, admin, "Nonna", "nonna@example.test")
	wantConflict(t, "PATCH onto a User's address", admin.Patch(fmt.Sprintf("/api/members/%d", nonna.ID), memberBody("Nonna", testkit.UserEmail)))
	var list []emailMember
	admin.Get("/api/members").MustJSON(t, &list)
	if len(list) != 1 || list[0].Email == nil || *list[0].Email != "nonna@example.test" {
		t.Fatalf("a refused PATCH must change nothing: %+v", list)
	}
}

func TestPhase2AMemberMayCarryTheEmailOfTheUserItIsLinkedToButNotAnotherUsers(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var me struct{ ID int64 }
	env.LoginUser(t).Get("/api/me").MustJSON(t, &me)
	_, sam := createWithEmail(t, admin, "Sam", "<omit>")
	if r := admin.Put(fmt.Sprintf("/api/members/%d/user", sam.ID), map[string]any{"userId": me.ID}); r.Status != 200 {
		t.Fatalf("link = %d %s", r.Status, r.Body)
	}
	if r := admin.Patch(fmt.Sprintf("/api/members/%d", sam.ID), memberBody("Sam", testkit.UserEmail)); r.Status != 200 {
		t.Errorf("a Member may carry the address of its own User: %d %s", r.Status, r.Body)
	}
	wantConflict(t, "a linked Member carrying another User's address",
		admin.Patch(fmt.Sprintf("/api/members/%d", sam.ID), memberBody("Sam", env.Config.AdminEmail)))
}

func TestPhase2AnAllowlistAddressCannotBeAMembersEmail(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	createWithEmail(t, admin, "Nonna", "nonna@example.test")
	wantConflict(t, "allowlist add of a Member's email", admin.Post("/api/allowlist", map[string]any{"email": "Nonna@Example.test"}))
	var allowed []struct {
		Email string `json:"email"`
	}
	admin.Get("/api/allowlist").MustJSON(t, &allowed)
	for _, a := range allowed {
		if a.Email == "nonna@example.test" {
			t.Fatal("the refused add must not create a User")
		}
	}
}

// After a Member email signs in and links, the address is the User's and nobody else can carry it.
func TestPhase2OnceLinkedTheAddressStaysTakenAndANewMemberCannotReuseIt(t *testing.T) {
	g := start(t)
	admin := g.env.LoginAdmin(t)
	createWithEmail(t, admin, "Nonna", "nonna@example.test")
	if _, cb := g.visit("nonna@example.test", "Nonna Rossi", true); where(cb) != "/" {
		t.Fatalf("Member email sign-in -> %q", where(cb))
	}
	r, _ := createWithEmail(t, admin, "Another Nonna", "nonna@example.test")
	wantConflict(t, "reuse of a linked Member's address", r)
}
