package baserecipe_test

import (
	"errors"
	"math/rand"
	"testing"

	br "github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

const (
	act = schedule.Active
	pas = schedule.Passive
	adv = schedule.Advance
)

func milkUse(q float64) schedule.Use {
	return schedule.Use{IngredientID: iMilk, Ingredient: "milk", Quantity: q, Unit: "ml"}
}

// lasagneSteps: 0 ragù (A20), 1 simmer (P60 after 0), 2 layer (A10 after 1; uses the béchamel), 3 bake (P40 after 2).
func lasagneWithSteps() br.Recipe {
	l := lasagne()
	l.Steps = []br.Step{
		step("Make the ragù", act, 20),
		step("Simmer the ragù", pas, 60, 0),
		{Text: "Layer the lasagne", Kind: act, DurationMinutes: 10, After: []int{1}, Uses: []schedule.Use{{IngredientID: iBechamelI, Quantity: 500, Unit: "ml"}}},
		step("Bake", pas, 40, 2),
	}
	return l
}

// bechamelSteps: 0 melt (A5), 1 whisk (A10 after 0).
func bechamelWithSteps() br.Recipe {
	b := bechamel()
	b.Steps = []br.Step{
		step("Melt the butter", act, 5),
		{Text: "Whisk in the flour and milk", Kind: act, DurationMinutes: 10, After: []int{0}, Uses: []schedule.Use{milkUse(1000)}},
	}
	return b
}

func composeCat() *fakeCat {
	return newCat().add(bechamelWithSteps(), ml("Béchamel")).add(lasagneWithSteps())
}

func compose(t *testing.T, c br.Catalog, id int64, made func(br.Path) float64) br.Composed {
	t.Helper()
	got, err := br.ComposeSteps(c, id, made)
	if err != nil {
		t.Fatalf("ComposeSteps: %v", err)
	}
	if errs := schedule.Validate(toSchedule(got)); len(errs) > 0 {
		t.Fatalf("composed list is not a valid Step list: %v\n%v", errs, texts(got))
	}
	return got
}

func TestComposeActiveOnlyBlockGoesJustBeforeNeededAt(t *testing.T) {
	got := compose(t, composeCat(), rLasagne, nil)
	want := []string{"Make the ragù", "Simmer the ragù", "Melt the butter", "Whisk in the flour and milk", "Layer the lasagne", "Bake"}
	if !eqStrings(texts(got), want) {
		t.Fatalf("order = %v, want %v", texts(got), want)
	}
	// Its Active Steps fill the cook's free time during the Passive simmer: 130, not 145.
	if got.TotalMinutes != 130 {
		t.Errorf("TotalMinutes = %d, want 130", got.TotalMinutes)
	}
}

func TestComposeNeededAtStepWaitsForTheBlock(t *testing.T) {
	got := compose(t, composeCat(), rLasagne, nil)
	layer := got.Steps[4]
	has := func(i int) bool {
		for _, a := range layer.After {
			if a == i {
				return true
			}
		}
		return false
	}
	if !has(3) {
		t.Errorf("Layer must wait for the block's sink (index 3): After = %v", layer.After)
	}
	if !has(1) {
		t.Errorf("Layer keeps its own After (simmer, now index 1): After = %v", layer.After)
	}
	if has(2) {
		t.Errorf("only sinks gain an After, not the block's first Step: %v", layer.After)
	}
	// The bake step's After follows Layer's new index.
	if len(got.Steps[5].After) != 1 || got.Steps[5].After[0] != 4 {
		t.Errorf("Bake After = %v, want [4]", got.Steps[5].After)
	}
	// The block's own After is renumbered by the insert position.
	if len(got.Steps[3].After) != 1 || got.Steps[3].After[0] != 2 {
		t.Errorf("whisk After = %v, want [2]", got.Steps[3].After)
	}
}

func TestComposeBlockWithALongPassiveStepGoesEarly(t *testing.T) {
	b := bechamel()
	b.Steps = []br.Step{step("Chop the soffritto", act, 5), step("Simmer the stock", pas, 120, 0)}
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	want := []string{"Chop the soffritto", "Simmer the stock", "Make the ragù", "Simmer the ragù", "Layer the lasagne", "Bake"}
	if !eqStrings(texts(got), want) {
		t.Fatalf("order = %v, want %v", texts(got), want)
	}
	// 5 + 120 stock, ragù 5-25, simmer 25-85, layer waits for the stock until 125, +10, bake +40.
	if got.TotalMinutes != 175 {
		t.Errorf("TotalMinutes = %d, want 175", got.TotalMinutes)
	}
	if layer := got.Steps[4]; !contains(layer.After, 1) {
		t.Errorf("Layer must wait for the stock simmer (index 1): %v", layer.After)
	}
}

func contains(xs []int, x int) bool {
	for _, v := range xs {
		if v == x {
			return true
		}
	}
	return false
}

func TestComposeTiesTakeTheLatestPosition(t *testing.T) {
	b := bechamel()
	b.Steps = []br.Step{step("Open the jar", act, 0)}
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	want := []string{"Make the ragù", "Simmer the ragù", "Open the jar", "Layer the lasagne", "Bake"}
	if !eqStrings(texts(got), want) {
		t.Fatalf("order = %v, want %v (just before Needed at)", texts(got), want)
	}
}

func TestComposeBlockNeverMovesPastNeededAt(t *testing.T) {
	// Needed at is Step 0: the only position is before it.
	l := lasagneWithSteps()
	l.Lines[0].NeededAtStep = ptr(0)
	c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(l)
	got := compose(t, c, rLasagne, nil)
	if got.Steps[0].Text != "Melt the butter" || got.Steps[2].Text != "Make the ragù" {
		t.Fatalf("order = %v", texts(got))
	}
	if !contains(got.Steps[2].After, 1) {
		t.Errorf("ragù must wait for the block: %v", got.Steps[2].After)
	}
}

func TestComposeKeepsTheRecipesOwnStepsInOrder(t *testing.T) {
	got := compose(t, composeCat(), rLasagne, nil)
	var own []string
	for _, s := range got.Steps {
		if s.Origin == nil {
			own = append(own, s.Text)
		}
	}
	want := []string{"Make the ragù", "Simmer the ragù", "Layer the lasagne", "Bake"}
	if !eqStrings(own, want) {
		t.Errorf("own steps = %v, want %v", own, want)
	}
}

func TestComposeLabelsTheBlock(t *testing.T) {
	got := compose(t, composeCat(), rLasagne, nil)
	s := got.Steps[2]
	if s.Origin == nil {
		t.Fatal("Béchamel's Step has no Origin")
	}
	if s.Origin.BaseRecipeID != rBechamel || len(s.Origin.Names) != 1 || s.Origin.Names[0] != "Béchamel" || s.Origin.Path != "0" {
		t.Errorf("Origin = %+v", *s.Origin)
	}
	if got.Steps[0].Origin != nil || got.Steps[4].Origin != nil {
		t.Error("the Recipe's own Steps carry no Origin")
	}
}

func TestComposeAdvanceStepsAreCarriedAndLabelled(t *testing.T) {
	b := bechamelWithSteps()
	b.Steps = append([]br.Step{{Text: "Soak the beans", Kind: adv, LeadTimeMinutes: 720}}, b.Steps...)
	b.Steps[1].After = nil
	b.Steps[2].After = []int{1}
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	var found bool
	for i, s := range got.Steps {
		if s.Text == "Soak the beans" {
			found = true
			if s.Kind != adv || s.LeadTimeMinutes != 720 {
				t.Errorf("Advance Step changed: %+v", s)
			}
			if s.Origin == nil || s.Origin.Names[0] != "Béchamel" {
				t.Errorf("Advance Step not labelled: %+v", s.Origin)
			}
			for _, o := range got.Steps {
				if contains(o.After, i) {
					t.Errorf("a Step waits for an Advance Step (index %d)", i)
				}
			}
		}
	}
	if !found {
		t.Fatal("Advance Step lost")
	}
}

func TestComposeBlockOfOnlyAdvanceStepsAddsNoAfter(t *testing.T) {
	b := bechamel()
	b.Steps = []br.Step{{Text: "Soak", Kind: adv, LeadTimeMinutes: 600}}
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	if len(got.Steps) != 5 {
		t.Fatalf("steps = %v", texts(got))
	}
}

func TestComposeBaseRecipeWithoutStepsAddsNothing(t *testing.T) {
	c := newCat().add(bechamel(), ml("Béchamel")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	if len(got.Steps) != 4 || got.TotalMinutes != 130 {
		t.Errorf("steps = %v total %d", texts(got), got.TotalMinutes)
	}
}

func TestComposeEmptyBaseRecipeAddsNothing(t *testing.T) {
	b := bechamelWithSteps()
	b.Lines = nil
	b.Steps = nil
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	if len(got.Steps) != 4 {
		t.Errorf("steps = %v", texts(got))
	}
}

func TestComposeRecipeWithNoStepsListsTheBlocksOnTheirOwn(t *testing.T) {
	c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(lasagne())
	got := compose(t, c, rLasagne, nil)
	if !eqStrings(texts(got), []string{"Melt the butter", "Whisk in the flour and milk"}) {
		t.Fatalf("steps = %v", texts(got))
	}
	if got.Steps[0].Origin == nil || got.Steps[1].After[0] != 0 {
		t.Errorf("block lost its label or its own After: %+v", got.Steps)
	}
}

func TestComposeTwoBlocksInLineOrder(t *testing.T) {
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"},
		Steps: []br.Step{step("Toast the flour", act, 8)}}
	l := lasagneWithSteps()
	l.Lines = []br.Line{line(iBechamelI, 500, "ml"), line(iRouxI, 100, "g"), line(iPasta, 200, "g")}
	l.Steps[3].Uses = []schedule.Use{{IngredientID: iRouxI}}
	c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(roux, grams("Roux")).add(l)
	got := compose(t, c, rLasagne, nil)
	idx := func(text string) int {
		for i, s := range got.Steps {
			if s.Text == text {
				return i
			}
		}
		return -1
	}
	if idx("Toast the flour") < 0 || idx("Melt the butter") < 0 {
		t.Fatalf("a block is missing: %v", texts(got))
	}
	if idx("Toast the flour") >= idx("Bake") {
		t.Errorf("Roux is Needed at Bake: %v", texts(got))
	}
	if got.Steps[idx("Toast the flour")].Origin.Path != "1" {
		t.Errorf("Roux path = %q, want 1", got.Steps[idx("Toast the flour")].Origin.Path)
	}
}

func TestComposeNestedBaseRecipes(t *testing.T) {
	b := bechamel()
	b.Lines = []br.Line{line(iMilk, 1000, "ml"), line(iRouxI, 200, "g")} // line 1 is the Roux
	b.Steps = []br.Step{
		{Text: "Make the roux", Kind: act, DurationMinutes: 4, Uses: []schedule.Use{{IngredientID: iRouxI, Quantity: 200, Unit: "g"}}},
		step("Whisk in the milk", act, 10, 0),
	}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"},
		Steps: []br.Step{step("Melt the butter", act, 3), {Text: "Cook the flour in it", Kind: act, DurationMinutes: 2, After: []int{0},
			Uses: []schedule.Use{{IngredientID: iFlour, Quantity: 200, Unit: "g"}}}}}
	c := newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	// Roux is composed inside Béchamel, just before "Make the roux"; the whole is just before Layer.
	want := []string{"Make the ragù", "Simmer the ragù", "Melt the butter", "Cook the flour in it", "Make the roux", "Whisk in the milk", "Layer the lasagne", "Bake"}
	if !eqStrings(texts(got), want) {
		t.Fatalf("order = %v, want %v", texts(got), want)
	}
	inner := got.Steps[2].Origin
	if inner.BaseRecipeID != rRoux || !eqStrings(inner.Names, []string{"Béchamel", "Roux"}) || inner.Path != "0/1" {
		t.Errorf("Roux Origin = %+v", *inner)
	}
	outer := got.Steps[4].Origin
	if outer.BaseRecipeID != rBechamel || !eqStrings(outer.Names, []string{"Béchamel"}) || outer.Path != "0" {
		t.Errorf("Béchamel Origin = %+v", *outer)
	}
	if !contains(got.Steps[4].After, 3) {
		t.Errorf("Make the roux must wait for the roux's sink (3): %v", got.Steps[4].After)
	}
	// Uses multiply by every factor on the way down: 200 g flour x (200/400 roux in Béchamel) x (500/1000
	// Béchamel in Lasagne) = 50; the roux use itself, 200 g x 0.5 = 100.
	if q := got.Steps[3].Uses[0].Quantity; !near(q, 50) {
		t.Errorf("flour use = %v, want 50", q)
	}
	if q := got.Steps[4].Uses[0].Quantity; !near(q, 100) {
		t.Errorf("roux use = %v, want 100", q)
	}
}

