package httpapi_test

import (
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// Cooked and Not cooked per Course, the slot-wide routes, the old per-slot aliases and the lists (spec §8, §16).

// dinner is the Dinner of the fixed clock with a Main (300 g chicken) and a Side (100 g beans, 4 portions) both
// planned today, Stock for both, and a Side-only Tuesday Lunch that can take the Side's Leftover.
type dinner struct {
	*crsc2.World
	chicken, beans int64
	roast, greens  int64
	lunch          int64
}

func newDinner(t *testing.T) dinner {
	t.Helper()
	w := crsc2.New(t)
	d := dinner{World: w}
	d.chicken, d.beans = w.Ingredient("chicken"), w.Ingredient("beans")
	d.roast = w.Recipe("Roast chicken", crsc2.RecipeSpec{Lines: []crsc2.Line{{Ingredient: d.chicken, Grams: 300}}})
	d.greens = w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Yield: 4, Lines: []crsc2.Line{{Ingredient: d.beans, Grams: 100}}})
	w.Stock(d.chicken, 1000)
	w.Stock(d.beans, 500)
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, d.roast, "planned", true)
	w.Meal(crsc2.Today, w.Slot, w.Side, d.greens, "planned", true)
	return d
}

type cookedBody struct {
	Meal     mealBody `json:"meal"`
	Leftover *struct {
		RecipeID       int64   `json:"recipeId"`
		Portions       float64 `json:"portions"`
		FromDate       string  `json:"fromDate"`
		FromMealSlotID int64   `json:"fromMealSlotId"`
		FromCourseID   int64   `json:"fromCourseId"`
	} `json:"leftover"`
	PlannedFor []struct {
		Date         string `json:"date"`
		MealSlotID   int64  `json:"mealSlotId"`
		MealSlotName string `json:"mealSlotName"`
		RecipeName   string `json:"recipeName"`
		CourseID     int64  `json:"courseId"`
	} `json:"plannedFor"`
}

func scope(d dinner, course int64) string {
	return "meal:" + crsc2.Today + "/" + itoa(d.Slot) + "/" + itoa(course)
}

func (d dinner) startTimer(course int64, label string) {
	d.T.Helper()
	if r := d.User.Post("/api/cook/timers", map[string]any{"scope": scope(d, course), "label": label, "durationSeconds": 600}); r.Status != 201 {
		d.T.Fatalf("start timer %q = %d %s", label, r.Status, r.Body)
	}
}

func (d dinner) timerLabels() string {
	d.T.Helper()
	var out struct {
		Timers []struct {
			Label string `json:"label"`
		} `json:"timers"`
	}
	d.User.Get("/api/cook/timers").MustJSON(d.T, &out)
	var ls []string
	for _, x := range out.Timers {
		ls = append(ls, x.Label)
	}
	return strings.Join(ls, ",")
}

func TestCookedMarksOneCourseDeductsItsStockAndRecordsItsLeftover(t *testing.T) {
	d := newDinner(t)
	d.startTimer(d.Main, "roast")
	d.startTimer(d.Side, "boil")
	r := d.User.Post(path(d.World, crsc2.Today, d.Side, "/cooked"), map[string]any{})
	if r.Status != 200 {
		t.Fatalf("cooked = %d %s", r.Status, r.Body)
	}
	var c cookedBody
	r.MustJSON(t, &c)
	if c.Meal.CourseID != d.Side || c.Meal.State != "cooked" {
		t.Errorf("meal = %+v", c.Meal)
	}
	// Anna and Sam eat the Side (2 portions) of 1 Batch x 4: the proposal keeps 2.
	if c.Leftover == nil || c.Leftover.Portions != 2 || c.Leftover.FromCourseID != d.Side || c.Leftover.FromDate != crsc2.Today || c.Leftover.RecipeID != d.greens {
		t.Errorf("leftover = %+v, want 2 portions from the Side", c.Leftover)
	}
	if d.MealState(crsc2.Today, d.Slot, d.Main) != "planned" || d.MealState(crsc2.Today, d.Slot, d.Side) != "cooked" {
		t.Error("Cooked on the Side must leave the Main planned")
	}
	if got := d.StockTotal(d.beans); got != 400 {
		t.Errorf("beans in Stock = %v, want 400 (the Side's Line only)", got)
	}
	if got := d.StockTotal(d.chicken); got != 1000 {
		t.Errorf("chicken in Stock = %v, want 1000 (the Main is not cooked)", got)
	}
	if got := d.timerLabels(); got != "roast" {
		t.Errorf("timers = %q, want only the Main's: the Side's were cancelled", got)
	}
	var ls struct {
		Leftovers []struct {
			FromCourseID int64 `json:"fromCourseId"`
		} `json:"leftovers"`
	}
	d.User.Get("/api/plan/leftovers").MustJSON(t, &ls)
	if len(ls.Leftovers) != 1 || ls.Leftovers[0].FromCourseID != d.Side {
		t.Errorf("leftovers = %+v, want one from the Side with its real Course id", ls.Leftovers)
	}
}

