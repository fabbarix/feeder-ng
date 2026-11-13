package runner_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/plan/plantest"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
	"github.com/fabbarix/feeder-ng/internal/planner"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
)

// BR-G round 2: an optional line is never deducted, so it must not use up the jar either. In Mark all Cooked the Main's optional
// Béchamel line (and the optional Ingredients inside it) takes nothing from the shared availability, and the Side finds the
// whole 500 g jar. Resolve must be fed so that it takes nothing for the lines the runner drops (Optional, at any depth).
func TestMarkAllCookedLetsAnOptionalBaseRecipeLineLeaveTheJarToALaterCourse(t *testing.T) {
	var js *jarStock
	var ts *treeSources
	base := newEnvWith(t, func(d *runner.Deps) {
		ts = &treeSources{fakeSources: d.Source.(*fakeSources), trees: map[int64][]baserecipe.Need{}}
		js = &jarStock{pickedStock: &pickedStock{fakeStock: d.Stock.(*fakeStock)}, lots: []planner.StockLot{lot(301, bechamelIng, 500)}}
		d.Source, d.Stock = ts, js
	})
	base.src.recipes = nil
	c := &cenv{env: base}
	c.main = base.main
	c.side = plantest.CourseID(t, base.db, "Side")
	c.oneDay()
	roast := c.recipe("roast", false, c.main)
	beans := c.recipe("beans", false, c.side)
	optional := bechamelNode()
	optional.Optional = true // "optional" propagates down the Made lines, as Expand writes them
	for i := range optional.Made {
		optional.Made[i].Optional = true
	}
	ts.trees[roast] = []baserecipe.Need{{IngredientID: 11, Quantity: 400, Path: "0"}, optional}
	ts.trees[beans] = []baserecipe.Need{{IngredientID: 12, Quantity: 100, Path: "0"}, bechamelNode()}
	c.serve(cspec{course: c.main}, cspec{course: c.side})
	c.mustPlan()
	if _, err := c.r.CookedAll(ctx, "2026-11-09", c.slotIDs[1], nil); err != nil {
		t.Fatal(err)
	}
	if len(c.stock.deductions) != 1 {
		t.Fatalf("deductions = %v, want one combined call", c.stock.deductions)
	}
	// The Main deducts its chicken only; the Side takes the whole jar and makes nothing.
	wantNeeds(t, "combined deduction", c.stock.deductions[0], []runner.Need{n(11, 400), n(12, 100), n(bechamelIng, 500)})
}
