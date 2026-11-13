package facts_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// BR-G round 3: an optional Base recipe line takes nothing from the jar in the facts either, so the reminder follows Cook Mode.
// The Main (Light lasagne) calls for Béchamel optionally, the Starter (Spinach bake) requires it, and the one jar is 500 g:
// the Starter gets it (30 minutes), the Main makes its own Béchamel (25 + 40 = 65 minutes).

func TestFactsLeaveTheJarToARequiredLineOfALaterCourseAndShowAnOptionalBlockAsMade(t *testing.T) {
	w := newBechamelWorld(t, standardBechamel())
	bake := w.spinachBake(t)
	light, err := w.recipes.Create(ctx, recipe.Input{Name: "Light lasagne", Yield: 4,
		Lines: []recipe.Line{{IngredientID: w.spinach, Quantity: 200, Unit: "g"}, {BaseRecipeID: w.béchamel, Quantity: 500, Unit: "g", Optional: true}},
		Steps: []recipe.Step{
			{Text: "Layer the lasagne", Kind: schedule.Active, DurationMinutes: 10},
			{Text: "Bake", Kind: schedule.Passive, DurationMinutes: 30, After: []int{0}},
		}})
	if err != nil {
		t.Fatal(err)
	}
	w.lot(t, w.bechamelIng, "") // 500 g
	main, starter := w.plan2(t, light.ID, bake)
	if got := leadMinutes(t, main); got != 65 {
		t.Errorf("the Main takes %d minutes, want 65: its optional Béchamel is made, whatever the jar holds", got)
	}
	if got := leadMinutes(t, starter); got != 30 {
		t.Errorf("the Starter takes %d minutes, want 30: the jar is left to its required Béchamel", got)
	}
}
