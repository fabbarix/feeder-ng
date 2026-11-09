package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func TestPreferencesDefaultsAndRoundTripPerUser(t *testing.T) {
	env := testkit.Start(t)
	if r := env.Anonymous().Get("/api/me/preferences"); r.Status != 401 {
		t.Fatalf("anonymous = %d", r.Status)
	}
	user, admin := env.LoginUser(t), env.LoginAdmin(t)
	var p prefsBody
	user.Get("/api/me/preferences").MustJSON(t, &p)
	if p.Scheme != "system" || p.Accent != "#3f7d58" || p.Secondary != nil || p.Units != "metric" {
		t.Fatalf("defaults = %+v", p)
	}
	r := user.Put("/api/me/preferences", map[string]any{"scheme": "dark", "accent": "#3366cc", "secondary": "#ffb4a2", "units": "imperial"})
	r.MustJSON(t, &p)
	if r.Status != 200 || p.Scheme != "dark" || p.Secondary == nil || *p.Secondary != "#ffb4a2" || p.Units != "imperial" {
		t.Fatalf("PUT = %d %+v", r.Status, p)
	}
	env.Restart(t)
	user.Get("/api/me/preferences").MustJSON(t, &p)
	if p.Accent != "#3366cc" || p.Units != "imperial" {
		t.Fatalf("after restart = %+v", p)
	}
	admin.Get("/api/me/preferences").MustJSON(t, &p)
	if p.Scheme != "system" {
		t.Fatalf("the Admin's preferences must not change: %+v", p)
	}
	user.Put("/api/me/preferences", map[string]any{"scheme": "light", "accent": "#3366cc", "secondary": nil, "units": "metric"}).MustJSON(t, &p)
	if p.Secondary != nil || p.Scheme != "light" {
		t.Fatalf("clearing secondary: %+v", p)
	}
}

func TestPreferencesValidation(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	for field, body := range map[string]map[string]any{
		"scheme":    {"scheme": "sepia", "accent": "#3366cc", "units": "metric"},
		"accent":    {"scheme": "dark", "accent": "blue", "units": "metric"},
		"secondary": {"scheme": "dark", "accent": "#3366cc", "secondary": "red", "units": "metric"},
		"units":     {"scheme": "dark", "accent": "#3366cc", "units": "furlongs"},
	} {
		r := user.Put("/api/me/preferences", body)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" {
			t.Errorf("%s: %d %s", field, r.Status, r.Body)
		}
	}
	var p prefsBody
	user.Get("/api/me/preferences").MustJSON(t, &p)
	if p.Scheme != "system" {
		t.Errorf("invalid writes changed the preferences: %+v", p)
	}
}