func TestComposeDurationsAreNotScaled(t *testing.T) {
	l := lasagneWithSteps()
	l.Lines[0].Quantity = 2000 // two litres of a 1 l Yield
	c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(l)
	got := compose(t, c, rLasagne, nil)
	if got.Steps[2].DurationMinutes != 5 || got.Steps[3].DurationMinutes != 10 {
		t.Errorf("durations scaled: %d, %d", got.Steps[2].DurationMinutes, got.Steps[3].DurationMinutes)
	}
}

func TestComposeUsesScaledByTheLineFactor(t *testing.T) {
	got := compose(t, composeCat(), rLasagne, nil)
	u := got.Steps[3].Uses
	if len(u) != 1 || !near(u[0].Quantity, 500) { // 1000 ml x (500 ml / 1 l)
		t.Errorf("uses = %+v, want 500 ml milk", u)
	}
	// The root's own Step uses are untouched.
	if q := got.Steps[4].Uses[0].Quantity; !near(q, 500) {
		t.Errorf("own uses changed: %v", q)
	}
}

func TestComposeDoesNotMutateCatalogSteps(t *testing.T) {
	c := composeCat()
	compose(t, c, rLasagne, nil)
	if q := c.recipes[rBechamel].Steps[1].Uses[0].Quantity; q != 1000 {
		t.Errorf("catalog uses mutated: %v", q)
	}
	if a := c.recipes[rLasagne].Steps[2].After; len(a) != 1 || a[0] != 1 {
		t.Errorf("catalog After mutated: %v", a)
	}
}