func TestCookedLeftoverIsPlannedForALaterMealAndNamesItsCourse(t *testing.T) {
	d := newDinner(t)
	d.lunch = d.AddSlot(2, "Lunch", "12:30", d.Side) // Tuesday, serves the Side only
	d.Settle()
	d.Meal(crsc2.Today, d.Slot, d.Main, d.roast, "planned", true)
	d.Meal(crsc2.Today, d.Slot, d.Side, d.greens, "planned", true)
	var c cookedBody
	d.User.Post(path(d.World, crsc2.Today, d.Side, "/cooked"), map[string]any{}).MustJSON(t, &c)
	if len(c.PlannedFor) != 1 {
		t.Fatalf("plannedFor = %+v, want the Tuesday Lunch", c.PlannedFor)
	}
	if p := c.PlannedFor[0]; p.Date != "2026-11-10" || p.MealSlotID != d.lunch || p.MealSlotName != "Lunch" || p.RecipeName != "Green beans" || p.CourseID != d.Side {
		t.Errorf("plannedFor = %+v, want the Side of Tuesday's Lunch", p)
	}
}

func TestCookedAndNotCookedOldPathsActOnTheMainCourseOnly(t *testing.T) {
	d := newDinner(t)
	r := d.User.Post(path(d.World, crsc2.Today, 0, "/cooked"), map[string]any{})
	var c cookedBody
	r.MustJSON(t, &c)
	if r.Status != 200 || c.Meal.CourseID != d.Main {
		t.Fatalf("old cooked = %d %s, want the main Course", r.Status, r.Body)
	}
	if d.MealState(crsc2.Today, d.Slot, d.Main) != "cooked" || d.MealState(crsc2.Today, d.Slot, d.Side) != "planned" {
		t.Error("the old per-slot Cooked path must never take the whole-slot meaning")
	}
	m := decodeMeal(t, d.User.Post(path(d.World, crsc2.Today, d.Side, "/not-cooked"), nil))
	if m.CourseID != d.Side || m.State != "skipped" {
		t.Errorf("Not cooked on the Side = %+v", m)
	}
	if d.MealState(crsc2.Today, d.Slot, d.Main) != "cooked" {
		t.Error("Not cooked on the Side touched the Main")
	}

	d2 := newDinner(t)
	m = decodeMeal(t, d2.User.Post(path(d2.World, crsc2.Today, 0, "/not-cooked"), nil))
	if m.CourseID != d2.Main || m.State != "skipped" || d2.MealState(crsc2.Today, d2.Slot, d2.Side) != "planned" {
		t.Errorf("old not-cooked = %+v, side %q; want the main Course only", m, d2.MealState(crsc2.Today, d2.Slot, d2.Side))
	}
}

func TestCookedAndNotCookedRefusals(t *testing.T) {
	d := newDinner(t)
	wantErr(t, "Cooked on a Course with no Planned Meal", d.User.Post(path(d.World, crsc2.Today, d.Dessert, "/cooked"), map[string]any{}), 404, "not_found")
	wantErr(t, "Not cooked on a Course with no Planned Meal", d.User.Post(path(d.World, crsc2.Today, d.Dessert, "/not-cooked"), nil), 404, "not_found")
	r := d.User.Post(path(d.World, crsc2.Today, d.Side, "/cooked"), map[string]any{"leftoverPortions": 99})
	var e errBody
	_ = r.JSON(&e)
	if r.Status != 422 || e.Error.Code != "validation_failed" || e.Error.Field != "leftoverPortions" {
		t.Errorf("too many Leftover portions = %d %s", r.Status, r.Body)
	}
	d.Meal(crsc2.NextMon, d.Slot, d.Side, d.greens, "planned", false)
	wantErr(t, "Cooked before its day", d.User.Post("/api/plan/"+crsc2.NextMon+"/"+itoa(d.Slot)+"/"+itoa(d.Side)+"/cooked", map[string]any{}), 409, "future_meal")
	if got := d.StockTotal(d.beans); got != 500 {
		t.Errorf("a refusal changed Stock: %v", got)
	}
}

