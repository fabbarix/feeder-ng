package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-12 (RES-08): GET /api/me carries householdTimeZone, the Household's IANA zone name ("UTC" until an Admin
// sets one), so the shell can show household dates before any other request has returned.

type meZoneBody struct {
	ID                int64  `json:"id"`
	Email             string `json:"email"`
	IsAdmin           bool   `json:"isAdmin"`
	HouseholdTimeZone string `json:"householdTimeZone"`
}

func TestMeCarriesTheHouseholdTimeZone(t *testing.T) {
	env := testkit.Start(t)
	var me meZoneBody
	r := env.LoginUser(t).Get("/api/me")
	r.MustJSON(t, &me)
	if r.Status != 200 || me.HouseholdTimeZone != "UTC" || me.Email != testkit.UserEmail {
		t.Fatalf("me = %d %s, want householdTimeZone UTC beside the identity", r.Status, r.Body)
	}
	body := map[string]any{
		"timeZone": "Europe/Rome", "planningHorizonDays": 7, "defaultCooldownDays": 7, "defaultLeftoverUseByDays": 3,
		"quietHours": map[string]any{"start": "22:00", "end": "07:00"}, "plannerStyle": 0.5, "currency": "EUR",
	}
	admin := env.LoginAdmin(t)
	if r := admin.Put("/api/household/settings", body); r.Status != 200 {
		t.Fatalf("PUT settings = %d %s", r.Status, r.Body)
	}
	for name, c := range map[string]*testkit.Client{"User": env.LoginUser(t), "Admin": admin} {
		var got meZoneBody
		c.Get("/api/me").MustJSON(t, &got)
		if got.HouseholdTimeZone != "Europe/Rome" {
			t.Errorf("%s: householdTimeZone = %q, want Europe/Rome", name, got.HouseholdTimeZone)
		}
	}
	if r := env.Anonymous().Get("/api/me"); r.Status != 401 {
		t.Errorf("anonymous = %d", r.Status)
	}
}