// ---- Stock first ----

func TestComposeCoveredBlockKeepsItsStepsAsZeroLengthCovered(t *testing.T) {
	c := composeCat()
	full := compose(t, c, rLasagne, nil)
	covered := compose(t, c, rLasagne, func(br.Path) float64 { return 0 })
	if len(covered.Steps) != len(full.Steps) {
		t.Fatalf("Stock moved indexes: %d steps vs %d", len(covered.Steps), len(full.Steps))
	}
	for i := range full.Steps {
		if full.Steps[i].Text != covered.Steps[i].Text {
			t.Errorf("step %d moved: %q vs %q", i, covered.Steps[i].Text, full.Steps[i].Text)
		}
		isBlock := full.Steps[i].Origin != nil
		if covered.Steps[i].Covered != isBlock {
			t.Errorf("step %d Covered = %v, want %v", i, covered.Steps[i].Covered, isBlock)
		}
		if isBlock && (covered.Steps[i].DurationMinutes != 0 || covered.Steps[i].Kind != act) {
			t.Errorf("covered step %d = %+v, want a zero-length Active Step", i, covered.Steps[i].Step)
		}
		if !isBlock && covered.Steps[i].DurationMinutes != full.Steps[i].DurationMinutes {
			t.Errorf("own step %d changed duration", i)
		}
	}
}

