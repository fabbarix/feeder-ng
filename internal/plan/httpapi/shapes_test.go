package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// fixture is a household with one Recipe (45 minutes, a photo), one without a timeline, and two Members.
func fixture() table {
	return table{
		recipes:       map[int64]string{7: "Chicken curry", 8: "Stew"},
		recipeMinutes: map[int64]int{7: 45, 8: 0},
		recipePhoto:   map[int64]string{7: "/api/images/curry.jpg", 8: ""},
		members:       map[int64]string{1: "Anna", 2: "Ben"},
		memberColour:  map[int64]string{1: "#c0392b", 2: "#2980b9"},
		ingredients:   map[int64]string{},
		slots:         map[int64]string{2: "Dinner"},
	}
}

func dinnerAt(t *testing.T) time.Time {
	t.Helper()
	loc, err := time.LoadLocation("Europe/Rome")
	if err != nil {
		t.Fatal(err)
	}
	at, err := plan.SlotInstant("2026-11-10", "19:30", loc)
	if err != nil {
		t.Fatal(err)
	}
	return at
}

func TestSlotCarriesStartByCookMinutesPhotoAndAttendance(t *testing.T) {
	view := runner.SlotView{
		Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, Name: "Dinner", Time: "19:30", At: dinnerAt(t), Portions: 3,
		Attendance: []plan.Attendee{{MemberID: 1, Factor: 1}, {MemberID: 2, Factor: 0.5}},
		Meal:       &plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, RecipeID: 7, Batches: 1, Portions: 3, State: plan.StatePlanned},
	}
	out := slotFor(view, fixture())

	if out.Meal == nil {
		t.Fatal("slot lost its Planned Meal")
	}
	if out.Meal.CookMinutes != 45 {
		t.Errorf("cookMinutes = %d, want 45", out.Meal.CookMinutes)
	}
	if out.Meal.StartBy != "18:45" {
		t.Errorf("startBy = %q, want 18:45", out.Meal.StartBy)
	}
	if out.Meal.PhotoURL != "/api/images/curry.jpg" {
		t.Errorf("photoUrl = %q", out.Meal.PhotoURL)
	}
	if len(out.Attendance) != 2 {
		t.Fatalf("attendance = %d, want 2", len(out.Attendance))
	}
	anna := out.Attendance[0]
	if anna.ID != 1 || anna.Name != "Anna" || anna.Colour != "#c0392b" || anna.MemberID != 1 {
		t.Errorf("attendee = %+v", anna)
	}
}

func TestMealWithoutTimingOmitsTheOptionalFields(t *testing.T) {
	view := runner.SlotView{
		Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, Name: "Dinner", Time: "19:30", At: dinnerAt(t),
		Meal: &plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, RecipeID: 8, Batches: 1, State: plan.StatePlanned},
	}
	out := slotFor(view, fixture())
	if out.Meal.CookMinutes != 0 || out.Meal.StartBy != "" || out.Meal.PhotoURL != "" {
		t.Errorf("unknown timing and photo should be zero, got %+v", out.Meal)
	}
	raw, err := json.Marshal(out.Meal)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"cookMinutes"`, `"startBy"`, `"photoUrl"`} {
		if strings.Contains(string(raw), key) {
			t.Errorf("JSON carries %s although it is unknown: %s", key, raw)
		}
	}
}

func TestMealJSONCarriesTheOptionalFieldsInCamelCase(t *testing.T) {
	m := mealFor(plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, RecipeID: 7, Batches: 1, State: plan.StatePlanned}, fixture())
	m.StartBy = "18:45"
	raw, err := json.Marshal(m)
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"cookMinutes":45`, `"startBy":"18:45"`, `"photoUrl":"/api/images/curry.jpg"`} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("JSON misses %s: %s", want, raw)
		}
	}
}

