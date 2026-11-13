package httpapi_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// BR-C commit half, round 5 over HTTP (docs/dev/design/base-recipes.md §11.3, §13).
//
// Pinned Confirm answer (200):
//
//	{ "recipes": [ { "index": n, "id": n, "name": s, "action": "created" | "replaced" | "converted",
//	                 "baseRecipe": bool, "line": s?, "readNext": bool? } ],
//	  "ingredientsCreated": n, ... }
//
// baseRecipe is true for every Base recipe the import wrote (created, replaced or converted) and false for a plannable
// Recipe. line is the path of the tile that created or converted it; readNext is that tile's "Read it next". A
// converted Recipe has index -1 and action "converted".
//
// Pinned refusal of a cycle found by Apply (422): { "error": { "code": "base_recipe_cycle", "message": s, "path": [names] } },
// path being the closed list of Recipe names, as in the Recipe API's CycleError. The Review stays open.

func mkIngredient(t *testing.T, c *testkit.Client, name, base string) int64 {
	t.Helper()
	return idOf(t, mustStatus(t, c.Post("/api/ingredients", obj{"name": name, "baseUnit": base}), 201))
}

func mkRecipe(t *testing.T, c *testkit.Client, body obj) int64 {
	t.Helper()
	return idOf(t, mustStatus(t, c.Post("/api/recipes", body), 201))
}

func mkBase(t *testing.T, c *testkit.Client, name string, yield float64, unit string, lines ...obj) int64 {
	t.Helper()
	if lines == nil {
		lines = []obj{}
	}
	return mkRecipe(t, c, obj{"name": name, "yield": yield, "yieldUnit": unit, "baseRecipe": true, "lines": lines})
}

type appliedAnswer struct {
	Recipes []struct {
		Index      int    `json:"index"`
		ID         int64  `json:"id"`
		Name       string `json:"name"`
		Action     string `json:"action"`
		BaseRecipe bool   `json:"baseRecipe"`
		Line       string `json:"line"`
		ReadNext   bool   `json:"readNext"`
	} `json:"recipes"`
}

func (a appliedAnswer) named(t *testing.T, name string) (out struct {
	Index      int    `json:"index"`
	ID         int64  `json:"id"`
	Name       string `json:"name"`
	Action     string `json:"action"`
	BaseRecipe bool   `json:"baseRecipe"`
	Line       string `json:"line"`
	ReadNext   bool   `json:"readNext"`
}) {
	t.Helper()
	for _, r := range a.Recipes {
		if r.Name == name {
			return r
		}
	}
	t.Fatalf("the Confirm answer lists %+v: no %q", a.Recipes, name)
	return
}

func fileText(t *testing.T, ingredients []obj, recipes ...obj) string {
	t.Helper()
	raw, err := json.Marshal(obj{"format": "feeder-recipe-file", "version": 1, "ingredients": ingredients, "recipes": recipes})
	if err != nil {
		t.Fatal(err)
	}
	return string(raw)
}

func drainRecipeEvents(t *testing.T, env *testkit.Env) func() []string {
	t.Helper()
	ch, cancel := env.App.Deps.Events.Subscribe("recipes")
	t.Cleanup(cancel)
	return func() []string {
		var out []string
		for {
			select {
			case e := <-ch:
				out = append(out, string(e.Data))
			case <-time.After(200 * time.Millisecond):
				return out
			}
		}
	}
}

