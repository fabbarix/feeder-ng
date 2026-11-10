package httpapi_test

import (
	"fmt"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

type settingsBody struct {
	TimeZone                 string `json:"timeZone"`
	TimeZoneConfigured       bool   `json:"timeZoneConfigured"`
	PlanningHorizonDays      int    `json:"planningHorizonDays"`
	DefaultCooldownDays      int    `json:"defaultCooldownDays"`
	DefaultLeftoverUseByDays int    `json:"defaultLeftoverUseByDays"`
	QuietHours               struct {
		Start string `json:"start"`
		End   string `json:"end"`
	} `json:"quietHours"`
	PlannerStyle float64 `json:"plannerStyle"`
	Location     *struct {
		City      string   `json:"city"`
		Latitude  *float64 `json:"latitude"`
		Longitude *float64 `json:"longitude"`
	} `json:"location"`
	Currency string `json:"currency"`
}

type memberBody struct {
	ID            int64   `json:"id"`
	Name          string  `json:"name"`
	Colour        string  `json:"colour"`
	Avatar        string  `json:"avatar"`
	PortionFactor float64 `json:"portionFactor"`
	UserID        *int64  `json:"userId"`
}

type attendeeBody struct {
	MemberID              int64    `json:"memberId"`
	PortionFactorOverride *float64 `json:"portionFactorOverride"`
}

type slotBody struct {
	ID             int64          `json:"id"`
	Weekday        int            `json:"weekday"`
	Name           string         `json:"name"`
	Time           string         `json:"time"`
	Attendance     []attendeeBody `json:"attendance"`
	PortionsNeeded float64        `json:"portionsNeeded"`
}

type dateAttendanceBody struct {
	SlotID         int64          `json:"slotId"`
	Date           string         `json:"date"`
	IsOverride     bool           `json:"isOverride"`
	Attendance     []attendeeBody `json:"attendance"`
	PortionsNeeded float64        `json:"portionsNeeded"`
}

type prefsBody struct {
	Scheme string `json:"scheme"`
	Accent string `json:"accent"`
	Units  string `json:"units"`
}

func f64(v float64) *float64 { return &v }

func mustMember(t *testing.T, c *testkit.Client, name string, factor float64) memberBody {
	t.Helper()
	var m memberBody
	r := c.Post("/api/members", map[string]any{"name": name, "colour": "#3366cc", "portionFactor": factor})
	if r.Status != 201 {
		t.Fatalf("create member %s = %d %s", name, r.Status, r.Body)
	}
	r.MustJSON(t, &m)
	return m
}

func mustSlot(t *testing.T, c *testkit.Client, weekday int, name, at string, att ...attendeeBody) slotBody {
	t.Helper()
	var s slotBody
	r := c.Post("/api/meal-slots", map[string]any{"weekday": weekday, "name": name, "time": at, "attendance": att})
	if r.Status != 201 {
		t.Fatalf("create slot %s = %d %s", name, r.Status, r.Body)
	}
	r.MustJSON(t, &s)
	return s
}

// nextEvent waits for one event on ch and returns its topic and data.
func nextEvent(t *testing.T, ch <-chan events.Event) (string, string) {
	t.Helper()
	select {
	case e := <-ch:
		return e.Topic, string(e.Data)
	case <-time.After(2 * time.Second):
		t.Fatal("no event within 2 s")
	}
	return "", ""
}

func path(format string, a ...any) string { return fmt.Sprintf(format, a...) }
