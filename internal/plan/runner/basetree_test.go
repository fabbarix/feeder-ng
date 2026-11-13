package runner_test

import (
	"fmt"
	"io"
	"log/slog"
	"reflect"
	"sort"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/planner"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// BR-F (docs/dev/design/base-recipes.md sections 5 and 14.1): DBSources.Recipes takes each Recipe's need tree from the
// recipe store (NeedTrees, in basetree.go) and gives the planner baserecipe.Flatten(tree). Base recipes are never passed
// to the planner. The real stores through the API (BR-B) over one database.

type brSrc struct {
	t                   *testing.T
	env                 *testkit.Env
	user, admin         *testkit.Client
	src                 *runner.DBSources
	milk, butter, flour int64
}

func newBRSrc(t *testing.T) *brSrc {
	t.Helper()
	env := testkit.Start(t)
	s := &brSrc{t: t, env: env, user: env.LoginUser(t), admin: env.LoginAdmin(t),
		src: runner.NewDBSources(env.DB, env.Clock, slog.New(slog.NewTextHandler(io.Discard, nil)))}
	ing := func(name, base string) int64 {
		res, err := env.DB.Exec(`INSERT INTO ingredients (name, name_key, base_unit, created_at, updated_at) VALUES (?, lower(?), ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`, name, name, base)
		if err != nil {
			t.Fatal(err)
		}
		id, _ := res.LastInsertId()
		return id
	}
	s.milk, s.butter, s.flour = ing("milk", "ml"), ing("butter", "g"), ing("flour", "g")
	return s
}

type brCreated struct {
	ID               int64 `json:"id"`
	BaseIngredientID int64 `json:"baseIngredientId"`
}

func (s *brSrc) create(body map[string]any) brCreated {
	s.t.Helper()
	body["tags"] = []string{}
	r := s.user.Post("/api/recipes", body)
	var out brCreated
	r.MustJSON(s.t, &out)
	if r.Status != 201 {
		s.t.Fatalf("create %v = %d %s", body["name"], r.Status, r.Body)
	}
	return out
}

func brLine(ing int64, q float64, unit string) map[string]any {
	return map[string]any{"ingredientId": ing, "quantity": q, "unit": unit}
}

func brCall(base int64, q float64, unit string) map[string]any {
	return map[string]any{"baseRecipeId": base, "quantity": q, "unit": unit}
}

func (s *brSrc) base(name string, yield float64, unit string, steps []map[string]any, lines ...map[string]any) brCreated {
	body := map[string]any{"name": name, "yield": yield, "yieldUnit": unit, "baseRecipe": true, "lines": lines}
	if steps != nil {
		body["steps"] = steps
	}
	return s.create(body)
}

func (s *brSrc) plain(name string, lines ...map[string]any) brCreated {
	return s.create(map[string]any{"name": name, "yield": 4, "lines": lines})
}

func (s *brSrc) recipe(name string) planner.Recipe {
	s.t.Helper()
	all, err := s.src.Recipes(ctx)
	if err != nil {
		s.t.Fatal(err)
	}
	for _, r := range all {
		if r.Name == name {
			return r
		}
	}
	s.t.Fatalf("no Recipe %q among %d for the planner", name, len(all))
	return planner.Recipe{}
}

func needSet(ns []planner.Need) []string {
	out := []string{}
	for _, n := range ns {
		out = append(out, fmt.Sprintf("%d=%g/%v", n.IngredientID, n.Quantity, n.Optional))
	}
	sort.Strings(out)
	return out
}

func TestRecipesGivesThePlannerTheFlattenedLeavesAndAZeroOptionalLineForEachBaseRecipe(t *testing.T) {
	s := newBRSrc(t)
	rx := s.base("Roux", 300, "g", nil, brLine(s.butter, 150, "g"), brLine(s.flour, 150, "g"))
	b := s.base("Béchamel", 1, "l", nil, brLine(s.milk, 1000, "ml"), brCall(rx.ID, 100, "g"))
	l := s.plain("Lasagne", brLine(s.flour, 200, "g"), brCall(b.ID, 500, "ml"))

	want := []planner.Need{
		{IngredientID: planner.IngredientID(s.flour), Quantity: 200},
		{IngredientID: planner.IngredientID(b.BaseIngredientID), Quantity: 0, Optional: true}, // Béchamel: the Exclusion hook
		{IngredientID: planner.IngredientID(s.milk), Quantity: 500},
		{IngredientID: planner.IngredientID(rx.BaseIngredientID), Quantity: 0, Optional: true}, // Roux inside Béchamel
		{IngredientID: planner.IngredientID(s.butter), Quantity: 25},
		{IngredientID: planner.IngredientID(s.flour), Quantity: 25},
	}
	got := s.recipe("Lasagne")
	if !reflect.DeepEqual(needSet(got.Needs), needSet(want)) {
		t.Errorf("Lasagne Needs = %v\nwant the Flatten of its tree %v (leaves at full Quantity, a Base recipe as an optional line of 0)", needSet(got.Needs), needSet(want))
	}
	_ = l
}

func TestRecipesNeverPassesABaseRecipeToThePlanner(t *testing.T) {
	s := newBRSrc(t)
	b := s.base("Béchamel", 1, "l", nil, brLine(s.milk, 1000, "ml"))
	s.plain("Lasagne", brCall(b.ID, 500, "ml"))
	all, err := s.src.Recipes(ctx)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range all {
		if r.Name == "Béchamel" {
			t.Errorf("the planner was given the Base recipe %+v: it could never be a candidate", r)
		}
	}
}

func TestAnOptionalLineOfABaseRecipeMakesEveryLeafInsideItOptional(t *testing.T) {
	s := newBRSrc(t)
	b := s.base("Béchamel", 1, "l", nil, brLine(s.milk, 1000, "ml"))
	call := brCall(b.ID, 500, "ml")
	call["optional"] = true
	s.plain("Lasagne", call)
	for _, n := range s.recipe("Lasagne").Needs {
		if !n.Optional {
			t.Errorf("Need %+v is not optional, but the line that brings it in is", n)
		}
	}
}

func TestAnEmptyBaseRecipeStaysARealNeedOfItsOwnIngredient(t *testing.T) {
	s := newBRSrc(t)
	pesto := s.base("Pesto", 200, "g", nil)
	s.plain("Toast", brCall(pesto.ID, 50, "g"))
	got := s.recipe("Toast").Needs
	want := []planner.Need{{IngredientID: planner.IngredientID(pesto.BaseIngredientID), Quantity: 50}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("Toast Needs = %+v, want %+v (section 4.2: an empty Base recipe is not a zero line)", got, want)
	}
}

func TestABaseRecipesAdvanceStepCountsForTheRecipeThatCallsForIt(t *testing.T) {
	s := newBRSrc(t)
	chill := []map[string]any{{"text": "Chill overnight", "kind": "advance", "durationMinutes": 0, "leadTimeMinutes": 600, "after": []int{}, "uses": []any{}}}
	b := s.base("Béchamel", 1, "l", chill, brLine(s.milk, 1000, "ml"))
	s.plain("Lasagne", brCall(b.ID, 500, "ml"))
	var leads []time.Duration
	for _, a := range s.recipe("Lasagne").AdvanceSteps {
		leads = append(leads, a.Lead)
	}
	if len(leads) != 1 || leads[0] != 600*time.Minute {
		t.Errorf("Lasagne AdvanceSteps = %v, want the Béchamel's 10 hour Advance Step (it feeds the lead-time hard filter)", leads)
	}
}

func TestAnExclusionOfABaseRecipeIsTheExcludedIngredientOfItsOwnIngredient(t *testing.T) {
	s := newBRSrc(t)
	b := s.base("Béchamel", 1, "l", nil, brLine(s.milk, 1000, "ml"))
	s.plain("Lasagne", brCall(b.ID, 500, "ml"))
	m := s.admin.Post("/api/members", map[string]any{"name": "Sam", "colour": "#81b29a", "portionFactor": 1})
	var mem struct {
		ID int64 `json:"id"`
	}
	m.MustJSON(t, &mem)
	if r := s.user.Put(fmt.Sprintf("/api/recipes/%d/preference", b.ID), map[string]any{"state": "exclusion", "memberId": mem.ID}); r.Status != 200 {
		t.Fatalf("exclude Béchamel = %d %s", r.Status, r.Body)
	}
	prefs, err := s.src.Preferences(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got := prefs[mem.ID].ExcludedIngredients; !reflect.DeepEqual(got, []planner.IngredientID{planner.IngredientID(b.BaseIngredientID)}) {
		t.Errorf("Sam's ExcludedIngredients = %v, want [%d], the Béchamel Ingredient, which the zero line carries", got, b.BaseIngredientID)
	}
}

// ---- NeedTrees, the tree plans.Meals and BR-G's Cooked read ----

func TestNeedTreesHoldsTheTreeOfEveryPlannableRecipeAndNoBaseRecipe(t *testing.T) {
	s := newBRSrc(t)
	b := s.base("Béchamel", 1, "l", nil, brLine(s.milk, 1000, "ml"), brLine(s.butter, 60, "g"))
	lasagne := s.plain("Lasagne", brLine(s.flour, 200, "g"), brCall(b.ID, 500, "ml"))
	soup := s.plain("Soup", brLine(s.milk, 200, "ml"))
	old := s.plain("Old stew", brLine(s.flour, 100, "g"))
	if r := s.user.Post(fmt.Sprintf("/api/recipes/%d/archive", old.ID), nil); r.Status != 200 && r.Status != 204 {
		t.Fatalf("archive = %d %s", r.Status, r.Body)
	}

	trees, err := s.src.NeedTrees(ctx)
	if err != nil {
		t.Fatalf("NeedTrees: %v", err)
	}
	if _, ok := trees[b.ID]; ok {
		t.Errorf("trees hold the Base recipe %d: a Base recipe is never a Planned Meal", b.ID)
	}
	for _, id := range []int64{lasagne.ID, soup.ID, old.ID} {
		if _, ok := trees[id]; !ok {
			t.Errorf("no tree for Recipe %d (archived Recipes are kept: their Planned Meals still count)", id)
		}
	}
	lt := trees[lasagne.ID]
	if len(lt) != 2 || lt[1].BaseRecipeID != b.ID || lt[1].IngredientID != b.BaseIngredientID || lt[1].Quantity != 500 || len(lt[1].Made) != 2 {
		t.Fatalf("Lasagne tree = %+v, want flour and 500 ml of Béchamel made of two lines", lt)
	}
	if lt[1].Made[0].IngredientID != s.milk || lt[1].Made[0].Quantity != 500 || lt[1].Made[1].Quantity != 30 {
		t.Errorf("Béchamel Made = %+v, want 500 ml milk and 30 g butter (scaled by 500/1000)", lt[1].Made)
	}
	if len(trees[soup.ID]) != 1 || trees[soup.ID][0].Made != nil {
		t.Errorf("Soup tree = %+v, want one plain node", trees[soup.ID])
	}
	// The planner's Needs are the Flatten of these trees (one place for the tree).
	flat := baserecipe.Flatten(lt)
	if got := s.recipe("Lasagne").Needs; len(got) != len(flat) {
		t.Errorf("planner Needs %v and Flatten(tree) %v differ in length", needSet(got), flat)
	}
}