func TestConfirmListsTheBaseRecipesCreatedAndConvertedWithTheirTilesAndPublishesRecipesForEach(t *testing.T) {
	env, c := start(t)
	basil := mkIngredient(t, c, "basil", "g")
	pesto := mkRecipe(t, c, obj{"name": "Pesto", "yield": 4, "lines": []obj{{"ingredientId": basil, "quantity": 100, "unit": "g"}}})
	events := drainRecipeEvents(t, env)

	text := fileText(t,
		[]obj{{"name": "lasagne sheets", "baseUnit": "g"}, {"name": "béchamel", "baseUnit": "ml"}, {"name": "pesto", "baseUnit": "g"}},
		obj{"name": "Lasagne", "yield": 4, "ingredients": []obj{
			{"ingredient": "lasagne sheets", "quantity": 250, "unit": "g"},
			{"ingredient": "béchamel", "quantity": 500, "unit": "ml"},
			{"ingredient": "pesto", "quantity": 100, "unit": "g"},
		}})
	rev := openReview(t, c, text)
	const bech, pest = "$.recipes[0].ingredients[1]", "$.recipes[0].ingredients[2]"
	d := obj{"baseRecipeLines": obj{
		bech: obj{"action": "create", "readNext": true},
		pest: obj{"action": "convert", "recipeId": pesto, "yield": 200, "yieldUnit": "g"},
	}}
	var p reviewResp
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": d}), 200).MustJSON(t, &p)
	if !p.Plan.Ready {
		t.Fatalf("plan not ready: %+v", p.Plan.Problems)
	}

	var done appliedAnswer
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d}), 200).MustJSON(t, &done)

	if l := done.named(t, "Lasagne"); l.BaseRecipe || l.Line != "" || l.ReadNext || l.Action != "created" {
		t.Errorf("Lasagne = %+v, a plannable Recipe is not a Base recipe and has no tile", l)
	}
	b := done.named(t, "Béchamel")
	if !b.BaseRecipe || b.Action != "created" || b.Line != bech || !b.ReadNext || b.ID == 0 || b.Index != -1 {
		t.Errorf("Béchamel = %+v, want a created Base recipe for the tile %s with readNext, so the web can tie it to its tile", b, bech)
	}
	cv := done.named(t, "Pesto")
	if cv.ID != pesto || cv.Action != "converted" || !cv.BaseRecipe || cv.Line != pest || cv.ReadNext || cv.Index != -1 {
		t.Errorf("Pesto = %+v, want the converted Recipe %d (action \"converted\", Base recipe, tile %s)", cv, pesto, pest)
	}

	got := strings.Join(events(), " ")
	for _, id := range []int64{b.ID, cv.ID, done.named(t, "Lasagne").ID} {
		if !strings.Contains(got, fmt.Sprintf(`"id":%d`, id)) {
			t.Errorf("events = %s: want a recipes event for Recipe %d (the converted Pesto included)", got, id)
		}
	}
}

func TestConfirmAnswersBaseRecipeTrueForAFileBaseRecipeAndFalseOtherwise(t *testing.T) {
	_, c := start(t)
	text := fileText(t,
		[]obj{{"name": "milk", "baseUnit": "ml"}, {"name": "béchamel", "baseUnit": "ml"}},
		obj{"name": "Lasagne", "yield": 4, "ingredients": []obj{{"ingredient": "béchamel", "quantity": 500, "unit": "ml"}}},
		obj{"name": "Béchamel", "baseRecipe": true, "yield": 1, "yieldUnit": "l", "ingredients": []obj{{"ingredient": "milk", "quantity": 1000, "unit": "ml"}}})
	rev := openReview(t, c, text)
	d := obj{"baseRecipeLines": obj{"$.recipes[0].ingredients[0]": obj{"action": "file", "recipeIndex": 1}}}
	var done appliedAnswer
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d}), 200).MustJSON(t, &done)
	if b := done.named(t, "Béchamel"); !b.BaseRecipe || b.Line != "" || b.Index != 1 {
		t.Errorf("Béchamel = %+v, a Recipe of the file that is a Base recipe: baseRecipe true, no tile, its file index", b)
	}
	if l := done.named(t, "Lasagne"); l.BaseRecipe {
		t.Errorf("Lasagne = %+v", l)
	}
}

