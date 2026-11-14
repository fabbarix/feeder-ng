package httpapi_test

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B9-11 (PC-01, SAFE-03, SAFE-07): the plan API says what a write changed and gives an undo token; POST /api/plan/restore
// puts the plan back; POST .../reopen takes Cooked and Not cooked back. The fixture is the Dinner of cooked tests (newDinner):
// today a pinned Roast chicken Main and a pinned Green beans Side (yield 4), Stock for both.

type cellStateBody struct {
	RecipeID           int64  `json:"recipeId"`
	RecipeName         string `json:"recipeName"`
	ServedFromLeftover bool   `json:"servedFromLeftover"`
}

type changeBody struct {
	Date       string         `json:"date"`
	MealSlotID int64          `json:"mealSlotId"`
	CourseID   int64          `json:"courseId"`
	Before     *cellStateBody `json:"before"`
	After      *cellStateBody `json:"after"`
	Why        []whyBody      `json:"why"`
}

// replanBody is what every replanning write adds to its answer.
type replanBody struct {
	Changes   []changeBody `json:"changes"`
	UndoToken string       `json:"undoToken"`
}

// bigWeek is the Dinner of today plus a Tuesday Lunch served from the Leftover of today's Main: swapping the Main takes
// the Leftover away, so the Lunch must change. The Main is a Roast chicken for 4 (yield 4), cooked in 1 Batch.
type bigWeek struct {
	dinner
	big, pasta, lunchSlot int64
}

func newBigWeek(t *testing.T) bigWeek {
	t.Helper()
	d := newDinner(t)
	b := bigWeek{dinner: d}
	b.big = d.Recipe("Big roast", crsc2.RecipeSpec{Yield: 4, Lines: []crsc2.Line{{Ingredient: d.chicken, Grams: 300}}})
	b.pasta = d.Recipe("Pasta", crsc2.RecipeSpec{Lines: []crsc2.Line{{Ingredient: d.chicken, Grams: 100}}})
	b.lunchSlot = d.AddSlot(2, "Lunch", "12:30", d.Main)
	d.Settle()
	d.Meal(crsc2.Today, d.Slot, d.Main, b.big, "planned", true)
	d.Meal(crsc2.Today, d.Slot, d.Side, d.greens, "planned", true)
	d.LeftoverMeal("2026-11-10", b.lunchSlot, d.Main, b.big, crsc2.Today, d.Slot, d.Main)
	return b
}

// recipeAt is the Recipe stored at a cell (0 when empty).
func (b bigWeek) recipeAt(date string, slot, course int64) int64 {
	b.T.Helper()
	var id int64
	_ = b.Env.DB.QueryRow(`SELECT recipe_id FROM planned_meals WHERE date = ? AND meal_slot_id = ? AND course_id = ?`, date, slot, course).Scan(&id)
	return id
}

func (b bigWeek) swapMonday(to int64) *testkit.Response {
	b.T.Helper()
	return b.User.Put(path(b.World, crsc2.Today, b.Main, ""), map[string]any{"recipeId": to})
}

func TestSwapAnswersWithTheOtherCellsItChangedAndAnUndoToken(t *testing.T) {
	b := newBigWeek(t)
	r := b.swapMonday(b.pasta)
	if r.Status != 200 {
		t.Fatalf("PUT = %d %s", r.Status, r.Body)
	}
	var m struct {
		mealBody
		replanBody
	}
	r.MustJSON(t, &m)
	if m.RecipeID != b.pasta || m.CourseID != b.Main {
		t.Errorf("the answer is no longer the meal: %+v", m.mealBody)
	}
	if m.UndoToken == "" {
		t.Error("no undoToken")
	}
	var lunch *changeBody
	for i, c := range m.Changes {
		if c.Date == crsc2.Today && c.MealSlotID == b.Slot && c.CourseID == b.Main {
			t.Errorf("the target is listed in changes: %+v", c)
		}
		if c.Date == "2026-11-10" && c.MealSlotID == b.lunchSlot {
			lunch = &m.Changes[i]
		}
	}
	if lunch == nil {
		t.Fatalf("changes = %s, want Tuesday's Lunch, which lost its Leftover", r.Body)
	}
	if lunch.Before == nil || lunch.Before.RecipeID != b.big || lunch.Before.RecipeName != "Big roast" || !lunch.Before.ServedFromLeftover {
		t.Errorf("before = %+v, want the Big roast Leftover, named", lunch.Before)
	}
	if lunch.After != nil && lunch.After.RecipeName == "" {
		t.Errorf("after = %+v, want a Recipe name", lunch.After)
	}
	if lunch.Why == nil {
		t.Error("why is null; want a list")
	}
	noNull(t, r.Body, "changes")
}

