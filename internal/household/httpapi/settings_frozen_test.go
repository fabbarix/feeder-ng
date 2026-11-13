package httpapi_test

import (
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B5-LO (plan 2.3 API table): GET and PUT /api/household/settings carry frozenUseByDays (1 to 365, default 90, Admin).

func frozenOf(t *testing.T, c *testkit.Client) int {
	t.Helper()
	var s struct {
		FrozenUseByDays int `json:"frozenUseByDays"`
	}
	r := c.Get("/api/household/settings")
	if r.Status != 200 || r.JSON(&s) != nil {
		t.Fatalf("GET settings = %d %s", r.Status, r.Body)
	}
	return s.FrozenUseByDays
}

func TestSettingsCarryTheFrozenUseByDaysDefaultOfNinety(t *testing.T) {
	env := testkit.Start(t)
	if got := frozenOf(t, env.LoginUser(t)); got != 90 {
		t.Errorf("frozenUseByDays = %d, want 90", got)
	}
}

func TestAnAdminSavesTheFrozenUseByDaysAndItPersists(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := fullSettings()
	body["frozenUseByDays"] = 45
	r := admin.Put("/api/household/settings", body)
	var out struct {
		FrozenUseByDays int `json:"frozenUseByDays"`
	}
	if r.Status != 200 || r.JSON(&out) != nil || out.FrozenUseByDays != 45 {
		t.Fatalf("PUT = %d %s, want 200 with 45", r.Status, r.Body)
	}
	env.Restart(t)
	if got := frozenOf(t, env.LoginUser(t)); got != 45 {
		t.Errorf("after restart = %d, want 45", got)
	}
}

func TestASaveWithoutTheFrozenUseByKeepsTheStoredValue(t *testing.T) {
	// Clients older than beta.5 do not send it: the save must neither fail nor reset it.
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	body := fullSettings()
	body["frozenUseByDays"] = 45
	if r := admin.Put("/api/household/settings", body); r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	if r := admin.Put("/api/household/settings", fullSettings()); r.Status != 200 {
		t.Fatalf("PUT without the field = %d %s, want 200", r.Status, r.Body)
	}
	if got := frozenOf(t, admin); got != 45 {
		t.Errorf("frozenUseByDays = %d, want the stored 45 kept", got)
	}
}

func TestFrozenUseByDaysOutsideOneToThreeHundredSixtyFiveIsRefused(t *testing.T) {
	env := testkit.Start(t)
	admin := env.LoginAdmin(t)
	for _, days := range []int{0, -3, 366} {
		body := fullSettings()
		body["frozenUseByDays"] = days
		r := admin.Put("/api/household/settings", body)
		if r.Status != 422 || r.ErrorCode() != "validation_failed" || !strings.Contains(string(r.Body), "frozenUseByDays") {
			t.Errorf("%d days = %d %s, want 422 validation_failed naming frozenUseByDays", days, r.Status, r.Body)
		}
	}
	if got := frozenOf(t, admin); got != 90 {
		t.Errorf("frozenUseByDays = %d after refusals, want 90", got)
	}
}

func TestOnlyAnAdminMaySaveTheFrozenUseByDays(t *testing.T) {
	env := testkit.Start(t)
	body := fullSettings()
	body["frozenUseByDays"] = 30
	if r := env.LoginUser(t).Put("/api/household/settings", body); r.Status != 403 {
		t.Errorf("User PUT = %d, want 403", r.Status)
	}
}
