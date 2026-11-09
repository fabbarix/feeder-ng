package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func fullSettings() map[string]any {
	return map[string]any{
		"timeZone": "Europe/Rome", "planningHorizonDays": 14, "defaultCooldownDays": 10, "defaultLeftoverUseByDays": 2,
		"quietHours": map[string]any{"start": "23:00", "end": "06:30"}, "plannerStyle": 0.25,
		"location": map[string]any{"city": "Turin"}, "currency": "eur",
	}
}

func TestSettingsReadableByAnyUserWritableByAdminOnly(t *testing.T) {
	env := testkit.Start(t)
	if r := env.Anonymous().Get("/api/household/settings"); r.Status != 401 {
		t.Errorf("anonymous GET = %d", r.Status)
	}
	if r := env.LoginUser(t).Get("/api/household/settings"); r.Status != 200 {
		t.Errorf("User GET = %d", r.Status)
	}
	if r := env.LoginUser(t).Put("/api/household/settings", fullSettings()); r.Status != 403 || r.ErrorCode() != "forbidden" {
		t.Errorf("User PUT = %d %s", r.Status, r.Body)
	}
	if r := env.Anonymous().Put("/api/household/settings", fullSettings()); r.Status != 401 {
		t.Errorf("anonymous PUT = %d", r.Status)
	}
}

func TestSettingsDefaults(t *testing.T) {
	env := testkit.Start(t)
	var s settingsBody
	env.LoginUser(t).Get("/api/household/settings").MustJSON(t, &s)
	if s.TimeZone != "UTC" || s.TimeZoneConfigured || s.PlanningHorizonDays != 7 || s.DefaultCooldownDays != 7 || s.DefaultLeftoverUseByDays != 3 ||
		s.QuietHours.Start != "22:00" || s.QuietHours.End != "07:00" || s.PlannerStyle != 0.5 || s.Location != nil || s.Currency != "USD" {
		t.Fatalf("defaults = %+v", s)
	}
}

func TestAdminSavesSettingsAndTheyPersistAcrossRestart(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	var saved settingsBody
	r := admin.Put("/api/household/settings", fullSettings())
	r.MustJSON(t, &saved)
	if r.Status != 200 || saved.Currency != "EUR" || !saved.TimeZoneConfigured || saved.PlanningHorizonDays != 14 {
		t.Fatalf("PUT = %d %+v", r.Status, saved)
	}
	env.Restart(t)
	var got settingsBody
	env.LoginUser(t).Get("/api/household/settings").MustJSON(t, &got)
	if got.TimeZone != "Europe/Rome" || !got.TimeZoneConfigured || got.DefaultCooldownDays != 10 || got.DefaultLeftoverUseByDays != 2 ||
		got.QuietHours.Start != "23:00" || got.QuietHours.End != "06:30" || got.PlannerStyle != 0.25 ||
		got.Location == nil || got.Location.City != "Turin" || got.Currency != "EUR" {
		t.Fatalf("after restart = %+v", got)
	}
}

func TestSettingsLocationCoordinatesAndClear(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := fullSettings()
	body["location"] = map[string]any{"latitude": 45.07, "longitude": 7.69}
	var s settingsBody
	admin.Put("/api/household/settings", body).MustJSON(t, &s)
	if s.Location == nil || s.Location.City != "" || s.Location.Latitude == nil || *s.Location.Latitude != 45.07 || *s.Location.Longitude != 7.69 {
		t.Fatalf("coordinates = %+v", s.Location)
	}
	body["location"] = nil
	admin.Put("/api/household/settings", body).MustJSON(t, &s)
	if s.Location != nil {
		t.Fatalf("cleared = %+v", s.Location)
	}
}

func TestSettingsValidationLeavesStoredValuesAlone(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	cases := map[string]func(map[string]any){
		"planningHorizonDays": func(b map[string]any) { b["planningHorizonDays"] = 29 },
		"timeZone":            func(b map[string]any) { b["timeZone"] = "Mars/Olympus" },
		"plannerStyle":        func(b map[string]any) { b["plannerStyle"] = 1.5 },
		"currency":            func(b map[string]any) { b["currency"] = "EURO" },
		"quietHours":          func(b map[string]any) { b["quietHours"] = map[string]any{"start": "25:00", "end": "07:00"} },
		"location": func(b map[string]any) {
			b["location"] = map[string]any{"city": "Turin", "latitude": 1.0, "longitude": 2.0}
		},
	}
	for field, edit := range cases {
		body := fullSettings()
		edit(body)
		r := admin.Put("/api/household/settings", body)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), field) {
			t.Errorf("%s: %d %s", field, r.Status, r.Body)
		}
	}
	var s settingsBody
	admin.Get("/api/household/settings").MustJSON(t, &s)
	if s.TimeZoneConfigured || s.PlanningHorizonDays != 7 {
		t.Fatalf("invalid writes changed the settings: %+v", s)
	}
	if r := admin.Put("/api/household/settings", "{not json"); r.Status != 400 {
		t.Errorf("bad JSON = %d", r.Status)
	}
}

func TestSettingsChangePublishesHouseholdEvent(t *testing.T) {
	env := testkit.Start(t)
	ch, cancel := env.App.Deps.Events.Subscribe("household")
	defer cancel()
	env.LoginAdmin(t).Put("/api/household/settings", fullSettings())
	topic, data := nextEvent(t, ch)
	if topic != "household" || !strings.Contains(data, `"settings"`) {
		t.Fatalf("event = %s %s", topic, data)
	}
}