func TestASwapThatChangesNothingElseAnswersWithAnEmptyChangesListAndAToken(t *testing.T) {
	d := newDinner(t)
	other := d.Recipe("Pasta", crsc2.RecipeSpec{})
	r := d.User.Put(path(d.World, crsc2.Today, d.Main, ""), map[string]any{"recipeId": other})
	var b replanBody
	r.MustJSON(t, &b)
	if r.Status != 200 || b.UndoToken == "" || len(b.Changes) != 0 {
		t.Errorf("PUT = %d %s, want an undoToken and changes []", r.Status, r.Body)
	}
	noNull(t, r.Body, "changes")
	if !strings.Contains(string(r.Body), `"changes":[]`) {
		t.Errorf("body %s lacks changes: []", r.Body)
	}
}

func TestUndoPutsEveryChangedMealBack(t *testing.T) {
	b := newBigWeek(t)
	var sw replanBody
	b.swapMonday(b.pasta).MustJSON(t, &sw)
	if b.recipeAt(crsc2.Today, b.Slot, b.Main) != b.pasta {
		t.Fatal("set-up: Monday is not the Pasta")
	}
	r := b.User.Post("/api/plan/restore", map[string]any{"undoToken": sw.UndoToken})
	if r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	var res struct {
		Changes []changeBody `json:"changes"`
	}
	r.MustJSON(t, &res)
	if len(res.Changes) == 0 {
		t.Errorf("restore changes = %s, want the cells it put back", r.Body)
	}
	if got := b.recipeAt(crsc2.Today, b.Slot, b.Main); got != b.big {
		t.Errorf("Monday's Main = %d after Undo, want the Big roast %d", got, b.big)
	}
	if got := b.Count(`SELECT count(*) FROM planned_meals WHERE date = '2026-11-10' AND meal_slot_id = ? AND recipe_id = ? AND from_date = ?`, b.lunchSlot, b.big, crsc2.Today); got != 1 {
		t.Error("Tuesday's Lunch is not the Leftover of Monday's Main again")
	}
	if got := b.Count(`SELECT count(*) FROM planned_meals WHERE date = ? AND meal_slot_id = ? AND course_id = ? AND pinned = 1`, crsc2.Today, b.Slot, b.Main); got != 1 {
		t.Error("Monday's Main is not Pinned the way it was")
	}
}

func TestUndoAfterAnotherEditAnswersConflictAndChangesNothing(t *testing.T) {
	b := newBigWeek(t)
	var first, second replanBody
	b.swapMonday(b.pasta).MustJSON(t, &first)
	b.swapMonday(b.big).MustJSON(t, &second)
	r := b.User.Post("/api/plan/restore", map[string]any{"undoToken": first.UndoToken})
	wantErr(t, "restore with the older token", r, 409, "plan_changed")
	if got := b.recipeAt(crsc2.Today, b.Slot, b.Main); got != b.big {
		t.Errorf("a refused Undo changed Monday's Main to %d", got)
	}
	wantErr(t, "restore the same token twice", b.User.Post("/api/plan/restore", map[string]any{"undoToken": second.UndoToken}), 200, "")
	wantErr(t, "restore the same token twice", b.User.Post("/api/plan/restore", map[string]any{"undoToken": second.UndoToken}), 409, "plan_changed")
}

