package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// R11a (user bug: "a member can be also an admin: I don't see a way to link a member to my admin user"): any User, Admin
// included, can be linked to exactly one Member. Docs: docs/dev/design/r11a-settings-shell.md, "Linking an Admin".

type allowedUser struct {
	ID          int64  `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"displayName"`
	IsAdmin     bool   `json:"isAdmin"`
}

func adminID(t *testing.T, admin *testkit.Client) int64 {
	t.Helper()
	var me struct {
		ID int64 `json:"id"`
	}
	admin.Get("/api/me").MustJSON(t, &me)
	return me.ID
}

// The Linked User picker is fed by this list: every User on the allowlist, the env-seeded Admin included, Admins not filtered.
func TestAllowlistOffersEveryUserForLinkingAdminsAndTheEnvAdminIncluded(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	env.LoginUser(t)
	var users []allowedUser
	admin.Get("/api/allowlist").MustJSON(t, &users)
	byEmail := map[string]allowedUser{}
	for _, u := range users {
		byEmail[u.Email] = u
	}
	a, ok := byEmail[testkit.AdminEmail]
	if !ok || !a.IsAdmin || a.ID != adminID(t, admin) || a.DisplayName == "" {
		t.Errorf("the env-seeded Admin (FEEDER_ADMIN_EMAIL) must be listed with their own User id, isAdmin and a display name: %+v", users)
	}
	if u, ok := byEmail[testkit.UserEmail]; !ok || u.IsAdmin {
		t.Errorf("the plain User must be listed too: %+v", users)
	}
}

func TestAdminCanLinkThemselfToAMemberAndUnlink(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	me := adminID(t, admin)
	anna := mustMember(t, admin, "Anna", 1)
	var linked memberBody
	r := admin.Put(path("/api/members/%d/user", anna.ID), map[string]any{"userId": me})
	r.MustJSON(t, &linked)
	if r.Status != 200 || linked.UserID == nil || *linked.UserID != me {
		t.Fatalf("Admin links themself = %d %s", r.Status, r.Body)
	}
	var list []memberBody
	admin.Get("/api/members").MustJSON(t, &list)
	if len(list) != 1 || list[0].UserID == nil || *list[0].UserID != me {
		t.Errorf("the link must show in the Members list: %+v", list)
	}
	if r := admin.Put(path("/api/members/%d/user", anna.ID), map[string]any{"userId": nil}); r.Status != 200 {
		t.Errorf("unlink = %d", r.Status)
	}
	// Linking the same Member to the same User again is not a conflict.
	for i := 0; i < 2; i++ {
		if r := admin.Put(path("/api/members/%d/user", anna.ID), map[string]any{"userId": me}); r.Status != 200 {
			t.Errorf("link #%d = %d %s", i+1, r.Status, r.Body)
		}
	}
}

// One User, one Member. The refusal names the Member who already has the User so the Admin knows where to go.
func TestLinkingAUserAlreadyLinkedToAnotherMemberIsRefusedAndNamesThatMember(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	me := adminID(t, admin)
	anna, marco := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Marco", 1)
	if r := admin.Put(path("/api/members/%d/user", anna.ID), map[string]any{"userId": me}); r.Status != 200 {
		t.Fatalf("first link = %d", r.Status)
	}
	r := admin.Put(path("/api/members/%d/user", marco.ID), map[string]any{"userId": me})
	if r.Status != 409 || r.ErrorCode() != "user_already_linked" {
		t.Fatalf("second link = %d %s", r.Status, r.Body)
	}
	var body struct {
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	r.MustJSON(t, &body)
	if !strings.Contains(body.Error.Message, "Anna") {
		t.Errorf("the error must name the Member who already has this User, got %q", body.Error.Message)
	}
	var list []memberBody
	admin.Get("/api/members").MustJSON(t, &list)
	for _, m := range list {
		if m.ID == marco.ID && m.UserID != nil {
			t.Errorf("Marco must stay unlinked: %+v", m)
		}
	}
}
