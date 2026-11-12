package httpapi

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/images"
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
		Courses:    []runner.CourseView{{CourseID: 1, Main: true, Meal: &plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2, CourseID: 1}, RecipeID: 7, Batches: 1, Portions: 3, State: plan.StatePlanned}}},
	}
	out := slotFor(view, fixture())

	// C3: the Planned Meal is on its Course row only; the Recipe's own timing moved there with it (the slot alias is gone).
	if len(out.Courses) != 1 || out.Courses[0].Meal == nil {
		t.Fatalf("slot lost its Planned Meal: %+v", out.Courses)
	}
	m := out.Courses[0].Meal
	if m.CookMinutes != 45 {
		t.Errorf("cookMinutes = %d, want 45", m.CookMinutes)
	}
	if m.StartBy != "18:45" {
		t.Errorf("startBy = %q, want 18:45 (the Course row's meal carries the Recipe's own start, as the slot alias did)", m.StartBy)
	}
	if m.PhotoURL != "/api/images/curry.jpg" {
		t.Errorf("photoUrl = %q", m.PhotoURL)
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
		Courses: []runner.CourseView{{CourseID: 1, Main: true, Meal: &plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2, CourseID: 1}, RecipeID: 8, Batches: 1, State: plan.StatePlanned}}},
	}
	out := slotFor(view, fixture())
	meal := out.Courses[0].Meal
	if meal.CookMinutes != 0 || meal.StartBy != "" || meal.PhotoURL != "" {
		t.Errorf("unknown timing and photo should be zero, got %+v", meal)
	}
	raw, err := json.Marshal(meal)
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

func TestImagesURLIsTheImageStoreRoute(t *testing.T) {
	if got := images.URL("abc.jpg"); got != "/api/images/abc.jpg" {
		t.Errorf("images.URL = %q", got)
	}
	if got := images.URL(""); got != "" {
		t.Errorf("images.URL without an image = %q", got)
	}
}

func TestLeftoverServedMealSendsNoCookMinutesOrStartBy(t *testing.T) {
	view := runner.SlotView{
		Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, Name: "Dinner", Time: "19:30", At: dinnerAt(t), Portions: 3,
		Courses: []runner.CourseView{{CourseID: 1, Main: true, Meal: &plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2, CourseID: 1}, RecipeID: 7, Batches: 0, Portions: 1, State: plan.StatePlanned,
			From: &plan.Source{From: plan.Key{Date: "2026-11-09", MealSlotID: 2, CourseID: 1}, LeftoverID: 5}}}},
	}
	out := slotFor(view, fixture())
	meal := out.Courses[0].Meal
	if meal == nil || meal.ServedFromLeftover == nil {
		t.Fatalf("meal is not served from a Leftover: %+v", meal)
	}
	if meal.CookMinutes != 0 || meal.StartBy != "" {
		t.Errorf("a Leftover-served meal must not carry cookMinutes or startBy, got cookMinutes=%d startBy=%q", meal.CookMinutes, meal.StartBy)
	}
	raw, err := json.Marshal(meal)
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"cookMinutes"`, `"startBy"`} {
		if strings.Contains(string(raw), key) {
			t.Errorf("JSON carries %s for a Leftover-served meal: %s", key, raw)
		}
	}
	if meal.PhotoURL == "" {
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

// R12: a meal served from a Leftover carries its Recipe's reheat time (minutes) so the Reheat screen can default to
// it; a fresh meal, or a Recipe without one, sends nothing.
func TestLeftoverServedMealCarriesTheRecipeReheatMinutes(t *testing.T) {
	leftover := func(recipeID int64) runner.SlotView {
		return runner.SlotView{
			Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, Name: "Dinner", Time: "19:30", At: dinnerAt(t), Portions: 3,
			Courses: []runner.CourseView{{CourseID: 1, Main: true, Meal: &plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2, CourseID: 1},
				RecipeID: recipeID, Batches: 0, Portions: 1, State: plan.StatePlanned,
				From: &plan.Source{From: plan.Key{Date: "2026-11-09", MealSlotID: 2, CourseID: 1}, LeftoverID: 5}}}},
		}
	}
	tbl := fixture()
	tbl.recipeReheat = map[int64]int{7: 4}

	out := slotFor(leftover(7), tbl)
	if out.Courses[0].Meal == nil || out.Courses[0].Meal.ReheatMinutes != 4 {
		t.Fatalf("reheatMinutes = %+v, want 4", out.Courses[0].Meal)
	}
	raw, _ := json.Marshal(out.Courses[0].Meal)
	if !strings.Contains(string(raw), `"reheatMinutes":4`) {
		t.Errorf("JSON lacks reheatMinutes: %s", raw)
	}

	none := slotFor(leftover(8), tbl)
	raw, _ = json.Marshal(none.Courses[0].Meal)
	if strings.Contains(string(raw), "reheatMinutes") {
		t.Errorf("a Recipe without a reheat time sends no key: %s", raw)
	}

	fresh := runner.SlotView{
		Key: plan.Key{Date: "2026-11-10", MealSlotID: 2}, Name: "Dinner", Time: "19:30", At: dinnerAt(t), Portions: 3,
		Courses: []runner.CourseView{{CourseID: 1, Main: true, Meal: &plan.Meal{Key: plan.Key{Date: "2026-11-10", MealSlotID: 2, CourseID: 1},
			RecipeID: 7, Batches: 1, Portions: 3, State: plan.StatePlanned}}},
	}
	raw, _ = json.Marshal(slotFor(fresh, tbl).Courses[0].Meal)
	if strings.Contains(string(raw), "reheatMinutes") {
		t.Errorf("a fresh meal is cooked, not reheated, so it sends no reheatMinutes: %s", raw)
	}
}