func TestComposeCoveredKeepsIndexesEvenWhenScratchPlacementIsEarly(t *testing.T) {
	// The long-simmer block sits first when made; with the jar full it must stay first (§4.4 point 6).
	b := bechamel()
	b.Steps = []br.Step{step("Chop the soffritto", act, 5), step("Simmer the stock", pas, 120, 0)}
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	covered := compose(t, c, rLasagne, func(br.Path) float64 { return 0 })
	want := []string{"Chop the soffritto", "Simmer the stock", "Make the ragù", "Simmer the ragù", "Layer the lasagne", "Bake"}
	if !eqStrings(texts(covered), want) {
		t.Fatalf("order = %v", texts(covered))
	}
	if !covered.Steps[0].Covered || !covered.Steps[1].Covered || covered.Steps[2].Covered {
		t.Errorf("Covered flags wrong: %+v", covered.Steps)
	}
	if covered.Steps[1].Kind != act {
		t.Errorf("a covered Passive Step becomes a zero-length Active one, got %v", covered.Steps[1].Kind)
	}
}

func TestComposePartlyCoveredKeepsDurationsAndScalesUses(t *testing.T) {
	half := func(br.Path) float64 { return 0.5 }
	got := compose(t, composeCat(), rLasagne, half)
	if got.Steps[2].DurationMinutes != 5 || got.Steps[3].DurationMinutes != 10 || got.Steps[2].Covered {
		t.Errorf("partly covered block changed: %+v", got.Steps[2])
	}
	if q := got.Steps[3].Uses[0].Quantity; !near(q, 250) { // 500 ml x 0.5
		t.Errorf("uses = %v, want 250", q)
	}
}

