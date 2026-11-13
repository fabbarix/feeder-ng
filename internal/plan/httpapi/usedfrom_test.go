package httpapi_test

import (
	"fmt"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// Used from over HTTP (ADR 0011, docs/dev/design/b5-ufr.md). The fixture is the C2 Dinner of the fixed clock: a Main
// (Roast chicken, 300 g chicken) and a Side (Green beans, 100 g beans), both planned today. Chicken is in two Lots,
// beans in one, each with an explicit go-off date, so the default order is not the order they were added:
//
//	chicken A: 200 g, bought 2026-11-01, goes off 2026-11-20, Not sorted
//	chicken B: 250 g, bought 2026-11-05, goes off 2026-11-11, in the Garage Fridge   <- default first
//	beans   C: 500 g, bought 2026-11-03, goes off 2026-11-15, Not sorted

type ufWorld struct {
	dinner
	a, b, c int64
}

func newUF(t *testing.T) ufWorld {
	t.Helper()
	w := crsc2.New(t)
	d := dinner{World: w}
	d.chicken, d.beans = w.Ingredient("chicken"), w.Ingredient("beans")
	d.roast = w.Recipe("Roast chicken", crsc2.RecipeSpec{Lines: []crsc2.Line{{Ingredient: d.chicken, Grams: 300}}})
	d.greens = w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}, Yield: 4, Lines: []crsc2.Line{{Ingredient: d.beans, Grams: 100}}})
	u := ufWorld{dinner: d}
	var place struct {
		ID int64 `json:"id"`
	}
	w.Admin.Post("/api/storage-places", map[string]any{"name": "Garage Fridge", "kind": "fridge"}).MustJSON(t, &place)
	u.a = u.lot(d.chicken, 200, "2026-11-01", "2026-11-20", 0)
	u.b = u.lot(d.chicken, 250, "2026-11-05", "2026-11-11", place.ID)
	u.c = u.lot(d.beans, 500, "2026-11-03", "2026-11-15", 0)
	w.Settle()
	w.Meal(crsc2.Today, w.Slot, w.Main, d.roast, "planned", true)
	w.Meal(crsc2.Today, w.Slot, w.Side, d.greens, "planned", true)
	return u
}

func (u ufWorld) lot(ingredient int64, grams float64, purchased, goesOff string, place int64) int64 {
	u.T.Helper()
	body := map[string]any{"ingredientId": ingredient, "quantity": grams, "purchased": purchased}
	if place != 0 {
		body["storagePlaceId"] = place
	}
	var out struct {
		ID int64 `json:"id"`
	}
	if r := u.Admin.Post("/api/stock/lots", body); r.Status != 201 || r.JSON(&out) != nil {
		u.T.Fatalf("add a Lot = %d %s", r.Status, r.Body)
	}
	if r := u.Admin.Do("PATCH", fmt.Sprintf("/api/stock/lots/%d", out.ID), map[string]any{"goesOff": goesOff}); r.Status != 200 {
		u.T.Fatalf("set go-off of Lot %d = %d %s", out.ID, r.Status, r.Body)
	}
	return out.ID
}

// held is what Stock holds per Lot id of the Ingredient (a Lot that is gone is absent).
func (u ufWorld) held(ingredient int64) map[int64]float64 {
	u.T.Helper()
	var out struct {
		Lots []struct {
			ID       int64   `json:"id"`
			Quantity float64 `json:"quantity"`
		} `json:"lots"`
	}
	r := u.Admin.Get(fmt.Sprintf("/api/stock/lots?ingredientId=%d", ingredient))
	if r.Status != 200 || r.JSON(&out) != nil {
		u.T.Fatalf("list Lots = %d %s", r.Status, r.Body)
	}
	m := map[int64]float64{}
	for _, l := range out.Lots {
		m[l.ID] = l.Quantity
	}
	return m
}

func (u ufWorld) wantChicken(label string, a, b float64) {
	u.T.Helper()
	want := map[int64]float64{}
	if a > 0 {
		want[u.a] = a
	}
	if b > 0 {
		want[u.b] = b
	}
	if got := u.held(u.chicken); !reflect.DeepEqual(got, want) {
		u.T.Errorf("%s: chicken Lots = %v, want %v", label, got, want)
	}
}

type pickBody = map[string]any

func usedFrom(ingredient int64, picks ...[2]float64) []pickBody {
	lots := []pickBody{}
	for _, p := range picks {
		lots = append(lots, pickBody{"lotId": int64(p[0]), "quantity": p[1]})
	}
	return []pickBody{{"ingredientId": ingredient, "lots": lots}}
}

