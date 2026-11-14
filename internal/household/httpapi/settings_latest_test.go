package httpapi_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// A2 (B9-58): the settings carry latestStart ("HH:MM", null = Off, default "22:00"), the same tri-state PUT as
// earliestStart: absent keeps, null turns Off, a time sets it. Admin only. It must be later than earliestStart when
// both are set (422 naming latestStart), checked against the values the save would leave (a stored or kept one too).

type latestSettings struct {
	EarliestStart *string `json:"earliestStart"`
	LatestStart   *string `json:"latestStart"`
}

func readLatest(t *testing.T, c *testkit.Client) (latestSettings, map[string]json.RawMessage) {
	t.Helper()
	r := c.Get("/api/household/settings")
	var s latestSettings
	var raw map[string]json.RawMessage
	r.MustJSON(t, &s)
	r.MustJSON(t, &raw)
	return s, raw
}

func TestLatestStartDefaultsToTenInTheEveningForEveryUser(t *testing.T) {
	env := testkit.Start(t)
	s, raw := readLatest(t, env.LoginUser(t))
	if s.LatestStart == nil || *s.LatestStart != "22:00" {
		t.Fatalf("latestStart = %v, want 22:00", s.LatestStart)
	}
	if _, ok := raw["latestStart"]; !ok {
		t.Error("latestStart is always sent")
	}
}

func TestAdminSetsLatestStartAndItSurvivesARestart(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := fullSettings()
	body["latestStart"] = "21:30"
	var saved latestSettings
	r := admin.Put("/api/household/settings", body)
	r.MustJSON(t, &saved)
	if r.Status != 200 || saved.LatestStart == nil || *saved.LatestStart != "21:30" {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	env.Restart(t)
	if got, _ := readLatest(t, env.LoginUser(t)); got.LatestStart == nil || *got.LatestStart != "21:30" {
		t.Errorf("after restart = %+v", got)
	}
}

func TestAnExplicitNullTurnsLatestStartOffAndALeftOutFieldKeepsIt(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := fullSettings()
	body["latestStart"] = nil
	r := admin.Put("/api/household/settings", body)
	var s latestSettings
	r.MustJSON(t, &s)
	if r.Status != 200 || s.LatestStart != nil || !strings.Contains(string(r.Body), `"latestStart":null`) {
		t.Fatalf("null = %d %s, want latestStart null (Off)", r.Status, r.Body)
	}
	// A save that leaves latestStart out (a client older than this field) keeps Off, and keeps a time too.
	admin.Put("/api/household/settings", fullSettings())
	if got, raw := readLatest(t, admin); got.LatestStart != nil || string(raw["latestStart"]) != "null" {
		t.Errorf("left out = %+v %s, want Off kept", got, raw["latestStart"])
	}
	body = fullSettings()
	body["latestStart"] = "20:45"
	admin.Put("/api/household/settings", body)
	admin.Put("/api/household/settings", fullSettings())
	if got, _ := readLatest(t, admin); got.LatestStart == nil || *got.LatestStart != "20:45" {
		t.Errorf("left out after 20:45 = %+v", got)
	}
}

func TestAnInvalidLatestStartIsRefusedAndChangesNothing(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	for _, bad := range []string{"6:30", "24:00", "late", "22:00:00"} {
		body := fullSettings()
		body["latestStart"] = bad
		r := admin.Put("/api/household/settings", body)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), "latestStart") {
			t.Errorf("%q: %d %s", bad, r.Status, r.Body)
		}
	}
	if got, _ := readLatest(t, admin); got.LatestStart == nil || *got.LatestStart != "22:00" {
		t.Errorf("an invalid save changed the setting: %+v", got)
	}
}