func TestComposeNestedFractionsMultiplyDown(t *testing.T) {
	b := bechamel()
	b.Lines = []br.Line{line(iMilk, 1000, "ml"), line(iRouxI, 400, "g")}
	b.Steps = []br.Step{step("Whisk", act, 10)}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"},
		Steps: []br.Step{{Text: "Cook the flour", Kind: act, DurationMinutes: 2, Uses: []schedule.Use{{IngredientID: iFlour, Quantity: 400, Unit: "g"}}}}}
	c := newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(lasagneWithSteps())
	made := func(p br.Path) float64 {
		switch p {
		case "0":
			return 0.5
		case "0/1":
			return 0.5
		}
		return 1
	}
	got := compose(t, c, rLasagne, made)
	for _, s := range got.Steps {
		if s.Text == "Cook the flour" {
			// 400 g x line factor 0.5 (500 ml of 1 l) x (relative) 0.5 x 0.5 = 50
			if !near(s.Uses[0].Quantity, 50) {
				t.Errorf("nested uses = %v, want 50", s.Uses[0].Quantity)
			}
			return
		}
	}
	t.Fatal("Cook the flour missing")
}

func TestComposeOuterCoveredCoversNestedToo(t *testing.T) {
	b := bechamel()
	b.Lines = []br.Line{line(iRouxI, 400, "g")}
	b.Steps = []br.Step{step("Whisk", act, 10)}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"}, Steps: []br.Step{step("Cook the flour", act, 2)}}
	c := newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, func(p br.Path) float64 {
		if p == "0" {
			return 0
		}
		return 1
	})
	for _, s := range got.Steps {
		if s.Origin != nil && !s.Covered {
			t.Errorf("%q should be covered by the jar of Béchamel", s.Text)
		}
	}
}

// ---- Needed at ----

func TestNeededAtDefaultRules(t *testing.T) {
	use := func(ing int64) []schedule.Use { return []schedule.Use{{IngredientID: ing}} }
	mk := func(steps ...br.Step) br.Recipe {
		r := lasagne()
		r.Steps = steps
		return r
	}
	cases := []struct {
		name string
		r    br.Recipe
		want int
	}{
		{"uses names the Ingredient", mk(step("a", act, 1), br.Step{Text: "b", Kind: act, Uses: use(iBechamelI)}, br.Step{Text: "c", Kind: act, Uses: use(iBechamelI)}), 1},
		{"uses beats an earlier text mention", mk(step("Warm the béchamel", act, 1), br.Step{Text: "Layer", Kind: act, Uses: use(iBechamelI)}), 1},
		{"text, case folded", mk(step("Boil the pasta", act, 1), step("Spoon over the BÉCHAMEL sauce", act, 1)), 1},
		{"text, accents folded", mk(step("Boil", act, 1), step("Stir in the bechamel", act, 1)), 1},
		{"text on the accented side", mk(step("Boil", act, 1), step("Stir in the Béchamel", act, 1)), 1},
		{"whole words only", mk(step("Taste the bechamelle", act, 1), step("Use the bechamel", act, 1)), 1},
		{"first Step when nothing names it", mk(step("Boil", act, 1), step("Bake", pas, 20)), 0},
		{"no Steps at all: no anchor", mk(), -1},
		{"only Advance Steps: no anchor", mk(br.Step{Text: "Soak", Kind: adv, LeadTimeMinutes: 60}), -1},
		{"first non-Advance Step when nothing names it", mk(br.Step{Text: "Soak", Kind: adv, LeadTimeMinutes: 60}, step("Cook", act, 5)), 1},
		{"Advance Steps are skipped for uses", mk(br.Step{Text: "Soak", Kind: adv, LeadTimeMinutes: 60, Uses: use(iBechamelI)}, br.Step{Text: "Layer", Kind: act, Uses: use(iBechamelI)}), 1},
		{"Advance Steps are skipped for text", mk(br.Step{Text: "Make the béchamel ahead", Kind: adv, LeadTimeMinutes: 60}, step("Mix", act, 1), step("Add the béchamel", act, 1)), 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := br.NeededAt(tc.r, 0, "Béchamel"); got != tc.want {
				t.Errorf("NeededAt = %d, want %d", got, tc.want)
			}
		})
	}
}

