package facts_test

import (
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	ingredientstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/notify"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// BR-G (docs/dev/design/base-recipes.md section 9): the notification facts read the composed Steps, so Start cooking fires
// early enough for a Base recipe the Recipe calls for, and its Advance Steps get their reminders.
//
// Béchamel (Yield 1000 g: 800 g milk, 100 g butter, 100 g flour): "Melt the butter" 5 min Active, "Simmer the sauce" 20 min
// Passive after it. Lasagne (Yield 4: 500 g Béchamel, 200 g spinach): "Layer the lasagne" 10 min Active, "Bake" 30 min Passive
// after it. The composed list is Melt, Simmer, Layer, Bake: 65 minutes, against 40 for Lasagne alone.
//
// MealFact.Steps is the composed list in the schedule's form (Covered Steps as zero-length Active Steps, so a jar shortens
// the lead). MealFact.AdvanceSteps keep the ID of an Advance Step as its index in the composed list.

type bechamelWorld struct {
	*world
	béchamel, lasagne, bechamelIng int64
}

func newBechamelWorld(t *testing.T, bechamelSteps []recipe.Step) *bechamelWorld {
	t.Helper()
	w := newWorld(t)
	b := &bechamelWorld{world: w}
	// Base recipes need the Ingredient store wired in (the httpapi does the same).
	clk := clock.NewFake(w.now)
	ings := ingredientstore.New(w.db, clk, ingredientstore.WithBaseRecipes(recipestore.NewBaseRecipePort(w.db)))
	w.recipes = recipestore.New(w.db, clk, ingredients{w.db}).WithIngredients(ings)
	base, err := w.recipes.Create(ctx, recipe.Input{Name: "Béchamel", Yield: 1000, YieldUnit: "g", BaseRecipe: yes(),
		Lines: []recipe.Line{{IngredientID: w.milk, Quantity: 800, Unit: "g"}, {IngredientID: w.butter, Quantity: 100, Unit: "g"}},
		Steps: bechamelSteps})
	if err != nil {
		t.Fatalf("create Béchamel: %v", err)
	}
	b.béchamel, b.bechamelIng = base.ID, base.BaseIngredientID
	lasagne, err := w.recipes.Create(ctx, recipe.Input{Name: "Lasagne", Yield: 4,
		Lines: []recipe.Line{{IngredientID: w.spinach, Quantity: 200, Unit: "g"}, {BaseRecipeID: base.ID, Quantity: 500, Unit: "g"}},
		Steps: []recipe.Step{
			{Text: "Layer the lasagne", Kind: schedule.Active, DurationMinutes: 10},
			{Text: "Bake", Kind: schedule.Passive, DurationMinutes: 30, After: []int{0}},
		}})
	if err != nil {
		t.Fatalf("create Lasagne: %v", err)
	}
	b.lasagne = lasagne.ID
	return b
}

func yes() *bool { v := true; return &v }

func standardBechamel() []recipe.Step {
	return []recipe.Step{
		{Text: "Melt the butter", Kind: schedule.Active, DurationMinutes: 5},
		{Text: "Simmer the sauce", Kind: schedule.Passive, DurationMinutes: 20, After: []int{0}},
	}
}

// leadMinutes is the length of the cooking timeline of the meal's Steps: when Start cooking fires before the slot.
func leadMinutes(t *testing.T, m notify.MealFact) int {
	t.Helper()
	res, err := cook.Timeline([]cook.Course{{ID: 1, Steps: m.Steps}})
	if err != nil {
		t.Fatalf("timeline of %+v: %v", m.Steps, err)
	}
	return res.TotalSeconds / 60
}

func TestFactsCarryTheComposedStepsSoStartCookingComesEarlierByTheBaseRecipesTime(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, ok := find(f, "2026-11-09", w.dinner)
	if !ok {
		t.Fatal("meal missing")
	}
	if len(m.Steps) != 4 {
		t.Fatalf("Steps = %+v, want Béchamel's two Steps and Lasagne's two", m.Steps)
	}
	if m.Steps[1].Kind != schedule.Passive || m.Steps[1].DurationMinutes != 20 || m.Steps[2].DurationMinutes != 10 || m.Steps[3].DurationMinutes != 30 {
		t.Errorf("Steps = %+v, want Simmer (20 Passive), Layer (10) and Bake (30) in the composed order", m.Steps)
	}
	if got := leadMinutes(t, m); got != 65 {
		t.Errorf("the timeline takes %d minutes, want 65: Start cooking comes 25 minutes earlier than for Lasagne alone (40)", got)
	}
}

func TestFactsLeaveAPlainRecipesStepsAlone(t *testing.T) {
	w := newWorld(t)
	w.meal(t, "2026-11-09", w.dinner, w.curry, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, _ := find(f, "2026-11-09", w.dinner)
	if len(m.Steps) != 2 || leadMinutes(t, m) != 45 {
		t.Errorf("Steps = %+v, want the curry's own two", m.Steps)
	}
}

func TestFactsCountAJarThatCoversTheBaseRecipeLikeCookMode(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	w.lot(t, w.bechamelIng, "") // 500 g of Béchamel: exactly what one Batch of Lasagne calls for
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, _ := find(f, "2026-11-09", w.dinner)
	if got := leadMinutes(t, m); got != 40 {
		t.Errorf("the timeline takes %d minutes, want 40: the Steps of a covered Base recipe take no time, as in Cook Mode", got)
	}
	if len(m.Steps) != 4 {
		t.Errorf("Steps = %+v, want the indexes kept (4 Steps, the first two of zero length)", m.Steps)
	}
}

func TestFactsGiveTheMealsBatchesToTheStockCheck(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	w.lot(t, w.bechamelIng, "") // 500 g covers one Batch, not two
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, nil)
	if _, err := w.db.Exec(`UPDATE planned_meals SET batches = 2`); err != nil {
		t.Fatal(err)
	}
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, _ := find(f, "2026-11-09", w.dinner)
	if got := leadMinutes(t, m); got != 65 {
		t.Errorf("the timeline takes %d minutes, want 65: 2 Batches call for 1000 g and the jar holds 500 g", got)
	}
}

func TestFactsListABaseRecipesAdvanceStepWithItsComposedIndexAndLead(t *testing.T) {
	w := newBechamelWorld(t, []recipe.Step{
		{Text: "Chill the milk", Kind: schedule.Advance, LeadTimeMinutes: 360},
		{Text: "Melt the butter", Kind: schedule.Active, DurationMinutes: 5},
		{Text: "Simmer the sauce", Kind: schedule.Passive, DurationMinutes: 20, After: []int{1}},
	})
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, nil)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, _ := find(f, "2026-11-09", w.dinner)
	if len(m.AdvanceSteps) != 1 || m.AdvanceSteps[0].Description != "Chill the milk" || m.AdvanceSteps[0].Lead != 6*time.Hour {
		t.Fatalf("AdvanceSteps = %+v, want Béchamel's 6-hour Advance Step", m.AdvanceSteps)
	}
	if id := m.AdvanceSteps[0].ID; id < 0 || int(id) >= len(m.Steps) || m.Steps[id].Kind != schedule.Advance {
		t.Errorf("ID %d does not name an Advance Step of the composed Steps %+v (the ID is the composed index)", id, m.Steps)
	}
}

func TestFactsKeepALeftoverServedMealWithoutSteps(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	w.meal(t, "2026-11-08", w.dinner, w.lasagne, plan.StateCooked, nil)
	from := &plan.Source{From: w.key(t, "2026-11-08", w.dinner)}
	w.meal(t, "2026-11-09", w.dinner, w.lasagne, plan.StatePlanned, from)
	f, err := w.src.Facts(ctx, w.now)
	if err != nil {
		t.Fatal(err)
	}
	m, _ := find(f, "2026-11-09", w.dinner)
	if !m.FromLeftover || len(m.Steps) != 0 || len(m.AdvanceSteps) != 0 {
		t.Errorf("meal = %+v, want a Leftover with a Reheat and no Steps", m)
	}
}