type allBody struct {
	Meals     []mealBody `json:"meals"`
	Leftovers []struct {
		RecipeID     int64   `json:"recipeId"`
		Portions     float64 `json:"portions"`
		FromCourseID int64   `json:"fromCourseId"`
	} `json:"leftovers"`
	Warnings   []any `json:"warnings"`
	PlannedFor []any `json:"plannedFor"`
}

func count(changes []string, sub string) int {
	n := 0
	for _, c := range changes {
		if strings.Contains(c, sub) {
			n++
		}
	}
	return n
}

// collect gathers the events of a topic that arrive within a short window.
func collect(ch <-chan events.Event) []string {
	var out []string
	for {
		select {
		case e := <-ch:
			out = append(out, e.Topic+" "+string(e.Data))
		case <-time.After(400 * time.Millisecond):
			return out
		}
	}
}

func TestMarkAllCookedCooksEveryCourseInOneStepWithOneDeductionAndOnePlanEvent(t *testing.T) {
	d := newDinner(t)
	d.startTimer(d.Main, "roast")
	d.startTimer(d.Side, "boil")
	ch, cancel := d.Env.App.Deps.Events.Subscribe("plan", "stock")
	defer cancel()

	r := d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+"/all/cooked", map[string]any{"courses": []any{
		map[string]any{"courseId": d.Main, "leftoverPortions": 0},
		map[string]any{"courseId": d.Side, "leftoverPortions": 1},
	}})
	if r.Status != 200 {
		t.Fatalf("all/cooked = %d %s", r.Status, r.Body)
	}
	var a allBody
	r.MustJSON(t, &a)
	if len(a.Meals) != 2 || a.Meals[0].CourseID != d.Main || a.Meals[1].CourseID != d.Side || a.Meals[0].State != "cooked" || a.Meals[1].State != "cooked" {
		t.Errorf("meals = %+v, want Main then Side, both cooked", a.Meals)
	}
	if len(a.Leftovers) != 1 || a.Leftovers[0].FromCourseID != d.Side || a.Leftovers[0].Portions != 1 {
		t.Errorf("leftovers = %+v, want only the Side's 1 portion", a.Leftovers)
	}
	if d.StockTotal(d.chicken) != 700 || d.StockTotal(d.beans) != 400 {
		t.Errorf("Stock chicken %v beans %v, want 700 and 400", d.StockTotal(d.chicken), d.StockTotal(d.beans))
	}
	if got := d.timerLabels(); got != "" {
		t.Errorf("timers left: %q, want none (every Course's were cancelled)", got)
	}
	evs := collect(ch)
	if n := count(evs, `"reason":"leftovers_changed"`); n != 1 {
		t.Errorf("%d leftovers_changed plan events, want exactly 1: %v", n, evs)
	}
	if n := count(evs, "stock "); n != 1 {
		t.Errorf("%d stock events, want 1 (one deduction for the slot): %v", n, evs)
	}
}

func TestMarkAllCookedWithoutAListUsesTheProposalsOfEveryCourse(t *testing.T) {
	d := newDinner(t)
	r := d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+"/all/cooked", map[string]any{})
	var a allBody
	r.MustJSON(t, &a)
	if r.Status != 200 || len(a.Meals) != 2 {
		t.Fatalf("all/cooked = %d %s", r.Status, r.Body)
	}
	if len(a.Leftovers) != 1 || a.Leftovers[0].FromCourseID != d.Side || a.Leftovers[0].Portions != 2 {
		t.Errorf("leftovers = %+v, want the Side's proposed 2 (the Main's 2 portions are eaten)", a.Leftovers)
	}
}

func TestMarkAllCookedSkipsCoursesAlreadyResolved(t *testing.T) {
	d := newDinner(t)
	d.Exec(`UPDATE planned_meals SET state = 'cooked' WHERE course_id = ?`, d.Main)
	r := d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+"/all/cooked", map[string]any{})
	var a allBody
	r.MustJSON(t, &a)
	if r.Status != 200 || len(a.Meals) != 1 || a.Meals[0].CourseID != d.Side {
		t.Errorf("all/cooked = %d %s, want the Side only", r.Status, r.Body)
	}
	if d.StockTotal(d.chicken) != 1000 {
		t.Error("the already Cooked Main was deducted again")
	}
}