func TestNeededAtMultiWordNameAndOtherLine(t *testing.T) {
	r := lasagne()
	r.Lines = []br.Line{line(iPasta, 1, "g"), line(iFrollaI, 1, "g")}
	r.Steps = []br.Step{step("Chill the dough", pas, 30), step("Roll out the Pasta  Frolla", act, 5), step("Bake", pas, 20)}
	if got := br.NeededAt(r, 1, "pasta frolla"); got != 1 {
		t.Errorf("NeededAt = %d, want 1", got)
	}
}

func TestNeededAtOverrideWins(t *testing.T) {
	r := lasagneWithSteps()
	r.Lines[0].NeededAtStep = ptr(3)
	if got := br.NeededAt(r, 0, "Béchamel"); got != 3 {
		t.Errorf("override ignored: %d", got)
	}
}

func TestNeededAtStaleOverrideFallsBack(t *testing.T) {
	for _, stale := range []int{-1, 4, 99} {
		r := lasagneWithSteps()
		r.Lines[0].NeededAtStep = ptr(stale)
		if got := br.NeededAt(r, 0, "Béchamel"); got != 2 {
			t.Errorf("override %d: NeededAt = %d, want the default 2", stale, got)
		}
	}
	r := lasagneWithSteps()
	r.Steps[1] = br.Step{Text: "Soak", Kind: adv, LeadTimeMinutes: 60}
	r.Lines[0].NeededAtStep = ptr(1) // now an Advance Step
	if got := br.NeededAt(r, 0, "Béchamel"); got != 2 {
		t.Errorf("override on an Advance Step: NeededAt = %d, want 2", got)
	}
}

func TestComposeUsesTheOverride(t *testing.T) {
	// Needed at Bake: Bake waits for the block's sink. The shortest total still puts the Active block in the
	// cook's free time during the simmer, so it sits before Layer, which no longer waits for it.
	l := lasagneWithSteps()
	l.Lines[0].NeededAtStep = ptr(3)
	c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(l)
	got := compose(t, c, rLasagne, nil)
	want := []string{"Make the ragù", "Simmer the ragù", "Melt the butter", "Whisk in the flour and milk", "Layer the lasagne", "Bake"}
	if !eqStrings(texts(got), want) {
		t.Fatalf("order = %v, want %v", texts(got), want)
	}
	if bake := got.Steps[5]; !contains(bake.After, 3) || !contains(bake.After, 4) {
		t.Errorf("Bake must wait for Layer (4) and the block's sink (3): %v", bake.After)
	}
	if contains(got.Steps[4].After, 3) {
		t.Errorf("Layer no longer waits for the block: %v", got.Steps[4].After)
	}
}

func TestComposeStaleOverrideFallsBackToTheDefault(t *testing.T) {
	l := lasagneWithSteps()
	l.Lines[0].NeededAtStep = ptr(17)
	c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(l)
	got := compose(t, c, rLasagne, nil)
	if !eqStrings(texts(got), []string{"Make the ragù", "Simmer the ragù", "Melt the butter", "Whisk in the flour and milk", "Layer the lasagne", "Bake"}) {
		t.Errorf("order = %v", texts(got))
	}
}

func TestComposeCycle(t *testing.T) {
	b := bechamelWithSteps()
	b.Lines = []br.Line{line(iBechamelI, 100, "ml")}
	_, err := br.ComposeSteps(newCat().add(b, ml("Béchamel")).add(lasagneWithSteps()), rLasagne, nil)
	if !errors.Is(err, br.ErrCycle) {
		t.Fatalf("err = %v, want ErrCycle", err)
	}
}

