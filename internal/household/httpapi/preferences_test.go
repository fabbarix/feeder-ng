package httpapi_test

import (
	"strings"
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
	if p.Scheme != "system" || p.Accent != "#3f7d58" || p.Units != "metric" {
		t.Fatalf("defaults = %+v", p)
	}
	r := user.Put("/api/me/preferences", map[string]any{"scheme": "dark", "accent": "#3366cc", "units": "imperial"})
	r.MustJSON(t, &p)
	if r.Status != 200 || p.Scheme != "dark" || p.Units != "imperial" {
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
}

// The per-User secondary colour was removed (spec §15, 2026-11-10). A client that still sends it is
// not rejected: the field is ignored, never stored and never echoed back.
func TestPreferencesIgnoreRemovedSecondary(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	for _, secondary := range []any{"#ffb4a2", "red", nil} {
		r := user.Put("/api/me/preferences", map[string]any{"scheme": "light", "accent": "#3366cc", "secondary": secondary, "units": "metric"})
		if r.Status != 200 {
			t.Fatalf("secondary %v: PUT = %d %s", secondary, r.Status, r.Body)
		}
		if strings.Contains(string(r.Body), "secondary") {
			t.Errorf("PUT response still has a secondary field: %s", r.Body)
		}
	}
	r := user.Get("/api/me/preferences")
	if strings.Contains(string(r.Body), "secondary") {
		t.Errorf("GET response still has a secondary field: %s", r.Body)
	}
	var p prefsBody
	r.MustJSON(t, &p)
	if p.Scheme != "light" || p.Accent != "#3366cc" {
		t.Errorf("the other fields were not saved: %+v", p)
	}
}

func TestPreferencesValidation(t *testing.T) {
	env := testkit.Start(t)
	user := env.LoginUser(t)
	for field, body := range map[string]map[string]any{
		"scheme": {"scheme": "sepia", "accent": "#3366cc", "units": "metric"},
		"accent": {"scheme": "dark", "accent": "blue", "units": "metric"},
		"units":  {"scheme": "dark", "accent": "#3366cc", "units": "furlongs"},
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