func TestMarkAllCookedIsAllOrNothing(t *testing.T) {
	d := newDinner(t)
	d.startTimer(d.Side, "boil")
	ch, cancel := d.Env.App.Deps.Events.Subscribe("plan", "stock")
	defer cancel()
	url := "/api/plan/" + crsc2.Today + "/" + itoa(d.Slot) + "/all/cooked"

	r := d.User.Post(url, map[string]any{"courses": []any{
		map[string]any{"courseId": d.Main, "leftoverPortions": 0},
		map[string]any{"courseId": d.Side, "leftoverPortions": 99},
	}})
	var e errBody
	_ = r.JSON(&e)
	if r.Status != 422 || e.Error.Code != "validation_failed" || e.Error.Field != "courses[1].leftoverPortions" {
		t.Errorf("a bad second Course = %d %s, want 422 validation_failed courses[1].leftoverPortions", r.Status, r.Body)
	}
	for _, c := range []int64{d.Main, d.Side} {
		if d.MealState(crsc2.Today, d.Slot, c) != "planned" {
			t.Errorf("Course %d was cooked although the request failed", c)
		}
	}
	if d.StockTotal(d.chicken) != 1000 || d.StockTotal(d.beans) != 500 {
		t.Error("Stock changed although the request failed")
	}
	if n := d.Count(`SELECT count(*) FROM leftovers`); n != 0 {
		t.Errorf("%d Leftovers recorded by a failed request", n)
	}
	if got := d.timerLabels(); got != "boil" {
		t.Errorf("timers = %q, want the Side's still running", got)
	}
	if evs := collect(ch); count(evs, "leftovers_changed") != 0 {
		t.Errorf("a failed request published %v", evs)
	}

	wantErr(t, "a Course the slot does not serve", d.User.Post(url, map[string]any{"courses": []any{map[string]any{"courseId": d.Dessert}}}), 422, "course_not_in_slot")
	d.Exec(`UPDATE planned_meals SET state = 'cooked' WHERE course_id = ?`, d.Main)
	wantErr(t, "a listed Course that is already Cooked", d.User.Post(url, map[string]any{"courses": []any{map[string]any{"courseId": d.Main}}}), 409, "already_resolved")
}

func TestMarkAllCookedAndNotCookedWholeSlotRefusals(t *testing.T) {
	d := newDinner(t)
	for _, suffix := range []string{"/all/cooked", "/all/not-cooked"} {
		wantErr(t, "no Planned Meal in the slot"+suffix, d.User.Post("/api/plan/2026-11-02/"+itoa(d.Slot)+suffix, map[string]any{}), 404, "not_found")
		wantErr(t, "no Meal Slot that weekday"+suffix, d.User.Post("/api/plan/2026-11-10/"+itoa(d.Slot)+suffix, map[string]any{}), 404, "unknown_slot")
	}
	d.Meal(crsc2.NextMon, d.Slot, d.Main, d.roast, "planned", false)
	for _, suffix := range []string{"/all/cooked", "/all/not-cooked"} {
		wantErr(t, "a day that is not due"+suffix, d.User.Post("/api/plan/"+crsc2.NextMon+"/"+itoa(d.Slot)+suffix, map[string]any{}), 409, "future_meal")
	}
	d.Exec(`UPDATE planned_meals SET state = 'cooked' WHERE date = ?`, crsc2.Today)
	for _, suffix := range []string{"/all/cooked", "/all/not-cooked"} {
		wantErr(t, "nothing unresolved"+suffix, d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+suffix, map[string]any{}), 409, "already_resolved")
	}
}

