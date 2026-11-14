package httpapi_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B9-12 (PC-14, TB-06): the settings carry earliestStart ("HH:MM", null = Off, default "06:30") and setupHidden.
// A save that leaves a field out keeps the stored value (a client older than beta.9); an explicit null turns
// Earliest start Off.

type b9Settings struct {
	EarliestStart *string `json:"earliestStart"`
	SetupHidden   bool    `json:"setupHidden"`
}

func readB9(t *testing.T, c *testkit.Client) (b9Settings, map[string]json.RawMessage) {
	t.Helper()
	r := c.Get("/api/household/settings")
	var s b9Settings
	var raw map[string]json.RawMessage
	r.MustJSON(t, &s)
	r.MustJSON(t, &raw)
	return s, raw
}

func TestEarliestStartDefaultsToHalfPastSixAndTheChecklistIsShown(t *testing.T) {
	env := testkit.Start(t)
	s, raw := readB9(t, env.LoginUser(t))
	if s.EarliestStart == nil || *s.EarliestStart != "06:30" || s.SetupHidden {
		t.Fatalf("defaults = %+v", s)
	}
	if _, ok := raw["setupHidden"]; !ok {
		t.Error("setupHidden is always sent")
	}
}

func TestAdminSetsEarliestStartAndItSurvivesARestart(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := fullSettings()
	body["earliestStart"] = "07:15"
	body["setupHidden"] = true
	var saved b9Settings
	r := admin.Put("/api/household/settings", body)
	r.MustJSON(t, &saved)
	if r.Status != 200 || saved.EarliestStart == nil || *saved.EarliestStart != "07:15" || !saved.SetupHidden {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	env.Restart(t)
	if got, _ := readB9(t, env.LoginUser(t)); got.EarliestStart == nil || *got.EarliestStart != "07:15" || !got.SetupHidden {
		t.Errorf("after restart = %+v", got)
	}
}

func TestAnExplicitNullTurnsEarliestStartOffAndALeftOutFieldKeepsIt(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := fullSettings()
	body["earliestStart"] = nil
	r := admin.Put("/api/household/settings", body)
	var s b9Settings
	r.MustJSON(t, &s)
	if r.Status != 200 || s.EarliestStart != nil || !strings.Contains(string(r.Body), `"earliestStart":null`) {
		t.Fatalf("null = %d %s, want earliestStart null (Off)", r.Status, r.Body)
	}
	// A save that leaves earliestStart and setupHidden out keeps Off and the stored setupHidden.
	body = fullSettings()
	body["setupHidden"] = true
	admin.Put("/api/household/settings", body)
	body = fullSettings()
	admin.Put("/api/household/settings", body)
	if got, raw := readB9(t, admin); got.EarliestStart != nil || !got.SetupHidden || string(raw["earliestStart"]) != "null" {
		t.Errorf("left out = %+v %s, want Off kept and setupHidden kept", got, raw["earliestStart"])
	}
	// Turned back on, then left out: the time is kept.
	body["earliestStart"] = "06:00"
	admin.Put("/api/household/settings", body)
	delete(body, "earliestStart")
	admin.Put("/api/household/settings", body)
	if got, _ := readB9(t, admin); got.EarliestStart == nil || *got.EarliestStart != "06:00" {
		t.Errorf("left out after 06:00 = %+v", got)
	}
}

func TestAnInvalidEarliestStartIsRefusedAndChangesNothing(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	for _, bad := range []string{"6:30", "24:00", "noon", "06:30:00"} {
		body := fullSettings()
		body["earliestStart"] = bad
		r := admin.Put("/api/household/settings", body)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), "earliestStart") {
			t.Errorf("%q: %d %s", bad, r.Status, r.Body)
		}
	}
	if got, _ := readB9(t, admin); got.EarliestStart == nil || *got.EarliestStart != "06:30" {
		t.Errorf("an invalid save changed the setting: %+v", got)
	}
}

func TestAUserCannotChangeEarliestStartOrHideTheChecklist(t *testing.T) {
	env := testkit.Start(t)
	body := fullSettings()
	body["earliestStart"] = "09:00"
	body["setupHidden"] = true
	if r := env.LoginUser(t).Put("/api/household/settings", body); r.Status != 403 {
		t.Errorf("User PUT = %d", r.Status)
	}
	if got, _ := readB9(t, env.LoginUser(t)); got.SetupHidden || got.EarliestStart == nil || *got.EarliestStart != "06:30" {
		t.Errorf("settings changed: %+v", got)
	}
}