func TestComposeUnknownRecipe(t *testing.T) {
	if _, err := br.ComposeSteps(newCat(), 5, nil); !errors.Is(err, br.ErrNotFound) {
		t.Fatalf("err = %v", err)
	}
}

func TestComposeRootThatIsAlreadyABaseRecipe(t *testing.T) {
	b := bechamelWithSteps()
	b.Lines = []br.Line{line(iMilk, 1000, "ml"), line(iRouxI, 100, "g")}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"}, Steps: []br.Step{step("Toast the flour", act, 4)}}
	c := newCat().add(b, ml("Béchamel")).add(roux, grams("Roux"))
	got := compose(t, c, rBechamel, nil)
	if got.Steps[0].Text != "Toast the flour" || !eqStrings(got.Steps[0].Origin.Names, []string{"Roux"}) {
		t.Errorf("steps = %v / %+v", texts(got), got.Steps[0].Origin)
	}
}

// ---- property ----

func TestPropertyComposeIsAlwaysAValidListThatKeepsOwnOrder(t *testing.T) {
	r := rand.New(rand.NewSource(3))
	kinds := []schedule.Kind{act, act, pas}
	randSteps := func(prefix string, n int) []br.Step {
		var out []br.Step
		for i := 0; i < n; i++ {
			s := br.Step{Text: prefix + string(rune('a'+i)), Kind: kinds[r.Intn(len(kinds))], DurationMinutes: r.Intn(40)}
			if s.Kind == pas && s.DurationMinutes == 0 {
				s.DurationMinutes = 1 + r.Intn(60)
			}
			if i > 0 && r.Intn(2) == 0 {
				s.After = []int{r.Intn(i)}
			}
			out = append(out, s)
		}
		return out
	}
	for n := 0; n < 300; n++ {
		l := lasagne()
		l.Steps = randSteps("L", 1+r.Intn(6))
		b := bechamel()
		b.Steps = randSteps("B", 1+r.Intn(4))
		if r.Intn(4) == 0 {
			b.Steps = append(b.Steps, br.Step{Text: "Soak", Kind: adv, LeadTimeMinutes: 100})
		}
		l.Lines[0].NeededAtStep = ptr(r.Intn(len(l.Steps)))
		c := newCat().add(b, ml("Béchamel")).add(l)
		got := compose(t, c, rLasagne, nil)
		if len(got.Steps) != len(l.Steps)+len(b.Steps) {
			t.Fatalf("iter %d: %d steps, want %d", n, len(got.Steps), len(l.Steps)+len(b.Steps))
		}
		var own []string
		for _, s := range got.Steps {
			if s.Origin == nil {
				own = append(own, s.Text)
			}
		}
		var want []string
		for _, s := range l.Steps {
			want = append(want, s.Text)
		}
		if !eqStrings(own, want) {
			t.Fatalf("iter %d: own order %v, want %v", n, own, want)
		}
		// Never worse than doing the block and then the Recipe, one after the other.
		rootOnly, _ := schedule.Compute(toStepsOf(l.Steps))
		var blockSum int
		for _, s := range b.Steps {
			blockSum += s.DurationMinutes
		}
		if got.TotalMinutes < rootOnly.TotalMinutes || got.TotalMinutes > rootOnly.TotalMinutes+blockSum {
			t.Fatalf("iter %d: total %d outside [%d, %d]", n, got.TotalMinutes, rootOnly.TotalMinutes, rootOnly.TotalMinutes+blockSum)
		}
		// Covering never moves an index.
		covered := compose(t, c, rLasagne, func(br.Path) float64 { return 0 })
		if !eqStrings(texts(covered), texts(got)) {
			t.Fatalf("iter %d: Stock moved indexes: %v vs %v", n, texts(covered), texts(got))
		}
	}
}

func toStepsOf(steps []br.Step) []schedule.Step {
	out := make([]schedule.Step, len(steps))
	for i, s := range steps {
		out[i] = schedule.Step{Kind: s.Kind, DurationMinutes: s.DurationMinutes, LeadTimeMinutes: s.LeadTimeMinutes, After: s.After}
	}
	return out
}