type previewBody struct {
	Needs []struct {
		IngredientID int64   `json:"ingredientId"`
		Ingredient   string  `json:"ingredient"`
		Quantity     float64 `json:"quantity"`
		BaseUnit     string  `json:"baseUnit"`
		Lots         []struct {
			ID               int64   `json:"id"`
			Quantity         float64 `json:"quantity"`
			Purchased        string  `json:"purchased"`
			GoesOff          *string `json:"goesOff"`
			StoragePlaceName string  `json:"storagePlaceName"`
		} `json:"lots"`
	} `json:"needs"`
}

func TestCookPreviewListsTheLotsOfEachNeedInDefaultOrder(t *testing.T) {
	u := newUF(t)
	r := u.User.Get(path(u.World, crsc2.Today, u.Main, "/cook"))
	if r.Status != 200 {
		t.Fatalf("cook preview = %d %s", r.Status, r.Body)
	}
	var p previewBody
	r.MustJSON(t, &p)
	if len(p.Needs) != 1 {
		t.Fatalf("needs = %+v, want the chicken line only", p.Needs)
	}
	n := p.Needs[0]
	if n.IngredientID != u.chicken || n.Ingredient != "chicken" || n.Quantity != 300 || n.BaseUnit != "g" {
		t.Errorf("need = %+v, want 300 g chicken with its baseUnit", n)
	}
	if len(n.Lots) != 2 {
		t.Fatalf("lots = %+v, want both chicken Lots", n.Lots)
	}
	b, a := n.Lots[0], n.Lots[1]
	if b.ID != u.b || b.Quantity != 250 || b.Purchased != "2026-11-05" || b.GoesOff == nil || *b.GoesOff != "2026-11-11" || b.StoragePlaceName != "Garage Fridge" {
		t.Errorf("first Lot = %+v, want the Lot that goes off soonest, with its Storage Place", b)
	}
	if a.ID != u.a || a.Quantity != 200 || a.Purchased != "2026-11-01" || a.GoesOff == nil || *a.GoesOff != "2026-11-20" || a.StoragePlaceName != "" {
		t.Errorf("second Lot = %+v, want the other Lot, Not sorted as an empty storagePlaceName", a)
	}
}

func TestCookPreviewOfAnIngredientWithoutStockHasAnEmptyLotList(t *testing.T) {
	u := newUF(t)
	u.Exec(`DELETE FROM stock_lots WHERE ingredient_id = ?`, u.beans)
	r := u.User.Get(path(u.World, crsc2.Today, u.Side, "/cook"))
	if r.Status != 200 {
		t.Fatalf("cook preview = %d %s", r.Status, r.Body)
	}
	noNull(t, r.Body, "lots")
	var p previewBody
	r.MustJSON(t, &p)
	if len(p.Needs) != 1 || p.Needs[0].BaseUnit != "g" || len(p.Needs[0].Lots) != 0 {
		t.Errorf("needs = %+v, want the beans line with baseUnit and no Lots", p.Needs)
	}
}

func TestCookedWithoutUsedFromTakesTheLotThatGoesOffSoonestFirst(t *testing.T) {
	for name, body := range map[string]map[string]any{
		"no body field": {},
		"empty list":    {"usedFrom": []pickBody{}},
		"null":          {"usedFrom": nil},
	} {
		t.Run(name, func(t *testing.T) {
			u := newUF(t)
			r := u.User.Post(path(u.World, crsc2.Today, u.Main, "/cooked"), body)
			if r.Status != 200 {
				t.Fatalf("cooked = %d %s", r.Status, r.Body)
			}
			u.wantChicken("default order", 150, 0) // B (250) is gone, 50 g from A
		})
	}
}

func (u ufWorld) cookMain(body map[string]any) *testkit.Response {
	u.T.Helper()
	return u.User.Post(path(u.World, crsc2.Today, u.Main, "/cooked"), body)
}