func TestALatestStartNotLaterThanTheEarliestStartIsRefusedNamingTheField(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	cases := []struct{ earliest, latest string }{
		{"07:00", "07:00"}, // equal
		{"07:00", "06:59"}, // earlier
		{"22:00", "21:00"},
	}
	for _, c := range cases {
		body := fullSettings()
		body["earliestStart"], body["latestStart"] = c.earliest, c.latest
		r := admin.Put("/api/household/settings", body)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), "latestStart") {
			t.Errorf("earliest %s latest %s: %d %s", c.earliest, c.latest, r.Status, r.Body)
		}
	}
	// A save that leaves latestStart out is checked against the kept 22:00.
	body := fullSettings()
	body["earliestStart"] = "23:00"
	if r := admin.Put("/api/household/settings", body); r.Status != 422 || !strings.Contains(string(r.Body), "latestStart") {
		t.Errorf("earliest 23:00 against the kept latest 22:00: %d %s", r.Status, r.Body)
	}
	// And one that leaves earliestStart out is checked against the kept 06:30.
	body = fullSettings()
	body["latestStart"] = "06:30"
	if r := admin.Put("/api/household/settings", body); r.Status != 422 || !strings.Contains(string(r.Body), "latestStart") {
		t.Errorf("latest 06:30 against the kept earliest 06:30: %d %s", r.Status, r.Body)
	}
	if got, _ := readLatest(t, admin); got.EarliestStart == nil || *got.EarliestStart != "06:30" || got.LatestStart == nil || *got.LatestStart != "22:00" {
		t.Errorf("a refused save changed the settings: %+v", got)
	}
}

func TestEitherStartOffLetsTheOtherBeAnyTime(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := fullSettings()
	body["earliestStart"], body["latestStart"] = nil, "05:00"
	if r := admin.Put("/api/household/settings", body); r.Status != 200 {
		t.Errorf("Earliest start Off with Latest start 05:00: %d %s", r.Status, r.Body)
	}
	body = fullSettings()
	body["earliestStart"], body["latestStart"] = "23:00", nil
	if r := admin.Put("/api/household/settings", body); r.Status != 200 {
		t.Errorf("Latest start Off with Earliest start 23:00: %d %s", r.Status, r.Body)
	}
	got, _ := readLatest(t, admin)
	if got.EarliestStart == nil || *got.EarliestStart != "23:00" || got.LatestStart != nil {
		t.Errorf("settings = %+v, want 23:00 and Off", got)
	}
}

func TestAUserCannotChangeLatestStart(t *testing.T) {
	env := testkit.Start(t)
	body := fullSettings()
	body["latestStart"] = "21:00"
	if r := env.LoginUser(t).Put("/api/household/settings", body); r.Status != 403 {
		t.Errorf("User PUT = %d", r.Status)
	}
	if got, _ := readLatest(t, env.LoginUser(t)); got.LatestStart == nil || *got.LatestStart != "22:00" {
		t.Errorf("settings changed: %+v", got)
	}
}

// Every combination of the two tri-state fields (left out, null, a time) from the stored 06:30 and 22:00, each in a
// fresh Household: the stored result is the merged one, and every combination here is valid.
func TestEveryCombinationOfTheTwoStartFieldsSavesTheMergedValues(t *testing.T) {
	type field struct {
		name string
		set  bool
		val  any    // nil with set: null
		want string // "" Off
	}
	earliest := []field{{"left out", false, nil, "06:30"}, {"null", true, nil, ""}, {"07:15", true, "07:15", "07:15"}}
	latest := []field{{"left out", false, nil, "22:00"}, {"null", true, nil, ""}, {"21:00", true, "21:00", "21:00"}}
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	for _, e := range earliest {
		for _, l := range latest {
			reset := fullSettings()
			reset["earliestStart"], reset["latestStart"] = "06:30", "22:00"
			if r := admin.Put("/api/household/settings", reset); r.Status != 200 {
				t.Fatalf("reset: %d %s", r.Status, r.Body)
			}
			body := fullSettings()
			if e.set {
				body["earliestStart"] = e.val
			}
			if l.set {
				body["latestStart"] = l.val
			}
			r := admin.Put("/api/household/settings", body)
			if r.Status != 200 {
				t.Errorf("earliest %s, latest %s: %d %s", e.name, l.name, r.Status, r.Body)
				continue
			}
			got, _ := readLatest(t, admin)
			str := func(p *string) string {
				if p == nil {
					return ""
				}
				return *p
			}
			if str(got.EarliestStart) != e.want || str(got.LatestStart) != l.want {
				t.Errorf("earliest %s, latest %s: stored %q and %q, want %q and %q", e.name, l.name,
					str(got.EarliestStart), str(got.LatestStart), e.want, l.want)
			}
		}
	}
}