func TestRestoreRefusals(t *testing.T) {
	d := newDinner(t)
	wantErr(t, "an unknown token", d.User.Post("/api/plan/restore", map[string]any{"undoToken": "nope"}), 404, "not_found")
	r := d.User.Post("/api/plan/restore", map[string]any{})
	var e errBody
	_ = r.JSON(&e)
	if r.Status != 422 || e.Error.Code != "validation_failed" || e.Error.Field != "undoToken" {
		t.Errorf("no token = %d %s, want 422 validation_failed on undoToken", r.Status, r.Body)
	}
	if r := d.Env.Anonymous().Post("/api/plan/restore", map[string]any{"undoToken": "x"}); r.Status != 401 {
		t.Errorf("anonymous restore = %d, want 401", r.Status)
	}
}

func TestPinAndUnpinAnswerWithChangesAndAToken(t *testing.T) {
	d := newDinner(t)
	for _, suffix := range []string{"/unpin", "/confirm"} {
		r := d.User.Post(path(d.World, crsc2.Today, d.Main, suffix), nil)
		var b replanBody
		r.MustJSON(t, &b)
		if r.Status != 200 || b.UndoToken == "" || b.Changes == nil {
			t.Errorf("POST %s = %d %s, want changes [] (or cells) and an undoToken", suffix, r.Status, r.Body)
		}
	}
}

// unpinnedWeek is newDinner plus a Wednesday to Sunday Dinner (a Main each) whose Planned Meals are all the same
// unpinned Pasta: Regenerate cannot keep that, so it changes cells.
func unpinnedWeek(t *testing.T) dinner {
	t.Helper()
	d := newDinner(t)
	var recipes []int64
	for _, n := range []string{"Pasta", "Soup", "Curry", "Pizza", "Stew"} {
		recipes = append(recipes, d.Recipe(n, crsc2.RecipeSpec{Lines: []crsc2.Line{{Ingredient: d.chicken, Grams: 10}}}))
	}
	slots := map[string]int64{}
	for i, date := range []string{"2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15"} {
		slots[date] = d.AddSlot(3+i, "Dinner", "19:00", d.Main)
	}
	d.Settle()
	d.Meal(crsc2.Today, d.Slot, d.Main, d.roast, "planned", true)
	d.Meal(crsc2.Today, d.Slot, d.Side, d.greens, "planned", true)
	for date, slot := range slots {
		d.Meal(date, slot, d.Main, recipes[0], "planned", false)
	}
	return d
}

func (d dinner) recipesByDate() map[string]int64 {
	d.T.Helper()
	out := map[string]int64{}
	rows, err := d.Env.DB.Query(`SELECT date, recipe_id FROM planned_meals ORDER BY date, meal_slot_id, course_id`)
	if err != nil {
		d.T.Fatal(err)
	}
	defer rows.Close()
	for rows.Next() {
		var date string
		var id int64
		_ = rows.Scan(&date, &id)
		out[date+"/"+itoa(int64(len(out)))] = id
	}
	return out
}

func TestRegenerateAnswersWithTheCountItChangedAndAnUndoThatRestoresThePlan(t *testing.T) {
	d := unpinnedWeek(t)
	before := d.recipesByDate()
	r := d.User.Post("/api/plan/regenerate", nil)
	var out struct {
		replanBody
		Changed int `json:"changed"`
	}
	r.MustJSON(t, &out)
	if r.Status != 200 || out.Changed == 0 || out.Changed != len(out.Changes) {
		t.Fatalf("regenerate = %d %s, want changed above 0 and equal to the length of changes", r.Status, r.Body)
	}
	if out.UndoToken == "" {
		t.Fatal("Regenerate changed the plan and issued no undoToken")
	}
	var raw map[string]any
	_ = json.Unmarshal(r.Body, &raw)
	for _, k := range []string{"placed", "kept", "unfilled", "changed", "changes", "undoToken"} {
		if _, ok := raw[k]; !ok {
			t.Errorf("the answer lacks %q: %s", k, r.Body)
		}
	}
	if len(d.recipesByDate()) > 0 && equalMaps(d.recipesByDate(), before) {
		t.Fatal("set-up: Regenerate changed nothing")
	}
	if r := d.User.Post("/api/plan/restore", map[string]any{"undoToken": out.UndoToken}); r.Status != 200 {
		t.Fatalf("restore = %d %s", r.Status, r.Body)
	}
	if got := d.recipesByDate(); !equalMaps(got, before) {
		t.Errorf("after Undo the plan is %v, want %v", got, before)
	}
}

