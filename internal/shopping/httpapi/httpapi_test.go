package httpapi_test

import (
	"net/http"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

func seedIngredient(t *testing.T, env *testkit.Env, name, base string) int64 {
	t.Helper()
	res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
		VALUES (?, ?, ?, NULL, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name, base)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func TestEveryShoppingRouteRequiresSignIn(t *testing.T) {
	env := testkit.Start(t)
	anon := env.Anonymous()
	routes := []struct{ method, path string }{
		{"GET", "/api/shopping/list"}, {"POST", "/api/shopping/extras"}, {"DELETE", "/api/shopping/extras/1"},
		{"POST", "/api/shopping/extras/1/tick"}, {"DELETE", "/api/shopping/extras/1/tick"},
		{"POST", "/api/shopping/ticks"}, {"DELETE", "/api/shopping/ticks?ingredientId=1&to=2026-11-15"},
	}
	for _, rt := range routes {
		var body any
		if rt.method == "POST" {
			body = map[string]any{}
		}
		if r := anon.Do(rt.method, rt.path, body); r.Status != http.StatusUnauthorized || r.ErrorCode() != "unauthenticated" {
			t.Errorf("%s %s = %d %s", rt.method, rt.path, r.Status, r.Body)
		}
	}
}

func TestAnEmptyListHasTheRangeTheCurrencyAndEmptyArrays(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	r := c.Get("/api/shopping/list")
	var v map[string]any
	r.MustJSON(t, &v)
	if r.Status != 200 || v["today"] != "2026-11-09" || v["to"] != "2026-11-15" || v["defaultTo"] != "2026-11-15" || v["maxTo"] != "2026-11-15" ||
		v["currency"] != "USD" || v["complete"] != false || v["from"] != "2026-11-09" {
		t.Fatalf("list = %d %s", r.Status, r.Body)
	}
	for _, k := range []string{"lines", "extras"} {
		if arr, ok := v[k].([]any); !ok || len(arr) != 0 {
			t.Errorf("%s = %v, want []", k, v[k])
		}
	}
	if p, _ := v["progress"].(map[string]any); p["ticked"] != float64(0) || p["total"] != float64(0) {
		t.Errorf("progress = %v", v["progress"])
	}
}

func TestAChosenDateIsClampedAndAnUnknownShopIs404(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	var v map[string]any
	c.Get("/api/shopping/list?to=2027-01-01").MustJSON(t, &v)
	if v["to"] != "2026-11-15" {
		t.Errorf("to = %v, want it capped at the horizon", v["to"])
	}
	if r := c.Get("/api/shopping/list?shop=999"); r.Status != 404 || r.ErrorCode() != "not_found" {
		t.Errorf("unknown shop = %d %s", r.Status, r.Body)
	}
}

func TestManualExtrasStayInTheListUntilDeleted(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var text, ing struct {
		ID           int64    `json:"id"`
		Text         *string  `json:"text"`
		IngredientID *int64   `json:"ingredientId"`
		Quantity     *float64 `json:"quantity"`
	}
	r := c.Post("/api/shopping/extras", map[string]any{"text": "toilet paper"})
	r.MustJSON(t, &text)
	if r.Status != 201 || text.ID == 0 || text.Text == nil || *text.Text != "toilet paper" {
		t.Fatalf("text extra = %d %s", r.Status, r.Body)
	}
	r = c.Post("/api/shopping/extras", map[string]any{"ingredientId": milk, "quantity": 2000})
	r.MustJSON(t, &ing)
	if r.Status != 201 || ing.IngredientID == nil || *ing.IngredientID != milk || ing.Quantity == nil || *ing.Quantity != 2000 {
		t.Fatalf("Ingredient extra = %d %s", r.Status, r.Body)
	}
	var v struct {
		Extras []map[string]any `json:"extras"`
	}
	c.Get("/api/shopping/list").MustJSON(t, &v)
	if len(v.Extras) != 2 {
		t.Fatalf("extras in the list = %v", v.Extras)
	}
	if r := c.Delete("/api/shopping/extras/" + itoa(text.ID)); r.Status != 204 {
		t.Fatalf("delete = %d %s", r.Status, r.Body)
	}
	if r := c.Delete("/api/shopping/extras/" + itoa(text.ID)); r.Status != 404 {
		t.Fatalf("second delete = %d", r.Status)
	}
}

func TestBadExtrasAreRejected(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	for name, body := range map[string]map[string]any{
		"both":      {"text": "x", "ingredientId": milk, "quantity": 1},
		"neither":   {},
		"blank":     {"text": "   "},
		"no amount": {"ingredientId": milk},
		"negative":  {"ingredientId": milk, "quantity": -5},
	} {
		if r := c.Post("/api/shopping/extras", body); r.Status != 422 || r.ErrorCode() != "validation_failed" {
			t.Errorf("%s = %d %s", name, r.Status, r.Body)
		}
	}
	if r := c.Post("/api/shopping/extras", map[string]any{"ingredientId": 9999, "quantity": 5}); r.Status != 422 || r.ErrorCode() != "unknown_ingredient" {
		t.Errorf("unknown Ingredient = %d %s", r.Status, r.Body)
	}
}

func TestTickingByHandAddsAStockLotAndIsIdempotent(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	body := map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": 400, "clientUuid": "tick-1"}
	var first, second struct {
		Ticked  bool   `json:"ticked"`
		LotID   *int64 `json:"lotId"`
		Created bool   `json:"created"`
	}
	r := c.Post("/api/shopping/ticks", body)
	r.MustJSON(t, &first)
	if r.Status != 200 || !first.Ticked || first.LotID == nil || !first.Created {
		t.Fatalf("first = %d %s", r.Status, r.Body)
	}
	c.Post("/api/shopping/ticks", body).MustJSON(t, &second)
	if second.Created || second.LotID == nil || *second.LotID != *first.LotID {
		t.Fatalf("second = %+v, want the same Lot, not created", second)
	}
	var stock struct {
		Ingredients []struct {
			Total float64 `json:"total"`
		} `json:"ingredients"`
	}
	c.Get("/api/stock").MustJSON(t, &stock)
	if len(stock.Ingredients) != 1 || stock.Ingredients[0].Total != 400 {
		t.Fatalf("Stock = %+v, want 400 ml", stock)
	}
	if r := c.Delete("/api/shopping/ticks?ingredientId=" + itoa(milk) + "&to=2026-11-15"); r.Status != 204 {
		t.Fatalf("untick = %d %s", r.Status, r.Body)
	}
	if r := c.Post("/api/shopping/ticks", map[string]any{"ingredientId": milk, "to": "2026-11-15", "quantity": -1}); r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Fatalf("negative = %d %s", r.Status, r.Body)
	}
}

func TestEveryWritePublishesAShoppingEvent(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	ch, cancel := env.App.Deps.Events.Subscribe("shopping")
	defer cancel()
	c.Post("/api/shopping/extras", map[string]any{"text": "candles"})
	select {
	case ev := <-ch:
		if ev.Topic != "shopping" {
			t.Fatalf("event = %+v", ev)
		}
	default:
		t.Fatal("the extra was added but no shopping event was published before the response")
	}
}

func TestTickingAnExtraTwiceWithTheSameClientUUIDAddsOneLot(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	milk := seedIngredient(t, env, "milk", "ml")
	var x struct {
		ID int64 `json:"id"`
	}
	c.Post("/api/shopping/extras", map[string]any{"ingredientId": milk, "quantity": 3000}).MustJSON(t, &x)
	for i := 0; i < 2; i++ {
		if r := c.Post("/api/shopping/extras/"+itoa(x.ID)+"/tick", map[string]any{"quantity": 2000, "clientUuid": "tick-extra-1"}); r.Status != 200 {
			t.Fatalf("tick %d = %d %s", i, r.Status, r.Body)
		}
	}
	var lots struct {
		Lots []struct {
			Quantity float64 `json:"quantity"`
		} `json:"lots"`
	}
	c.Get("/api/stock/lots").MustJSON(t, &lots)
	if len(lots.Lots) != 1 || lots.Lots[0].Quantity != 2000 {
		t.Fatalf("Stock Lots = %+v, want one Lot of 2000 ml", lots.Lots)
	}
}

// ---- Courses (spec §9, ADR 0008, team G1) ----
// The Shopping List adapter reads every Planned Meal, whatever its Course. A Course covered by a Whole meal has
// no Planned Meal and needs nothing; a Planned Meal kept beside a Whole meal is a Planned Meal and counts.

// seedCourseDinner plants a Dinner on Tuesday 2026-11-10 and, for each (Course, Recipe, Batches), a Recipe with
// one 100 g line of the Ingredient named and a Planned Meal.
type courseMeal struct {
	course  string // courses.name
	recipe  string
	ingr    int64
	grams   float64
	batches float64
}

func seedCourseDinner(t *testing.T, env *testkit.Env, meals ...courseMeal) {
	t.Helper()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := env.DB.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	exec(`INSERT INTO meal_slots(id,weekday,name,time) VALUES (90,2,'Dinner','19:00')`)
	for i, m := range meals {
		rid := int64(100 + i)
		exec(`INSERT INTO recipes(id,name,yield,created_at,updated_at) VALUES (?,?,4,'2026-11-09T12:00:00Z','2026-11-09T12:00:00Z')`, rid, m.recipe)
		exec(`INSERT INTO recipe_lines(recipe_id,position,ingredient_id,quantity,unit) VALUES (?,0,?,?,'g')`, rid, m.ingr, m.grams)
		exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,created_at,updated_at)
			VALUES ('2026-11-10',90,(SELECT id FROM courses WHERE name=?),?,?,?,'2026-11-09T12:00:00Z','2026-11-09T12:00:00Z')`,
			m.course, rid, m.batches, m.batches*4)
	}
}

func shoppingNeeds(t *testing.T, c *testkit.Client) map[int64]float64 {
	t.Helper()
	var v struct {
		Lines []struct {
			IngredientID int64   `json:"ingredientId"`
			Need         float64 `json:"need"`
		} `json:"lines"`
	}
	r := c.Get("/api/shopping/list")
	r.MustJSON(t, &v)
	if r.Status != 200 {
		t.Fatalf("list = %d %s", r.Status, r.Body)
	}
	out := map[int64]float64{}
	for _, l := range v.Lines {
		out[l.IngredientID] = l.Need
	}
	return out
}

func TestTheShoppingListSumsEveryCourseOfASlot(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice, beans := seedIngredient(t, env, "rice", "g"), seedIngredient(t, env, "beans", "g")
	seedCourseDinner(t, env,
		courseMeal{"Main", "Risotto", rice, 300, 1},
		courseMeal{"Side", "Rice salad", rice, 100, 2},
		courseMeal{"Starter", "Bean soup", beans, 250, 1},
	)
	needs := shoppingNeeds(t, c)
	if needs[rice] != 500 { // 300 + 2 x 100
		t.Errorf("rice Need = %v, want 500 over the Main and the Side", needs[rice])
	}
	if needs[beans] != 250 {
		t.Errorf("beans Need = %v, want 250 from the Starter", needs[beans])
	}
}

func TestACourseSamOptsOutOfNeedsAProportionallySmallerBatch(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	cream := seedIngredient(t, env, "cream", "g")
	// The planner stored 3.5 portions of a yield-4 Dessert as 0.875 Batches (Course Attendance applied).
	seedCourseDinner(t, env, courseMeal{"Dessert", "Panna cotta", cream, 200, 0.875})
	if got := shoppingNeeds(t, c)[cream]; got != 175 {
		t.Errorf("cream Need = %v, want 175", got)
	}
}

func TestACoveredCourseNeedsNothingAndAKeptPlannedMealStillCounts(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	pasta, cake := seedIngredient(t, env, "pasta", "g"), seedIngredient(t, env, "cake mix", "g")
	// A Whole meal (a lasagne) covers the Side: it has no Planned Meal, so nothing is added for it. The Dessert
	// was kept beside the Whole meal, so it is a Planned Meal and counts as usual.
	seedCourseDinner(t, env,
		courseMeal{"Main", "Lasagne", pasta, 400, 1},
		courseMeal{"Dessert", "Sponge", cake, 150, 1},
	)
	needs := shoppingNeeds(t, c)
	if len(needs) != 2 || needs[pasta] != 400 || needs[cake] != 150 {
		t.Errorf("needs = %v, want 400 g pasta and 150 g cake mix only", needs)
	}
}
