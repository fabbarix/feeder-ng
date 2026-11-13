package httpapi_test

import (
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// BR-G round 3: an optional line never takes Stock on any path (Cooked, Cook Mode, timeline, timers, next Advance Step, facts).
// An optional Base recipe line's block is shown as made, never covered, and it takes nothing from the jar, not even ahead of a
// later required line in the same Recipe. The fixture is newBrg's (Béchamel 1000 g: Melt 5, Simmer 20 passive) with the
// Recipes below; the jar is one lot of 500 g of Béchamel.

func (b *brgWorld) recipeWithBechamel(name string, course int64, optional ...bool) int64 {
	b.T.Helper()
	lines := []map[string]any{line(b.pasta, 200)}
	for _, o := range optional { // one Béchamel line per flag, in order: the flag says whether the line is optional
		lines = append(lines, map[string]any{"baseRecipeId": b.béchamel, "quantity": 500, "unit": "g", "optional": o})
	}
	id, _ := b.create(map[string]any{"name": name, "yield": 2, "courseIds": []int64{course}, "lines": lines,
		"steps": []map[string]any{step("Layer "+name, "active", 10), step("Bake "+name, "passive", 30, 0)}})
	return id
}

// replan replaces the Planned Meals with exactly these (Main, Side) Recipes, one Batch each, Pinned (see newBrg). It
// first lets the planner finish the replans the Recipes just saved started (Settle), so none fills a cell between the
// clear and the writes and leaves a second Planned Meal on it.
func (b *brgWorld) replan(main, side int64) {
	b.T.Helper()
	b.Settle()
	b.Meal(crsc2.Today, b.Slot, b.Main, main, "planned", true)
	if side != 0 {
		b.Meal(crsc2.Today, b.Slot, b.Side, side, "planned", true)
	}
}

func (b *brgWorld) itemsOf(tl brgTimeline, course int64) (total, labelled int) {
	for _, it := range tl.Items {
		if it.CourseID != course {
			continue
		}
		total++
		if it.BaseRecipe != nil {
			labelled++
		}
	}
	return
}

func TestAnOptionalBaseRecipeLineLeavesTheJarToARequiredLineOfALaterCourse(t *testing.T) {
	b := newBrg(t, 1)
	light := b.recipeWithBechamel("Light lasagne", b.Main, true) // Béchamel is optional here
	bake := b.recipeWithBechamel("Spinach bake", b.Side, false)  // and required here
	b.replan(light, bake)
	b.Stock(b.béchamelIng, 500)
	tl := b.timeline()
	if total, labelled := b.itemsOf(tl, b.Main); total != 4 || labelled != 2 {
		t.Errorf("the Main shows %d items, %d labelled; want 4 and 2: its optional Béchamel is made, not covered", total, labelled)
	}
	if total, labelled := b.itemsOf(tl, b.Side); total != 2 || labelled != 0 {
		t.Errorf("the Side shows %d items, %d labelled; want 2 and 0: the whole jar is left to its required Béchamel", total, labelled)
	}
	if len(tl.Covered) != 1 {
		t.Errorf("covered = %+v, want Béchamel (the Side's)", tl.Covered)
	}
}

func TestAnOptionalBaseRecipeLineIsNeverCoveredEvenByAFullJar(t *testing.T) {
	b := newBrg(t, 1)
	light := b.recipeWithBechamel("Light lasagne", b.Main, true)
	b.replan(light, 0)
	b.Stock(b.béchamelIng, 5000)
	tl := b.timeline()
	if len(tl.Items) != 4 || len(tl.Covered) != 0 || tl.TotalMinutes != 65 {
		t.Errorf("%d items over %d minutes, covered %+v; want the block shown as made: 4 items, 65 minutes, nothing covered",
			len(tl.Items), tl.TotalMinutes, tl.Covered)
	}
	if v := b.view(); len(v.Steps) != 4 || len(v.Covered) != 0 {
		t.Errorf("Course view: %d Steps, covered %+v; want 4 and none", len(v.Steps), v.Covered)
	}
	// A timer on the optional block's Passive Step (Simmer, composed index 1) starts: the Step is not covered.
	if r := b.User.Post("/api/cook/timers", map[string]any{"scope": mainScope(b.World), "step": 1}); r.Status != 201 {
		t.Errorf("timer on the optional block's Simmer = %d %s, want 201", r.Status, r.Body)
	}
}

func TestWithinOneRecipeAnOptionalLineNeverTakesTheJarAheadOfARequiredLine(t *testing.T) {
	b := newBrg(t, 1)
	double := b.recipeWithBechamel("Double", b.Main, true, false) // an optional Béchamel line, then a required one
	b.replan(double, 0)
	b.Stock(b.béchamelIng, 500) // one jar of exactly one line's 500 g
	tl := b.timeline()
	// Composed: 0 Melt, 1 Simmer (the optional line's block), 2 Melt, 3 Simmer (the required line's block), 4 Layer, 5 Bake.
	var steps []int
	for _, it := range tl.Items {
		steps = append(steps, *it.Step)
	}
	if want := []int{0, 1, 4, 5}; !reflect.DeepEqual(steps, want) {
		t.Errorf("shown Steps = %v, want %v: the required line's block (2, 3) is covered by the jar, the optional one is made", steps, want)
	}
	if len(tl.Covered) != 1 || tl.Covered[0].Name != "Béchamel" {
		t.Errorf("covered = %+v, want Béchamel", tl.Covered)
	}
}