func TestNotCookedWholeSlotSkipsEveryUnresolvedCourseAndCancelsTheirTimers(t *testing.T) {
	d := newDinner(t)
	d.AddCourseToSlot(d.Slot, d.Starter, false)
	soup := d.Recipe("Soup", crsc2.RecipeSpec{Courses: []int64{d.Starter}})
	d.Settle()
	d.Meal(crsc2.Today, d.Slot, d.Main, d.roast, "planned", true)
	d.Meal(crsc2.Today, d.Slot, d.Side, d.greens, "planned", false)
	d.Meal(crsc2.Today, d.Slot, d.Starter, soup, "cooked", true)
	d.startTimer(d.Main, "roast")
	d.startTimer(d.Side, "boil")
	ch, cancel := d.Env.App.Deps.Events.Subscribe("plan", "stock")
	defer cancel()

	r := d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+"/all/not-cooked", nil)
	if r.Status != 200 {
		t.Fatalf("all/not-cooked = %d %s", r.Status, r.Body)
	}
	var a allBody
	r.MustJSON(t, &a)
	if len(a.Meals) != 2 || a.Meals[0].CourseID != d.Main || a.Meals[1].CourseID != d.Side || a.Meals[0].State != "skipped" || a.Meals[1].State != "skipped" {
		t.Errorf("meals = %+v, want the two Courses that changed, Main then Side, skipped", a.Meals)
	}
	if d.MealState(crsc2.Today, d.Slot, d.Starter) != "cooked" {
		t.Error("a Cooked Course must stay Cooked")
	}
	if d.StockTotal(d.chicken) != 1000 || d.StockTotal(d.beans) != 500 || d.Count(`SELECT count(*) FROM leftovers`) != 0 {
		t.Error("Not cooked changes no Stock and records no Leftover")
	}
	if got := d.timerLabels(); got != "" {
		t.Errorf("timers = %q, want none", got)
	}
	if n := count(collect(ch), `"reason":"not_cooked"`); n != 1 {
		t.Errorf("%d not_cooked plan events, want 1", n)
	}
	wantErr(t, "again", d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+"/all/not-cooked", nil), 409, "already_resolved")
}

func TestToConfirmListsEachUnconfirmedCourseWithItsCourse(t *testing.T) {
	d := newDinner(t)
	d.Exec(`DELETE FROM planned_meals`)
	d.Meal("2026-11-02", d.Slot, d.Main, d.roast, "planned", false)
	d.Meal("2026-11-02", d.Slot, d.Side, d.greens, "planned", false)
	var out struct {
		Slots []struct {
			Date       string    `json:"date"`
			MealSlotID int64     `json:"mealSlotId"`
			Name       string    `json:"name"`
			CourseID   int64     `json:"courseId"`
			CourseName string    `json:"courseName"`
			Meal       *mealBody `json:"meal"`
		} `json:"slots"`
	}
	d.User.Get("/api/plan/to-confirm").MustJSON(t, &out)
	if len(out.Slots) != 2 {
		t.Fatalf("to-confirm = %+v, want one entry per Course", out.Slots)
	}
	for i, want := range []struct {
		id   int64
		name string
	}{{d.Main, "Main"}, {d.Side, "Side"}} {
		e := out.Slots[i]
		if e.CourseID != want.id || e.CourseName != want.name || e.Name != "Dinner" || e.Date != "2026-11-02" || e.Meal == nil || e.Meal.CourseID != want.id {
			t.Errorf("entry %d = %+v, want the %s", i, e, want.name)
		}
	}
}

func TestCouldntPlanListsEachUnfilledCourseWithItsReason(t *testing.T) {
	d := newDinner(t)
	d.Exec(`DELETE FROM planned_meals`)
	d.Unfilled(crsc2.Today, d.Slot, d.Main, "no_candidates")
	d.Unfilled(crsc2.Today, d.Slot, d.Side, "no_course_recipes")
	var out struct {
		Slots []struct {
			Date       string        `json:"date"`
			CourseID   int64         `json:"courseId"`
			CourseName string        `json:"courseName"`
			Unfilled   *unfilledBody `json:"unfilled"`
		} `json:"slots"`
	}
	d.User.Get("/api/plan/couldnt-plan").MustJSON(t, &out)
	if len(out.Slots) != 2 {
		t.Fatalf("couldnt-plan = %+v, want one entry per Course", out.Slots)
	}
	if e := out.Slots[0]; e.CourseID != d.Main || e.CourseName != "Main" || e.Unfilled == nil || e.Unfilled.Reason != "no_candidates" {
		t.Errorf("first = %+v", e)
	}
	if e := out.Slots[1]; e.CourseID != d.Side || e.CourseName != "Side" || e.Unfilled == nil || e.Unfilled.Reason != "no_course_recipes" {
		t.Errorf("second = %+v", e)
	}
}