func equalMaps(a, b map[string]int64) bool {
	if len(a) != len(b) {
		return false
	}
	for k, v := range a {
		if b[k] != v {
			return false
		}
	}
	return true
}

func TestRegenerateThatChangesNothingHasNoToken(t *testing.T) {
	d := newDinner(t) // Monday's Main and Side are Pinned and there is nothing else to plan
	r := d.User.Post("/api/plan/regenerate", nil)
	var raw map[string]any
	_ = json.Unmarshal(r.Body, &raw)
	if r.Status != 200 || raw["changed"] != float64(0) {
		t.Fatalf("regenerate = %d %s, want changed 0", r.Status, r.Body)
	}
	if tok, ok := raw["undoToken"]; ok && tok != "" {
		t.Errorf("undoToken = %v although nothing changed", tok)
	}
}

func TestRegenerateDryRunWritesNoSnapshotAndNoToken(t *testing.T) {
	d := newDinner(t)
	r := d.User.Post("/api/plan/regenerate?dryRun=1", nil)
	if r.Status != 200 || strings.Contains(string(r.Body), "undoToken") {
		t.Errorf("dry run = %d %s, want no undoToken", r.Status, r.Body)
	}
	if n := d.Count(`SELECT count(*) FROM plan_snapshots`); n != 0 {
		t.Errorf("a dry run wrote %d snapshots", n)
	}
}

// --- Reopen ---

type reopenBody struct {
	Meals     []mealBody `json:"meals"`
	StockGone int        `json:"stockGone"`
}

func TestReopenCookedPutsTheStockBackAndTheMealOpen(t *testing.T) {
	d := newDinner(t)
	d.User.Post(path(d.World, crsc2.Today, d.Main, "/cooked"), map[string]any{})
	if got := d.StockTotal(d.chicken); got != 700 {
		t.Fatalf("set-up: chicken = %v after Cooked, want 700", got)
	}
	r := d.User.Post(path(d.World, crsc2.Today, d.Main, "/reopen"), nil)
	if r.Status != 200 {
		t.Fatalf("reopen = %d %s", r.Status, r.Body)
	}
	var out reopenBody
	r.MustJSON(t, &out)
	if len(out.Meals) != 1 || out.Meals[0].CourseID != d.Main || out.Meals[0].State != "planned" || out.StockGone != 0 {
		t.Errorf("reopen = %s, want the Main planned again and no Lot gone", r.Body)
	}
	if got := d.StockTotal(d.chicken); got != 1000 {
		t.Errorf("chicken = %v after Undo, want the 1000 g back", got)
	}
	noNull(t, r.Body, "meals")
	if d.MealState(crsc2.Today, d.Slot, d.Side) != "planned" {
		t.Error("the Side was touched")
	}
	// Idempotent: the Undo of an Undo that already happened is not an error, and gives nothing back twice.
	r = d.User.Post(path(d.World, crsc2.Today, d.Main, "/reopen"), nil)
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Meals) != 0 || d.StockTotal(d.chicken) != 1000 {
		t.Errorf("second reopen = %d %s, chicken %v; want 200, meals [], 1000 g", r.Status, r.Body, d.StockTotal(d.chicken))
	}
}

