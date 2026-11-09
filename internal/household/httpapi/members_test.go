package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func TestMembersReadByAnyUserManagedByAdmin(t *testing.T) {
	env := testkit.Start(t)
	user, anon := env.LoginUser(t), env.Anonymous()
	if r := anon.Get("/api/members"); r.Status != 401 {
		t.Errorf("anonymous GET = %d", r.Status)
	}
	if r := user.Get("/api/members"); r.Status != 200 {
		t.Errorf("User GET = %d", r.Status)
	}
	body := map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 0.5}
	for _, c := range []struct{ method, path string }{{"POST", "/api/members"}, {"PATCH", "/api/members/1"}, {"DELETE", "/api/members/1"}, {"PUT", "/api/members/1/user"}} {
		if r := user.Do(c.method, c.path, body); r.Status != 403 {
			t.Errorf("User %s %s = %d", c.method, c.path, r.Status)
		}
		if r := anon.Do(c.method, c.path, body); r.Status != 401 {
			t.Errorf("anonymous %s %s = %d", c.method, c.path, r.Status)
		}
	}
}

func TestMemberLifecycle(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var sam memberBody
	r := admin.Post("/api/members", map[string]any{"name": " Sam ", "colour": "#e07a5f", "avatar": "🦊", "portionFactor": 0.5})
	r.MustJSON(t, &sam)
	if r.Status != 201 || sam.ID == 0 || sam.Name != "Sam" || sam.Avatar != "🦊" || sam.PortionFactor != 0.5 || sam.UserID != nil {
		t.Fatalf("create = %d %+v", r.Status, sam)
	}
	anna := mustMember(t, admin, "Anna", 1)
	var list []memberBody
	env.LoginUser(t).Get("/api/members").MustJSON(t, &list)
	if len(list) != 2 || list[0].ID != sam.ID || list[1].ID != anna.ID {
		t.Fatalf("list = %+v", list)
	}
	var up memberBody
	r = admin.Patch(path("/api/members/%d", sam.ID), map[string]any{"name": "Samuel", "colour": "#000000", "portionFactor": 0.75})
	r.MustJSON(t, &up)
	if r.Status != 200 || up.Name != "Samuel" || up.PortionFactor != 0.75 || up.Avatar != "" {
		t.Fatalf("patch = %d %+v", r.Status, up)
	}
	if r := admin.Delete(path("/api/members/%d", sam.ID)); r.Status != 204 {
		t.Fatalf("delete = %d", r.Status)
	}
	if r := admin.Delete(path("/api/members/%d", sam.ID)); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("second delete = %d %s", r.Status, r.Body)
	}
	if r := admin.Patch("/api/members/9999", map[string]any{"name": "x", "colour": "#000000", "portionFactor": 1}); r.Status != 404 {
		t.Errorf("patch unknown = %d", r.Status)
	}
}

func TestMemberValidation(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	ok := func() map[string]any { return map[string]any{"name": "Sam", "colour": "#e07a5f", "portionFactor": 0.5} }
	cases := map[string]func(map[string]any){
		"portionFactor": func(b map[string]any) { b["portionFactor"] = 0.3 },
		"name":          func(b map[string]any) { b["name"] = "" },
		"colour":        func(b map[string]any) { b["colour"] = "red" },
		"avatar":        func(b map[string]any) { b["avatar"] = "toolong" },
	}
	for field, edit := range cases {
		b := ok()
		edit(b)
		r := admin.Post("/api/members", b)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), field) {
			t.Errorf("%s: %d %s", field, r.Status, r.Body)
		}
	}
	var list []memberBody
	admin.Get("/api/members").MustJSON(t, &list)
	if len(list) != 0 {
		t.Errorf("invalid members were stored: %+v", list)
	}
}

func TestLinkingAUserToAMember(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	user, _ := env.Auth.UserByEmail(t.Context(), testkit.UserEmail)
	anna, marco := mustMember(t, admin, "Anna", 1), mustMember(t, admin, "Marco", 1)

	var got memberBody
	r := admin.Put(path("/api/members/%d/user", anna.ID), map[string]any{"userId": user.ID})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.UserID == nil || *got.UserID != user.ID {
		t.Fatalf("link = %d %+v", r.Status, got)
	}
	if r := admin.Put(path("/api/members/%d/user", marco.ID), map[string]any{"userId": user.ID}); r.Status != 409 || r.ErrorCode() != "user_already_linked" {
		t.Errorf("second link = %d %s", r.Status, r.Body)
	}
	if r := admin.Put(path("/api/members/%d/user", marco.ID), map[string]any{"userId": 9999}); r.Status != 404 {
		t.Errorf("unknown user = %d", r.Status)
	}
	r = admin.Put(path("/api/members/%d/user", anna.ID), map[string]any{"userId": nil})
	r.MustJSON(t, &got)
	if r.Status != 200 || got.UserID != nil {
		t.Fatalf("unlink = %d %+v", r.Status, got)
	}
}

func TestRemovingAUserLeavesTheirMember(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	user, _ := env.Auth.UserByEmail(t.Context(), testkit.UserEmail)
	anna := mustMember(t, admin, "Anna", 1)
	admin.Put(path("/api/members/%d/user", anna.ID), map[string]any{"userId": user.ID})
	admin.Delete(path("/api/allowlist/%d", user.ID))
	var list []memberBody
	admin.Get("/api/members").MustJSON(t, &list)
	if len(list) != 1 || list[0].UserID != nil {
		t.Fatalf("members after removing the User = %+v", list)
	}
}

func TestMemberChangesPublishHouseholdEvent(t *testing.T) {
	env := testkit.Start(t)
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()
	mustMember(t, env.LoginAdmin(t), "Anna", 1)
	if topic, data := nextEvent(t, ch); topic != "household" || !strings.Contains(data, `"members"`) {
		t.Fatalf("event = %s %s", topic, data)
	}
}
