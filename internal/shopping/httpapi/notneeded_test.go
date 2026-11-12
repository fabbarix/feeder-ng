package httpapi_test

import (
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// B5-SH: Not needed routes and the past-meal hint data. testkit's household date is Monday 2026-11-09; the default
// range ends 2026-11-15. seedCourseDinner (httpapi_test.go) plants the Tuesday 2026-11-10 Dinner (slot 90, 19:00).

type listPast struct {
	Date         string `json:"date"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	CourseName   string `json:"courseName"`
}

type listLine struct {
	IngredientID     int64      `json:"ingredientId"`
	Quantity         float64    `json:"quantity"`
	Ticked           bool       `json:"ticked"`
	PastPlannedMeals []listPast `json:"pastPlannedMeals"`
}

type notNeededList struct {
	To        string     `json:"to"`
	Lines     []listLine `json:"lines"`
	NotNeeded []listLine `json:"notNeeded"`
	Progress  struct {
		Ticked int `json:"ticked"`
		Total  int `json:"total"`
	} `json:"progress"`
	Complete bool `json:"complete"`
}

func getList(t *testing.T, c *testkit.Client, query string) notNeededList {
	t.Helper()
	var v notNeededList
	r := c.Get("/api/shopping/list" + query)
	r.MustJSON(t, &v)
	if r.Status != 200 {
		t.Fatalf("list = %d %s", r.Status, r.Body)
	}
	return v
}

func TestTheNotNeededRoutesRequireSignIn(t *testing.T) {
	env := testkit.Start(t)
	anon := env.Anonymous()
	if r := anon.Post("/api/shopping/not-needed", map[string]any{"ingredientId": 1, "to": "2026-11-15"}); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
		t.Errorf("POST = %d %s", r.Status, r.Body)
	}
	if r := anon.Delete("/api/shopping/not-needed/1?to=2026-11-15"); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
		t.Errorf("DELETE = %d %s", r.Status, r.Body)
	}
}

func TestAnEmptyListHasAnEmptyNotNeededArray(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	var v map[string]any
	c.Get("/api/shopping/list").MustJSON(t, &v)
	if arr, ok := v["notNeeded"].([]any); !ok || len(arr) != 0 {
		t.Fatalf("notNeeded = %v (%T), want []", v["notNeeded"], v["notNeeded"])
	}
}

func TestNotNeededMovesTheLineToTheNotNeededGroupAndAnswersTheList(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice, beans := seedIngredient(t, env, "rice", "g"), seedIngredient(t, env, "beans", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1}, courseMeal{"Starter", "Bean soup", beans, 250, 1})
	var got notNeededList
	r := c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-15"})
	r.MustJSON(t, &got)
	if r.Status != 200 {
		t.Fatalf("POST = %d %s", r.Status, r.Body)
	}
	if len(got.Lines) != 1 || got.Lines[0].IngredientID != beans || len(got.NotNeeded) != 1 || got.NotNeeded[0].IngredientID != rice || got.NotNeeded[0].Quantity != 300 {
		t.Fatalf("answer = %s; want beans in lines and rice 300 g Not needed", r.Body)
	}
	if got.Progress.Total != 1 || got.Progress.Ticked != 0 {
		t.Fatalf("progress = %+v, want 0 of 1 (Not needed counts nowhere)", got.Progress)
	}
	again := getList(t, c, "")
	if len(again.NotNeeded) != 1 || len(again.Lines) != 1 {
		t.Fatalf("GET after = %+v", again)
	}
}

func TestNotNeededAddsNoStockAndIsIdempotent(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	for i := 0; i < 2; i++ {
		if r := c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-15"}); r.Status != 200 {
			t.Fatalf("POST %d = %d %s", i+1, r.Status, r.Body)
		}
	}
	var lots struct {
		Lots []any `json:"lots"`
	}
	c.Get("/api/stock/lots").MustJSON(t, &lots)
	if len(lots.Lots) != 0 {
		t.Fatalf("Stock Lots = %v; Not needed adds none", lots.Lots)
	}
	if v := getList(t, c, ""); len(v.NotNeeded) != 1 {
		t.Fatalf("NotNeeded = %+v", v.NotNeeded)
	}
}

func TestNeededAfterAllPutsTheLineBackAndAMissingMarkIs404(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-15"})
	var got notNeededList
	r := c.Delete("/api/shopping/not-needed/" + itoa(rice) + "?to=2026-11-15")
	r.MustJSON(t, &got)
	if r.Status != 200 || len(got.Lines) != 1 || got.Lines[0].IngredientID != rice || len(got.NotNeeded) != 0 {
		t.Fatalf("DELETE = %d %s; want the list with rice back", r.Status, r.Body)
	}
	if r := c.Delete("/api/shopping/not-needed/" + itoa(rice) + "?to=2026-11-15"); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("second DELETE = %d %s", r.Status, r.Body)
	}
	if r := c.Delete("/api/shopping/not-needed/9999?to=2026-11-15"); r.Status != 404 {
		t.Errorf("unknown Ingredient DELETE = %d %s", r.Status, r.Body)
	}
	if r := c.Delete("/api/shopping/not-needed/abc?to=2026-11-15"); r.Status != 404 {
		t.Errorf("DELETE with a bad id = %d %s", r.Status, r.Body)
	}
}

func TestNotNeededErrors(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice, salt := seedIngredient(t, env, "rice", "g"), seedIngredient(t, env, "salt", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	if r := c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": 9999, "to": "2026-11-15"}); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown Ingredient = %d %s, want 404 not_found", r.Status, r.Body)
	}
	if r := c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": salt, "to": "2026-11-15"}); r.Status != 409 || r.ErrorCode() != "not_on_list" {
		t.Errorf("Ingredient with no Line = %d %s, want 409 not_on_list", r.Status, r.Body)
	}
	if r := c.Post("/api/shopping/not-needed", map[string]any{"to": "2026-11-15"}); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Errorf("no ingredientId = %d %s, want 422 validation_failed", r.Status, r.Body)
	}
	// A ticked line is not open: Not needed is for open lines only.
	if r := c.Post("/api/shopping/ticks", map[string]any{"ingredientId": rice, "to": "2026-11-15", "quantity": 0}); r.Status != 200 {
		t.Fatalf("tick = %d %s", r.Status, r.Body)
	}
	if r := c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-15"}); r.Status != 409 || r.ErrorCode() != "not_on_list" {
		t.Errorf("ticked line = %d %s, want 409 not_on_list", r.Status, r.Body)
	}
}

func TestANotNeededMarkBelongsToItsRange(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-12"})
	if v := getList(t, c, "?to=2026-11-13"); len(v.Lines) != 1 || len(v.NotNeeded) != 0 {
		t.Errorf("range to 11-13: %+v; the mark was for the range ending 11-12", v)
	}
	if v := getList(t, c, "?to=2026-11-12"); len(v.Lines) != 0 || len(v.NotNeeded) != 1 {
		t.Errorf("range to 11-12: %+v", v)
	}
}

func TestEveryNotNeededWritePublishesAShoppingEvent(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	ch, cancel := env.App.Deps.Events.Subscribe("shopping")
	defer cancel()
	c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-15"})
	select {
	case <-ch:
	default:
		t.Fatal("Not needed set but no shopping event was published before the response")
	}
	c.Delete("/api/shopping/not-needed/" + itoa(rice) + "?to=2026-11-15")
	select {
	case <-ch:
	default:
		t.Fatal("Needed after all but no shopping event was published before the response")
	}
}

// ---- past unconfirmed Planned Meals (Q19: the list already keeps them; the hint names them) ----

// seedPastDinner adds a Planned Meal of the Dinner slot 90 on Tuesday 2026-11-03, a week before "today", never
// marked Cooked or Not cooked.
func seedPastDinner(t *testing.T, env *testkit.Env, recipeID int64) {
	t.Helper()
	if _, err := env.DB.Exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,created_at,updated_at)
		VALUES ('2026-11-03',90,(SELECT id FROM courses WHERE name='Main'),?,1,4,'2026-11-02T12:00:00Z','2026-11-02T12:00:00Z')`, recipeID); err != nil {
		t.Fatal(err)
	}
}