func TestReopenReportsAStockLotThatIsGone(t *testing.T) {
	d := newDinner(t)
	d.User.Post(path(d.World, crsc2.Today, d.Main, "/cooked"), map[string]any{})
	d.Exec(`DELETE FROM stock_lots WHERE ingredient_id = ?`, d.chicken) // used up since
	r := d.User.Post(path(d.World, crsc2.Today, d.Main, "/reopen"), nil)
	var out reopenBody
	r.MustJSON(t, &out)
	if r.Status != 200 || out.StockGone != 1 || d.MealState(crsc2.Today, d.Slot, d.Main) != "planned" {
		t.Errorf("reopen = %d %s, want 200 with stockGone 1 and the meal planned", r.Status, r.Body)
	}
}

func TestReopenCookedIsRefusedOnceSomeOfItsLeftoverWasHad(t *testing.T) {
	d := newDinner(t)
	var c cookedBody
	d.User.Post(path(d.World, crsc2.Today, d.Side, "/cooked"), map[string]any{}).MustJSON(t, &c)
	var ls struct {
		Leftovers []struct {
			ID int64 `json:"id"`
		} `json:"leftovers"`
	}
	d.User.Get("/api/plan/leftovers").MustJSON(t, &ls)
	if len(ls.Leftovers) != 1 {
		t.Fatalf("set-up: leftovers = %+v", ls)
	}
	if r := d.User.Post("/api/plan/leftovers/"+itoa(ls.Leftovers[0].ID)+"/had-it", map[string]any{"portions": 1}); r.Status != 200 {
		t.Fatalf("had-it = %d %s", r.Status, r.Body)
	}
	wantErr(t, "reopen", d.User.Post(path(d.World, crsc2.Today, d.Side, "/reopen"), nil), 409, "leftover_used")
	if d.MealState(crsc2.Today, d.Slot, d.Side) != "cooked" || d.StockTotal(d.beans) != 400 {
		t.Error("a refused reopen changed the meal or the Stock")
	}
}

func TestReopenIsRefusedAfterTheHouseholdDay(t *testing.T) {
	d := newDinner(t)
	d.User.Post(path(d.World, crsc2.Today, d.Main, "/cooked"), map[string]any{})
	d.Env.Clock.Advance(13 * time.Hour) // 01:00 the next day (the fixed clock is 12:00, the household zone UTC)
	wantErr(t, "reopen the next day", d.User.Post(path(d.World, crsc2.Today, d.Main, "/reopen"), nil), 409, "reopen_window_over")
	if d.StockTotal(d.chicken) != 700 {
		t.Error("a refused reopen gave Stock back")
	}
}

func TestReopenOfAMealThatWasNeverMarkedThroughTheAppIsRefused(t *testing.T) {
	d := newDinner(t)
	d.Exec(`UPDATE planned_meals SET state = 'cooked' WHERE course_id = ?`, d.Main) // a mark from before the records
	wantErr(t, "reopen with no record", d.User.Post(path(d.World, crsc2.Today, d.Main, "/reopen"), nil), 409, "reopen_window_over")
}

func TestNotCookedCanBeReopenedAndThenCookedAfterAll(t *testing.T) {
	d := newDinner(t)
	d.User.Post(path(d.World, crsc2.Today, d.Main, "/not-cooked"), nil)
	if d.MealState(crsc2.Today, d.Slot, d.Main) != "skipped" {
		t.Fatal("set-up: not skipped")
	}
	r := d.User.Post(path(d.World, crsc2.Today, d.Main, "/reopen"), nil)
	if r.Status != 200 || d.MealState(crsc2.Today, d.Slot, d.Main) != "planned" {
		t.Fatalf("reopen = %d %s", r.Status, r.Body)
	}
	if r := d.User.Post(path(d.World, crsc2.Today, d.Main, "/cooked"), map[string]any{}); r.Status != 200 {
		t.Errorf("Cooked after all = %d %s", r.Status, r.Body)
	}
	if d.StockTotal(d.chicken) != 700 {
		t.Errorf("chicken = %v, want 700 after Cooked after all", d.StockTotal(d.chicken))
	}
}

