package httpapi_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// Team C2: the plan API per Course (spec §7.5, §8, §16; docs/dev/design/crs-c2.md). The fixture is
// internal/testkit/crsc2: a Monday Dinner on 2026-11-09 (today, 19:00) serving Main then Side, attended by Anna and Sam.

type whyBody struct {
	Code     string  `json:"code"`
	Value    float64 `json:"value"`
	RecipeID int64   `json:"recipeId"`
	Recipe   string  `json:"recipe"`
	Tag      string  `json:"tag"`
	Date     string  `json:"date"`
}

type mealBody struct {
	Date       string    `json:"date"`
	MealSlotID int64     `json:"mealSlotId"`
	CourseID   int64     `json:"courseId"`
	CourseName string    `json:"courseName"`
	RecipeID   int64     `json:"recipeId"`
	RecipeName string    `json:"recipeName"`
	WholeMeal  bool      `json:"wholeMeal"`
	Relaxed    bool      `json:"relaxed"`
	Batches    float64   `json:"batches"`
	Portions   float64   `json:"portions"`
	State      string    `json:"state"`
	Pinned     bool      `json:"pinned"`
	Why        []whyBody `json:"why"`
	Covered    []int64   `json:"covered"`
}

type unfilledBody struct {
	Reason          string         `json:"reason"`
	SlotRuleClaimed bool           `json:"slotRuleClaimed"`
	Eliminated      map[string]int `json:"eliminated"`
}

type coveredByBody struct {
	CourseID   int64  `json:"courseId"`
	RecipeID   int64  `json:"recipeId"`
	RecipeName string `json:"recipeName"`
}

type courseBody struct {
	CourseID        int64          `json:"courseId"`
	Name            string         `json:"name"`
	Main            bool           `json:"main"`
	Optional        bool           `json:"optional"`
	OptOutMemberIDs []int64        `json:"optOutMemberIds"`
	Meal            *mealBody      `json:"meal"`
	Unfilled        *unfilledBody  `json:"unfilled"`
	CoveredBy       *coveredByBody `json:"coveredBy"`
	Unserved        *string        `json:"unserved"`
}

type ruleBody struct {
	ID         int64  `json:"id"`
	MealSlotID int64  `json:"mealSlotId"`
	CourseID   int64  `json:"courseId"`
	RecipeID   int64  `json:"recipeId"`
	RecipeName string `json:"recipeName"`
	Tag        string `json:"tag"`
}

type slotBody struct {
	Date        string        `json:"date"`
	MealSlotID  int64         `json:"mealSlotId"`
	Name        string        `json:"name"`
	Time        string        `json:"time"`
	CookMinutes *int          `json:"cookMinutes"`
	StartBy     string        `json:"startBy"`
	Meal        *mealBody     `json:"meal"`
	Unfilled    *unfilledBody `json:"unfilled"`
	Courses     []courseBody  `json:"courses"`
	Rules       []ruleBody    `json:"rules"`
}

type errBody struct {
	Error struct {
		Code    string `json:"code"`
		Field   string `json:"field"`
		Message string `json:"message"`
	} `json:"error"`
}

// plan reads the plan of one date and returns its slots.
func plan(t *testing.T, c *testkit.Client, date string) []slotBody {
	t.Helper()
	r := c.Get("/api/plan?from=" + date + "&to=" + date)
	if r.Status != 200 {
		t.Fatalf("GET /api/plan = %d %s", r.Status, r.Body)
	}
	var out struct {
		Slots []slotBody `json:"slots"`
	}
	r.MustJSON(t, &out)
	return out.Slots
}

// slotOf returns the single slot of the date.
func slotOf(t *testing.T, w *crsc2.World, date string) slotBody {
	t.Helper()
	s := plan(t, w.User, date)
	if len(s) != 1 {
		t.Fatalf("plan of %s has %d slots, want 1", date, len(s))
	}
	return s[0]
}

// courseOf returns the Course row of a slot.
func courseOf(t *testing.T, s slotBody, course int64) courseBody {
	t.Helper()
	for _, c := range s.Courses {
		if c.CourseID == course {
			return c
		}
	}
	t.Fatalf("slot has no Course row %d: %+v", course, s.Courses)
	return courseBody{}
}

func path(w *crsc2.World, date string, course int64, suffix string) string {
	p := "/api/plan/" + date + "/" + itoa(w.Slot)
	if course != 0 {
		p += "/" + itoa(course)
	}
	return p + suffix
}

func itoa(n int64) string { b, _ := json.Marshal(n); return string(b) }

func wantErr(t *testing.T, label string, r *testkit.Response, status int, code string) {
	t.Helper()
	var e errBody
	_ = r.JSON(&e)
	if r.Status != status || e.Error.Code != code {
		t.Errorf("%s = %d %s, want %d %s", label, r.Status, r.Body, status, code)
	}
}

func decodeMeal(t *testing.T, r *testkit.Response) mealBody {
	t.Helper()
	var m mealBody
	if r.Status != 200 {
		t.Fatalf("status %d: %s", r.Status, r.Body)
	}
	r.MustJSON(t, &m)
	return m
}

// noNull fails when the JSON holds the key with a null value anywhere (an empty list must be [], never null).
func noNull(t *testing.T, body []byte, key string) {
	t.Helper()
	if strings.Contains(string(body), `"`+key+`":null`) {
		t.Errorf("%q is null in %s; want []", key, body)
	}
}