func TestCookedWithUsedFromTakesThePickedLotsFirstThenTheRestInDefaultOrder(t *testing.T) {
	cases := []struct {
		name  string
		picks [][2]float64 // by Lot: 0 = A, 1 = B
		a, b  float64      // chicken left in A and B (0 = gone)
	}{
		{"all of the Lot that goes off later", [][2]float64{{0, 200}}, 0, 150},
		{"part of it, the rest from the default Lot", [][2]float64{{0, 100}}, 100, 50},
		{"two Lots, in the order given", [][2]float64{{0, 100}, {1, 200}}, 100, 50},
		{"more than the need is taken as picked", [][2]float64{{1, 250}, {0, 200}}, 0, 0},
		{"exactly the need from the default Lot", [][2]float64{{1, 250}, {0, 50}}, 150, 0},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			u := newUF(t)
			ids := [2]float64{float64(u.a), float64(u.b)}
			var picks [][2]float64
			for _, p := range c.picks {
				picks = append(picks, [2]float64{ids[int(p[0])], p[1]})
			}
			r := u.cookMain(map[string]any{"usedFrom": usedFrom(u.chicken, picks...)})
			if r.Status != 200 {
				t.Fatalf("cooked = %d %s", r.Status, r.Body)
			}
			var res cookedBody
			r.MustJSON(t, &res)
			if res.Meal.State != "cooked" {
				t.Errorf("meal state = %q, want cooked", res.Meal.State)
			}
			u.wantChicken(c.name, c.a, c.b)
			if got := u.StockTotal(u.beans); got != 500 {
				t.Errorf("beans = %v, the Side was not cooked", got)
			}
		})
	}
}

func TestCookedWithUsedFromStillRecordsTheLeftover(t *testing.T) {
	u := newUF(t)
	u.Exec(`UPDATE stock_lots SET quantity = 100 WHERE id = ?`, u.b) // 200 + 100 g in Stock, 300 g needed and picked
	r := u.cookMain(map[string]any{"usedFrom": usedFrom(u.chicken, [2]float64{float64(u.a), 200}, [2]float64{float64(u.b), 100}), "leftoverPortions": 1})
	if r.Status != 200 {
		t.Fatalf("cooked = %d %s", r.Status, r.Body)
	}
	var res struct {
		cookedBody
		Warnings []struct {
			IngredientID int64 `json:"ingredientId"`
		} `json:"warnings"`
	}
	r.MustJSON(t, &res)
	if res.Leftover == nil || res.Leftover.Portions != 1 {
		t.Errorf("leftover = %+v, want the 1 portion asked for", res.Leftover)
	}
	if len(res.Warnings) != 0 {
		t.Errorf("warnings = %+v, want none: 300 g were picked for a 300 g need", res.Warnings)
	}
	u.wantChicken("both picked Lots used up", 0, 0)
}

func TestCookedRefusesInvalidPicksWith422AndWritesNothing(t *testing.T) {
	cases := []struct {
		name string
		body func(u ufWorld) any
	}{
		{"a Lot that does not exist", func(u ufWorld) any { return usedFrom(u.chicken, [2]float64{99999, 100}) }},
		{"a Lot of another Ingredient", func(u ufWorld) any { return usedFrom(u.chicken, [2]float64{float64(u.c), 100}) }},
		{"an Ingredient that is not in the Recipe", func(u ufWorld) any { return usedFrom(u.beans, [2]float64{float64(u.c), 100}) }},
		{"more than the Lot holds", func(u ufWorld) any { return usedFrom(u.chicken, [2]float64{float64(u.a), 201}) }},
		{"more than the Lot holds, summed over two picks", func(u ufWorld) any {
			return usedFrom(u.chicken, [2]float64{float64(u.a), 120}, [2]float64{float64(u.a), 100})
		}},
		{"a zero quantity", func(u ufWorld) any { return usedFrom(u.chicken, [2]float64{float64(u.a), 0}) }},
		{"a negative quantity", func(u ufWorld) any { return usedFrom(u.chicken, [2]float64{float64(u.a), -5}) }},
		{"one good pick and one bad", func(u ufWorld) any {
			return usedFrom(u.chicken, [2]float64{float64(u.a), 100}, [2]float64{99999, 10})
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			u := newUF(t)
			r := u.cookMain(map[string]any{"usedFrom": c.body(u), "leftoverPortions": 1})
			wantErr(t, c.name, r, 422, "used_from_invalid")
			u.wantChicken("after the refusal", 200, 250)
			if got := u.MealState(crsc2.Today, u.Slot, u.Main); got != "planned" {
				t.Errorf("meal state = %q, want planned", got)
			}
			if n := u.Count(`SELECT count(*) FROM leftovers`); n != 0 {
				t.Errorf("%d Leftovers recorded by a refused Cooked", n)
			}
			// The same request without the picks still works: the refusal left nothing behind.
			if r := u.cookMain(map[string]any{}); r.Status != 200 {
				t.Errorf("cooked after the refusal = %d %s", r.Status, r.Body)
			}
		})
	}
}

func TestCookedPublishesNoStockEventWhenThePickIsRefused(t *testing.T) {
	u := newUF(t)
	ch, cancel := u.Env.App.Deps.Events.Subscribe("plan", "stock")
	defer cancel()
	wantErr(t, "refused pick", u.cookMain(map[string]any{"usedFrom": usedFrom(u.chicken, [2]float64{99999, 1})}), 422, "used_from_invalid")
	select {
	case ev := <-ch:
		t.Errorf("event %+v published for a refused Cooked", ev)
	default:
	}
}