func TestReopenAllRoutesReopenEveryCourseOfAMarkAll(t *testing.T) {
	d := newDinner(t)
	if r := d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+"/all/cooked", map[string]any{}); r.Status != 200 {
		t.Fatalf("mark all Cooked = %d %s", r.Status, r.Body)
	}
	if d.StockTotal(d.chicken) != 700 || d.StockTotal(d.beans) != 400 {
		t.Fatal("set-up: Stock not taken")
	}
	r := d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+"/all/reopen", nil)
	var out reopenBody
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Meals) != 2 || d.StockTotal(d.chicken) != 1000 || d.StockTotal(d.beans) != 500 {
		t.Errorf("reopen all = %d %s; chicken %v, beans %v; want both Courses open and all the Stock back", r.Status, r.Body, d.StockTotal(d.chicken), d.StockTotal(d.beans))
	}
}

func TestTheOldPerSlotReopenPathsDoNotExist(t *testing.T) {
	d := newDinner(t)
	r := d.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(d.Slot)+"/reopen", nil)
	if r.Status != 404 {
		t.Errorf("POST .../{slotId}/reopen = %d, want 404 like the other Course-less paths", r.Status)
	}
}

// --- what the Planned Meal sheet reads ---

type resolutionBody struct {
	Kind             string  `json:"kind"`
	MarkedOn         string  `json:"markedOn"`
	MarkedAt         string  `json:"markedAt"`
	MarkedBy         string  `json:"markedBy"`
	LeftoverPortions float64 `json:"leftoverPortions"`
	CanUndo          bool    `json:"canUndo"`
	CannotUndo       string  `json:"cannotUndo"`
}

func resolutionOf(t *testing.T, d dinner, course int64) *resolutionBody {
	t.Helper()
	var out struct {
		Slots []struct {
			Courses []struct {
				CourseID int64 `json:"courseId"`
				Meal     *struct {
					Resolution *resolutionBody `json:"resolution"`
				} `json:"meal"`
			} `json:"courses"`
		} `json:"slots"`
	}
	d.User.Get("/api/plan?from="+crsc2.Today+"&to="+crsc2.Today).MustJSON(t, &out)
	for _, c := range out.Slots[0].Courses {
		if c.CourseID == course && c.Meal != nil {
			return c.Meal.Resolution
		}
	}
	t.Fatalf("no meal for Course %d in the plan", course)
	return nil
}

func TestThePlanSaysHowAMealWasMarkedAndWhetherItCanBeUndone(t *testing.T) {
	d := newDinner(t)
	if r := resolutionOf(t, d, d.Side); r != nil {
		t.Errorf("an open meal has resolution %+v, want null", r)
	}
	d.User.Post(path(d.World, crsc2.Today, d.Side, "/cooked"), map[string]any{})
	r := resolutionOf(t, d, d.Side)
	if r == nil || r.Kind != "cooked" || r.MarkedOn != crsc2.Today || r.MarkedBy != "User" || r.LeftoverPortions != 2 || !r.CanUndo || r.CannotUndo != "" || r.MarkedAt == "" {
		t.Fatalf("resolution = %+v, want cooked today by User with 2 Leftover portions, undoable", r)
	}
	if _, err := time.Parse(time.RFC3339, r.MarkedAt); err != nil {
		t.Errorf("markedAt %q is not an RFC 3339 time", r.MarkedAt)
	}
	d.User.Post(path(d.World, crsc2.Today, d.Main, "/not-cooked"), nil)
	if r := resolutionOf(t, d, d.Main); r == nil || r.Kind != "not_cooked" || !r.CanUndo {
		t.Errorf("Not cooked resolution = %+v", r)
	}
	d.Env.Clock.Advance(13 * time.Hour)
	if r := resolutionOf(t, d, d.Side); r == nil || r.CanUndo || r.CannotUndo != "window_over" {
		t.Errorf("the next day = %+v, want canUndo false because window_over", r)
	}
}