// cycleFixture: Roux and Béchamel are stored Base recipes, Béchamel calls for Roux. The file replaces Roux with a
// version whose line calls for Béchamel (use the existing one) and adds Aioli. The review cannot see a cycle that runs
// through stored Recipes only; Apply does.
func cycleFixture(t *testing.T, c *testkit.Client) (text string, d obj, roux, bech int64) {
	t.Helper()
	butter := mkIngredient(t, c, "butter", "g")
	roux = mkBase(t, c, "Roux", 160, "g", obj{"ingredientId": butter, "quantity": 80, "unit": "g"})
	bech = mkBase(t, c, "Béchamel", 1, "l", obj{"baseRecipeId": roux, "quantity": 160, "unit": "g"})
	text = fileText(t,
		[]obj{{"name": "butter", "baseUnit": "g"}, {"name": "béchamel", "baseUnit": "ml"}},
		obj{"name": "Roux", "baseRecipe": true, "yield": 160, "yieldUnit": "g", "ingredients": []obj{
			{"ingredient": "butter", "quantity": 80, "unit": "g"},
			{"ingredient": "béchamel", "quantity": 100, "unit": "ml"},
		}},
		obj{"name": "Aioli", "yield": 2, "ingredients": []obj{{"ingredient": "butter", "quantity": 10, "unit": "g"}}})
	d = obj{
		"recipes":         []obj{{"index": 0, "action": "replace"}},
		"baseRecipeLines": obj{"$.recipes[0].ingredients[1]": obj{"action": "use", "recipeId": bech}},
	}
	return text, d, roux, bech
}

func TestAConfirmCycleAgainstStoredRecipesIs422BaseRecipeCycleNamesTheCycleAndWritesNothing(t *testing.T) {
	env, c := start(t)
	text, d, roux, _ := cycleFixture(t, c)
	rev := openReview(t, c, text)
	var p reviewResp
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": d}), 200).MustJSON(t, &p)
	if !p.Plan.Ready {
		t.Fatalf("the fixture is a cycle through stored Recipes only, which the review cannot see, so the plan must be Ready: %+v", p.Plan.Problems)
	}
	before := countRecipes(t, c)
	events := drainRecipeEvents(t, env)

	r := c.Post("/api/imports/"+rev.ID+"/confirm", obj{"decisions": d})
	if r.Status != 422 || r.ErrorCode() != "base_recipe_cycle" {
		t.Fatalf("confirm = %d %s, want 422 base_recipe_cycle (not a 500)", r.Status, r.Body)
	}
	var e struct {
		Error struct {
			Message string   `json:"message"`
			Path    []string `json:"path"`
		} `json:"error"`
	}
	r.MustJSON(t, &e)
	joined := strings.Join(e.Error.Path, ",")
	if !strings.Contains(joined, "Roux") || !strings.Contains(joined, "Béchamel") || len(e.Error.Path) < 3 || e.Error.Path[0] != e.Error.Path[len(e.Error.Path)-1] {
		t.Errorf("path = %v, want the closed list of the Recipes of the cycle, e.g. [Roux Béchamel Roux]", e.Error.Path)
	}
	if !strings.Contains(e.Error.Message, "Roux") || !strings.Contains(e.Error.Message, "Béchamel") {
		t.Errorf("message = %q, want it to name the Recipes", e.Error.Message)
	}

	if after := countRecipes(t, c); after != before {
		t.Errorf("Recipes = %d, want %d: nothing is written (not Aioli, not the replaced Roux)", after, before)
	}
	var stored struct {
		Lines []any `json:"lines"`
	}
	mustStatus(t, c.Get(fmt.Sprintf("/api/recipes/%d", roux)), 200).MustJSON(t, &stored)
	if len(stored.Lines) != 1 {
		t.Errorf("Roux has %d lines, want its stored one", len(stored.Lines))
	}
	if got := events(); len(got) != 0 {
		t.Errorf("events = %v: a refused import publishes nothing", got)
	}
	// The Review stays open for the User to answer differently.
	mustStatus(t, c.Post("/api/imports/"+rev.ID+"/plan", obj{"decisions": d}), 200)
}