func TestCookedAllTakesEachCoursesPicksAndDefaultsTheRest(t *testing.T) {
	u := newUF(t)
	r := u.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(u.Slot)+"/all/cooked", map[string]any{"courses": []map[string]any{
		{"courseId": u.Main, "usedFrom": usedFrom(u.chicken, [2]float64{float64(u.a), 200})},
		{"courseId": u.Side}, // no picks: the default
	}})
	if r.Status != 200 {
		t.Fatalf("all cooked = %d %s", r.Status, r.Body)
	}
	u.wantChicken("Main picks A", 0, 150)
	if got := u.held(u.beans); !reflect.DeepEqual(got, map[int64]float64{u.c: 400}) {
		t.Errorf("beans Lots = %v, want the Side's 100 g from the only Lot", got)
	}
	if u.MealState(crsc2.Today, u.Slot, u.Main) != "cooked" || u.MealState(crsc2.Today, u.Slot, u.Side) != "cooked" {
		t.Error("both Courses should be Cooked")
	}
}

func TestCookedAllWithPicksOnTheSideOnlyDefaultsTheMain(t *testing.T) {
	u := newUF(t)
	u.lot(u.beans, 300, "2026-11-04", "2026-11-12", 0) // beans D: goes off before C
	r := u.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(u.Slot)+"/all/cooked", map[string]any{"courses": []map[string]any{
		{"courseId": u.Side, "usedFrom": usedFrom(u.beans, [2]float64{float64(u.c), 100})},
	}})
	if r.Status != 200 {
		t.Fatalf("all cooked = %d %s", r.Status, r.Body)
	}
	u.wantChicken("Main by default", 150, 0)
	held := u.held(u.beans)
	if held[u.c] != 400 || len(held) != 2 {
		t.Errorf("beans Lots = %v, want C at 400 (picked) and D untouched at 300", held)
	}
}

func TestCookedAllWithoutUsedFromIsUnchanged(t *testing.T) {
	u := newUF(t)
	r := u.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(u.Slot)+"/all/cooked", nil)
	if r.Status != 200 {
		t.Fatalf("all cooked = %d %s", r.Status, r.Body)
	}
	u.wantChicken("default", 150, 0)
}

func TestCookedAllRefusesABadPickForTheWholeSlotAndWritesNothing(t *testing.T) {
	u := newUF(t)
	r := u.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(u.Slot)+"/all/cooked", map[string]any{"courses": []map[string]any{
		{"courseId": u.Main, "usedFrom": usedFrom(u.chicken, [2]float64{float64(u.a), 100})},
		{"courseId": u.Side, "usedFrom": usedFrom(u.beans, [2]float64{float64(u.a), 100})}, // chicken Lot for beans
	}})
	wantErr(t, "all cooked with a bad pick", r, 422, "used_from_invalid")
	u.wantChicken("after the refusal", 200, 250)
	if got := u.held(u.beans); !reflect.DeepEqual(got, map[int64]float64{u.c: 500}) {
		t.Errorf("beans Lots = %v, want untouched", got)
	}
	if u.MealState(crsc2.Today, u.Slot, u.Main) != "planned" || u.MealState(crsc2.Today, u.Slot, u.Side) != "planned" {
		t.Error("a refused Mark all Cooked must leave both Courses Planned (all or nothing)")
	}
	if n := u.Count(`SELECT count(*) FROM leftovers`); n != 0 {
		t.Errorf("%d Leftovers recorded by a refused Mark all Cooked", n)
	}
}

func TestCookedAllRefusesPicksThatTogetherExceedALot(t *testing.T) {
	u := newUF(t)
	u.Exec(`UPDATE planned_meals SET recipe_id = ? WHERE course_id = ?`, u.roast, u.Side) // both Courses cook chicken
	r := u.User.Post("/api/plan/"+crsc2.Today+"/"+itoa(u.Slot)+"/all/cooked", map[string]any{"courses": []map[string]any{
		{"courseId": u.Main, "usedFrom": usedFrom(u.chicken, [2]float64{float64(u.a), 120})},
		{"courseId": u.Side, "usedFrom": usedFrom(u.chicken, [2]float64{float64(u.a), 120})},
	}})
	wantErr(t, "240 g picked from a 200 g Lot across two Courses", r, 422, "used_from_invalid")
	u.wantChicken("after the refusal", 200, 250)
}
