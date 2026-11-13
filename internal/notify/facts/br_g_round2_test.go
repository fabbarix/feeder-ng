package facts_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// BR-G round 2. (1) The Courses of one slot share the Stock in Course order, as Mark all Cooked and the Cook Mode timeline
// do: a 600 g jar of Béchamel covers the Main's 500 g and leaves 100 g for the Starter's 500 g. (2) A Base recipe cycle written
// straight into SQL (the store refuses it, older data may hold it) never fails Facts: the Recipe that is on it uses its own
// Steps, as before Base recipes, and every other meal is still given.

// spinachBake is a Recipe that calls for 500 g of Béchamel too: "Mix" 10 min Active, "Bake the gratin" 20 min Passive after it.
// With Béchamel's 25 minutes it takes 55; with the Béchamel covered, 30.
func (b *bechamelWorld) spinachBake(t *testing.T) int64 {
	t.Helper()
	r, err := b.recipes.Create(ctx, recipe.Input{Name: "Spinach bake", Yield: 2,
		Lines: []recipe.Line{{IngredientID: b.spinach, Quantity: 100, Unit: "g"}, {BaseRecipeID: b.béchamel, Quantity: 500, Unit: "g"}},
		Steps: []recipe.Step{
			{Text: "Mix", Kind: schedule.Active, DurationMinutes: 10},
			{Text: "Bake the gratin", Kind: schedule.Passive, DurationMinutes: 20, After: []int{0}},
		}})
	if err != nil {
		t.Fatalf("create Spinach bake: %v", err)
	}
	return r.ID
}

func (b *bechamelWorld) plan2(t *testing.T, mainRecipe, starterRecipe int64) (notify.MealFact, notify.MealFact) {
	t.Helper()
	main, starter := b.mainCourse(t), b.courseNamed(t, "Starter")
	for _, c := range []struct{ course, recipe int64 }{{main, mainRecipe}, {starter, starterRecipe}} {
		if _, err := b.plans.SaveMeal(ctx, plan.Meal{Key: plan.Key{Date: "2026-11-09", MealSlotID: b.dinner, CourseID: c.course},
			RecipeID: c.recipe, Batches: 1, Portions: 4, State: plan.StatePlanned}); err != nil {
			t.Fatal(err)
		}
	}
	f, err := b.src.Facts(ctx, b.now)
	if err != nil {
		t.Fatalf("Facts: %v", err)
	}
	var got []notify.MealFact
	for _, m := range f.Meals {
		if m.Date == "2026-11-09" && m.MealSlotID == b.dinner {
			got = append(got, m)
		}
	}
	if len(got) != 2 || got[0].CourseID != main || got[1].CourseID != starter {
		t.Fatalf("meals = %+v, want the main Course then the Starter", got)
	}
	return got[0], got[1]
}

func TestFactsShareTheJarAcrossTheCoursesOfASlotInCourseOrder(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	bake := w.spinachBake(t)
	w.lot(t, w.bechamelIng, "")                                                  // 500 g
	if _, err := w.db.Exec(`UPDATE stock_lots SET quantity = 600`); err != nil { // one jar of 600 g
		t.Fatal(err)
	}
	main, starter := w.plan2(t, w.lasagne, bake)
	if got := leadMinutes(t, main); got != 40 {
		t.Errorf("the Main takes %d minutes, want 40: the jar covers its Béchamel", got)
	}
	if got := leadMinutes(t, starter); got != 55 {
		t.Errorf("the Starter takes %d minutes, want 55: only 100 g of the jar is left, so its Béchamel is made", got)
	}
	res, err := cook.Timeline([]cook.Course{{ID: main.CourseID, Steps: main.Steps}, {ID: starter.CourseID, Steps: starter.Steps}})
	if err != nil {
		t.Fatal(err)
	}
	if res.TotalSeconds != 55*60 {
		t.Errorf("the slot's timeline takes %d s, want 3300 (55 minutes): the Start cooking reminder counts Spinach bake's Béchamel", res.TotalSeconds)
	}
}

func TestFactsGiveTheWholeJarToTheFirstCourseOnly(t *testing.T) {
	// Not a shared fact of the other slot or day: another day's meal does not share this slot's jar (Cook Mode sees one slot).
	w := newBechamelWorld(t, standardBechamel())
	w.lot(t, w.bechamelIng, "") // 500 g: exactly the Main's
	w.meal(t, "2026-11-10", w.dinner, w.lasagne, plan.StatePlanned, nil)
	bake := w.spinachBake(t)
	main, starter := w.plan2(t, w.lasagne, bake)
	if leadMinutes(t, main) != 40 || leadMinutes(t, starter) != 55 {
		t.Errorf("Main %d, Starter %d minutes; want 40 and 55", leadMinutes(t, main), leadMinutes(t, starter))
	}
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	next, ok := find(f, "2026-11-10", w.dinner)
	if !ok || leadMinutes(t, next) != 40 {
		t.Errorf("the next day's meal takes %d minutes, want 40: a day's slot reads the Stock on its own", leadMinutes(t, next))
	}
}

// cyclic puts Béchamel and Roux on a cycle straight into SQL: each calls for the other.
func (b *bechamelWorld) cyclic(t *testing.T) {
	t.Helper()
	roux, err := b.recipes.Create(ctx, recipe.Input{Name: "Roux", Yield: 300, YieldUnit: "g", BaseRecipe: yes(),
		Lines: []recipe.Line{{IngredientID: b.butter, Quantity: 150, Unit: "g"}}})
	if err != nil {
		t.Fatal(err)
	}
	for _, q := range []struct{ recipe, ingredient int64 }{{b.béchamel, roux.BaseIngredientID}, {roux.ID, b.bechamelIng}} {
		if _, err := b.db.Exec(`INSERT INTO recipe_lines (recipe_id, position, ingredient_id, quantity, unit) VALUES (?, 9, ?, 10, 'g')`, q.recipe, q.ingredient); err != nil {
			t.Fatal(err)
		}
	}
}

func TestFactsSurviveABaseRecipeCycleAndUseTheRecipesOwnSteps(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	w.cyclic(t)
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, nil)
	w.meal(t, "2026-11-09", w.lunch, w.curry, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatalf("Facts = %v; one Recipe on a cycle must not fail the others", err)
	}
	curry, ok := find(f, "2026-11-09", w.lunch)
	if !ok || len(curry.Steps) != 2 || curry.RecipeName != "Chicken curry" || len(curry.AdvanceSteps) != 1 {
		t.Errorf("the other meal = %+v, want the curry with its Steps and Advance Step", curry)
	}
	lasagne, ok := find(f, "2026-11-09", w.dinner)
	if !ok {
		t.Fatal("the meal on the cycle is missing; it is still given")
	}
	if len(lasagne.Steps) != 2 || lasagne.Steps[0].DurationMinutes != 10 || lasagne.Steps[1].DurationMinutes != 30 || leadMinutes(t, lasagne) != 40 {
		t.Errorf("Steps = %+v, want Lasagne's own two (Layer 10, Bake 30): no Base recipe Steps can be composed", lasagne.Steps)
	}
}