func TestAlternativeCarriesItsPhoto(t *testing.T) {
	alt := alternativeFor(runner.Alternative{RecipeID: 7, Batches: 1, Score: 2}, fixture())
	if alt.PhotoURL != "/api/images/curry.jpg" || alt.RecipeName != "Chicken curry" {
		t.Errorf("alternative = %+v", alt)
	}
	plain := alternativeFor(runner.Alternative{RecipeID: 8}, fixture())
	if plain.PhotoURL != "" {
		t.Errorf("a Recipe without a photo has photoUrl %q", plain.PhotoURL)
	}
}

func TestPhotoURLIsTheImageStoreRoute(t *testing.T) {
	if got := photoURL("abc.jpg"); got != "/api/images/abc.jpg" {
		t.Errorf("photoURL = %q", got)
	}
	if got := photoURL(""); got != "" {
		t.Errorf("photoURL without an image = %q", got)
	}
}

func TestLeftoverServedMealSendsNoCookMinutesOrStartBy(t *testing.T) {
	view := runner.SlotView{
		Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, Name: "Dinner", Time: "19:30", At: dinnerAt(t), Portions: 3,
		Meal: &plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, RecipeID: 7, Batches: 0, Portions: 1, State: plan.StatePlanned,
			From: &plan.Source{From: plan.Key{Date: "2026-11-09", MealSlotID: 2}, LeftoverID: 5}},
	}
	out := slotFor(view, fixture())
	if out.Meal == nil || out.Meal.ServedFromLeftover == nil {
		t.Fatalf("meal is not served from a Leftover: %+v", out.Meal)
	}
	if out.Meal.CookMinutes != 0 || out.Meal.StartBy != "" {
		t.Errorf("a Leftover-served meal must not carry cookMinutes or startBy, got cookMinutes=%d startBy=%q", out.Meal.CookMinutes, out.Meal.StartBy)
	}
	raw, err := json.Marshal(out.Meal)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"cookMinutes"`, `"startBy"`} {
		if strings.Contains(string(raw), key) {
			t.Errorf("JSON carries %s for a Leftover-served meal: %s", key, raw)
		}
	}
	if out.Meal.PhotoURL == "" {
		t.Error("the photo is still sent for a Leftover-served meal")
	}
}

// N1: once a Leftover is stored the meal row's own source date is empty; the "Leftover from <day>" date comes from the
// Leftover's source Meal Slot.
func TestMealServedFromAStoredLeftoverTakesItsDateFromTheLeftoversSource(t *testing.T) {
	tb := fixture()
	tb.leftoverFrom = map[int64]plan.Key{5: {Date: "2026-11-10", MealSlotID: 2}}
	m := plan.Meal{Key: plan.Key{Date: "2026-11-11", MealSlotID: 1}, RecipeID: 7, Portions: 2, State: plan.StatePlanned,
		From: &plan.Source{LeftoverID: 5}}
	out := mealFor(m, tb)
	if out.ServedFromLeftover == nil {
		t.Fatal("servedFromLeftover missing")
	}
	if got := out.ServedFromLeftover.Date; got != "2026-11-10" {
		t.Errorf("servedFromLeftover.date = %q, want 2026-11-10 (the Leftover's source)", got)
	}
	if got := out.ServedFromLeftover.MealSlotID; got != 2 {
		t.Errorf("servedFromLeftover.mealSlotId = %d, want 2", got)
	}
	if out.ServedFromLeftover.LeftoverID == nil || *out.ServedFromLeftover.LeftoverID != 5 {
		t.Errorf("leftoverId = %v, want 5", out.ServedFromLeftover.LeftoverID)
	}
}

func TestMealServedFromAPlannedExtraKeepsItsOwnSourceDate(t *testing.T) {
	m := plan.Meal{Key: plan.Key{Date: "2026-11-11", MealSlotID: 1}, RecipeID: 7, State: plan.StatePlanned,
		From: &plan.Source{From: plan.Key{Date: "2026-11-10", MealSlotID: 2}}}
	if got := mealFor(m, fixture()).ServedFromLeftover.Date; got != "2026-11-10" {
		t.Errorf("date = %q, want 2026-11-10", got)
	}
}