func TestAPastUnconfirmedMealKeepsItsIngredientsOnTheListAndIsNamedOnTheLine(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1}) // Tuesday 2026-11-10, recipe 100
	seedPastDinner(t, env, 100)                                           // Tuesday 2026-11-03
	v := getList(t, c, "")
	if len(v.Lines) != 1 || v.Lines[0].IngredientID != rice || v.Lines[0].Quantity != 600 {
		t.Fatalf("Lines = %+v, want rice 600 g (300 g from each Tuesday)", v.Lines)
	}
	want := listPast{Date: "2026-11-03", MealSlotID: 90, MealSlotName: "Dinner", CourseName: "Main"}
	if got := v.Lines[0].PastPlannedMeals; len(got) != 1 || got[0] != want {
		t.Fatalf("pastPlannedMeals = %+v, want only %+v (the 10th is still ahead)", got, want)
	}
}

func TestEveryLineSendsPastPlannedMealsEvenWhenThereAreNone(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	c.Post("/api/shopping/not-needed", map[string]any{"ingredientId": rice, "to": "2026-11-15"})
	var raw struct {
		NotNeeded []map[string]any `json:"notNeeded"`
	}
	c.Get("/api/shopping/list").MustJSON(t, &raw)
	if len(raw.NotNeeded) != 1 {
		t.Fatalf("notNeeded = %v", raw.NotNeeded)
	}
	if arr, ok := raw.NotNeeded[0]["pastPlannedMeals"].([]any); !ok || len(arr) != 0 {
		t.Fatalf("pastPlannedMeals = %v (%T), want []", raw.NotNeeded[0]["pastPlannedMeals"], raw.NotNeeded[0]["pastPlannedMeals"])
	}
}
