package baserecipe_test

import (
	"math"
	"math/rand"
	"strconv"
	"strings"
	"testing"

	br "github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// ---- 1. an empty Base recipe never puts Steps on the timeline ----

func TestComposeEmptyBaseRecipeWithStepsAddsNothing(t *testing.T) {
	// No lines: it counts as its own Ingredient (a jar), so its Steps (left over from an edit) are not cooked.
	b := bechamelWithSteps()
	b.Lines = nil
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	if !eqStrings(texts(got), []string{"Make the ragù", "Simmer the ragù", "Layer the lasagne", "Bake"}) {
		t.Errorf("steps = %v", texts(got))
	}
	for _, s := range got.Steps {
		if s.Origin != nil {
			t.Errorf("%q has an Origin", s.Text)
		}
	}
	if got.TotalMinutes != 130 {
		t.Errorf("TotalMinutes = %d, want the Recipe's own 130", got.TotalMinutes)
	}
}

func TestComposeBaseRecipeWhoseLinesAreAllUnconvertibleWithStepsAddsNothing(t *testing.T) {
	// Expand skips every line, so Made is nil and the line counts as its own Ingredient (§4.6).
	b := bechamelWithSteps()
	b.Lines = []br.Line{line(iButter, 2, "cup"), line(iMilk, 1, "furlong")}
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	if tree := mustExpand(t, c, rLasagne); find(t, tree, iBechamelI).Made != nil {
		t.Fatal("premise: Expand must treat it as empty")
	}
	got := compose(t, c, rLasagne, nil)
	if !eqStrings(texts(got), []string{"Make the ragù", "Simmer the ragù", "Layer the lasagne", "Bake"}) {
		t.Errorf("steps = %v", texts(got))
	}
}

func TestComposeEmptyNestedBaseRecipeWithStepsAddsNothing(t *testing.T) {
	b := bechamelWithSteps()
	b.Lines = []br.Line{line(iMilk, 1000, "ml"), line(iRouxI, 100, "g")}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"}, Steps: []br.Step{step("Toast the flour", act, 4)}}
	c := newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(lasagneWithSteps())
	got := compose(t, c, rLasagne, nil)
	for _, s := range got.Steps {
		if s.Text == "Toast the flour" {
			t.Error("an empty Roux put its Steps on the timeline")
		}
	}
}

// ---- 2. Need.Path and MadeFractions ----

func TestExpandSetsPathsInTheComposeStepsFormat(t *testing.T) {
	// Raw line indexes, unconvertible lines counted: the skipped butter line is index 0 in Béchamel.
	b := bechamelWithSteps()
	b.Lines = []br.Line{line(iButter, 2, "cup"), line(iMilk, 1000, "ml"), line(iRouxI, 200, "g")}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"},
		Lines: []br.Line{line(iFlour, 200, "g")}, Steps: []br.Step{step("Toast the flour", act, 4)}}
	l := lasagneWithSteps()
	l.Lines = []br.Line{line(iPasta, 1, "cup"), line(iPasta, 200, "g"), line(iBechamelI, 500, "ml")}
	c := newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(l)
	tree := mustExpand(t, c, rLasagne)
	bech := find(t, tree, iBechamelI)
	if bech.Path != "2" {
		t.Errorf("Béchamel Path = %q, want 2", bech.Path)
	}
	if p := find(t, tree, iPasta).Path; p != "1" {
		t.Errorf("pasta Path = %q, want 1", p)
	}
	rouxNode := find(t, bech.Made, iRouxI)
	if rouxNode.Path != "2/2" {
		t.Errorf("Roux Path = %q, want 2/2", rouxNode.Path)
	}
	if p := find(t, bech.Made, iMilk).Path; p != "2/1" {
		t.Errorf("milk Path = %q, want 2/1", p)
	}
	// And it is the Path of the composed Steps' Origin.
	got := compose(t, c, rLasagne, nil)
	seen := map[br.Path]bool{}
	for _, s := range got.Steps {
		if s.Origin != nil {
			seen[s.Origin.Path] = true
		}
	}
	if !seen[bech.Path] || !seen[rouxNode.Path] {
		t.Errorf("Origin paths %v do not include %q and %q", seen, bech.Path, rouxNode.Path)
	}
}

func TestExpandPathsAreUniquePerNode(t *testing.T) {
	l := lasagne()
	l.Lines = []br.Line{line(iBechamelI, 500, "ml"), line(iBechamelI, 250, "ml"), line(iPasta, 1, "g")}
	tree := mustExpand(t, baseCat().add(l), rLasagne)
	if tree[0].Path != "0" || tree[1].Path != "1" || tree[2].Path != "2" {
		t.Errorf("paths = %q %q %q", tree[0].Path, tree[1].Path, tree[2].Path)
	}
}

func TestMadeFractionsTwoLinesShareOneJar(t *testing.T) {
	l := lasagne()
	l.Lines = []br.Line{line(iBechamelI, 500, "ml"), line(iBechamelI, 500, "ml")}
	c := baseCat().add(l)
	tree := mustExpand(t, c, rLasagne)
	stock := stockOf{iBechamelI: 700}
	made := br.MadeFractions(tree, 1, stock.have)
	wantQty(t, "first line", made("0"), 0)
	wantQty(t, "second line", made("1"), 0.6)
	wantQty(t, "unknown path", made("9"), 1)
	if stock[iBechamelI] != 700 {
		t.Error("MadeFractions must not change the caller's Stock")
	}
	// Calling it again gives the same answers: the walk is done once, not on every call.
	wantQty(t, "second line again", made("1"), 0.6)
}

// composedMilk sums the milk the composed Steps use, per Batch.
func composedMilk(c br.Composed) float64 {
	var t float64
	for _, s := range c.Steps {
		for _, u := range s.Uses {
			if u.IngredientID == iMilk {
				t += u.Quantity
			}
		}
	}
	return t
}

func TestComposeFedByMadeFractionsAgreesWithResolve(t *testing.T) {
	cases := []struct {
		name    string
		q1, q2  float64
		jar     float64
		batches float64
	}{
		{"two lines, one jar, 700 ml", 500, 500, 700, 1},
		{"different fractions: 300 then 500 of a 400 ml jar", 300, 500, 400, 1},
		{"jar covers the first line only", 500, 250, 500, 1},
		{"no jar", 500, 250, 0, 1},
		{"jar covers all", 500, 250, 5000, 1},
		{"two Batches", 500, 500, 700, 2},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			l := lasagneWithSteps()
			l.Lines = []br.Line{line(iBechamelI, tc.q1, "ml"), line(iBechamelI, tc.q2, "ml"), line(iPasta, 200, "g")}
			c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(l)
			tree := mustExpand(t, c, rLasagne)
			made := br.MadeFractions(tree, tc.batches, stockOf{iBechamelI: tc.jar}.have)
			composed := compose(t, c, rLasagne, made)
			stock := stockOf{iBechamelI: tc.jar}
			resolved := br.Resolve(tree, tc.batches, stock.have, stock.take)
			wantQty(t, "milk to make (Steps x Batches vs Resolve)", composedMilk(composed)*tc.batches, sum(resolved, iMilk))
			// A line the jar fully covers is a covered block, and only that one.
			for _, p := range []br.Path{"0", "1"} {
				wantCovered := near(made(p), 0)
				for _, s := range composed.Steps {
					if s.Origin != nil && s.Origin.Path == p && s.Covered != wantCovered {
						t.Errorf("block %s: Covered = %v, want %v (fraction %v)", p, s.Covered, wantCovered, made(p))
					}
				}
			}
		})
	}
}

func TestMadeFractionsNestedIsRelativeAndSkipsStockUnderACoveredParent(t *testing.T) {
	tree := mustExpand(t, nestedCat(), rLasagne)
	// Béchamel 250 of 500 ml (half made); Roux node is then 50 of 100 g and 30 g is on the shelf.
	made := br.MadeFractions(tree, 1, stockOf{iBechamelI: 250, iRouxI: 30}.have)
	wantQty(t, "béchamel", made("0"), 0.5)
	wantQty(t, "roux (relative)", made("0/1"), 0.4)
	// A jar that covers the Béchamel leaves nothing to make: its Roux is not touched.
	made = br.MadeFractions(tree, 1, stockOf{iBechamelI: 500, iRouxI: 100}.have)
	wantQty(t, "béchamel covered", made("0"), 0)
	wantQty(t, "roux under a covered parent", made("0/1"), 0)
}

func TestMadeFractionsNoStockIsAllOnes(t *testing.T) {
	tree := mustExpand(t, nestedCat(), rLasagne)
	made := br.MadeFractions(tree, 3, func(int64) float64 { return 0 })
	for _, p := range []br.Path{"0", "0/1", "1"} {
		wantQty(t, "path "+string(p), made(p), 1)
	}
}

func TestPropertyComposeFedByMadeFractionsAgreesWithResolve(t *testing.T) {
	r := rand.New(rand.NewSource(21))
	for n := 0; n < 200; n++ {
		l := lasagneWithSteps()
		l.Lines = []br.Line{line(iBechamelI, float64(50+r.Intn(900)), "ml"), line(iPasta, 100, "g"), line(iBechamelI, float64(50+r.Intn(900)), "ml")}
		c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(l)
		tree := mustExpand(t, c, rLasagne)
		jar := r.Float64() * 1500
		batches := float64(1 + r.Intn(3))
		made := br.MadeFractions(tree, batches, stockOf{iBechamelI: jar}.have)
		composed := compose(t, c, rLasagne, made)
		stock := stockOf{iBechamelI: jar}
		resolved := br.Resolve(tree, batches, stock.have, stock.take)
		wantQty(t, "milk", composedMilk(composed)*batches, sum(resolved, iMilk))
	}
}

// ---- 3. sibling Base recipe blocks stay contiguous ----

func siblingCat() *fakeCat {
	b := bechamel()
	b.Steps = []br.Step{step("Melt the butter", act, 5), step("Simmer the milk", pas, 60, 0), step("Finish the sauce", act, 5, 1)}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"},
		Lines: []br.Line{line(iFlour, 200, "g")}, Steps: []br.Step{step("Toast the flour", act, 5)}}
	l := lasagne()
	l.Lines = []br.Line{line(iBechamelI, 500, "ml"), line(iRouxI, 100, "g"), line(iPasta, 200, "g")}
	l.Steps = []br.Step{{Text: "Assemble", Kind: act, DurationMinutes: 10, Uses: []schedule.Use{{IngredientID: iBechamelI}}}}
	return newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(l)
}

// topGroupsContiguous reports the first top-level block (first Path segment) whose Steps are not contiguous.
func topGroupsContiguous(c br.Composed) (string, bool) {
	last := map[string]int{}
	closed := map[string]bool{}
	cur := ""
	for i, s := range c.Steps {
		g := ""
		if s.Origin != nil {
			g = strings.SplitN(string(s.Origin.Path), "/", 2)[0]
		}
		if g != cur {
			if cur != "" {
				closed[cur] = true
			}
			if g != "" && closed[g] {
				return g, false
			}
			cur = g
		}
		last[g] = i
	}
	return "", true
}

func TestComposeSiblingBlocksStayContiguous(t *testing.T) {
	// Roux's Active Step would fit in the cook's free time during Béchamel's Passive simmer (total 80), but
	// one Base recipe's Steps are never split by a sibling block: Roux goes before or after the whole block.
	got := compose(t, siblingCat(), rLasagne, nil)
	if g, ok := topGroupsContiguous(got); !ok {
		t.Fatalf("block %s is split: %v", g, texts(got))
	}
	want := []string{"Melt the butter", "Simmer the milk", "Finish the sauce", "Toast the flour", "Assemble"}
	if !eqStrings(texts(got), want) {
		t.Errorf("order = %v, want %v (ties take the latest position)", texts(got), want)
	}
	if got.TotalMinutes != 85 {
		t.Errorf("TotalMinutes = %d, want 85", got.TotalMinutes)
	}
}

func TestComposeNestedBlocksMayStillInterleaveWithTheirParent(t *testing.T) {
	// Pinned from the design: nesting interleaves (Roux's Active Step inside Béchamel's simmer), siblings do not.
	b := bechamel()
	b.Lines = []br.Line{line(iMilk, 1000, "ml"), line(iRouxI, 100, "g")}
	b.Steps = []br.Step{step("Melt the butter", act, 5), step("Simmer the milk", pas, 60, 0),
		{Text: "Whisk in the roux", Kind: act, DurationMinutes: 5, After: []int{1}, Uses: []schedule.Use{{IngredientID: iRouxI}}}}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"}, Steps: []br.Step{step("Toast the flour", act, 5)}}
	l := lasagne()
	l.Steps = []br.Step{{Text: "Assemble", Kind: act, DurationMinutes: 10, Uses: []schedule.Use{{IngredientID: iBechamelI}}}}
	c := newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(l)
	got := compose(t, c, rLasagne, nil)
	want := []string{"Melt the butter", "Simmer the milk", "Toast the flour", "Whisk in the roux", "Assemble"}
	if !eqStrings(texts(got), want) {
		t.Errorf("order = %v, want %v", texts(got), want)
	}
	if g, ok := topGroupsContiguous(got); !ok {
		t.Errorf("top-level block %s split", g)
	}
}

func TestPropertySiblingBlocksAreContiguous(t *testing.T) {
	r := rand.New(rand.NewSource(5))
	kinds := []schedule.Kind{act, act, pas}
	randSteps := func(prefix string, n int) []br.Step {
		var out []br.Step
		for i := 0; i < n; i++ {
			s := br.Step{Text: prefix + strconv.Itoa(i), Kind: kinds[r.Intn(len(kinds))], DurationMinutes: r.Intn(40)}
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
		b := bechamel()
		b.Steps = randSteps("B", 1+r.Intn(4))
		roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"},
			Lines: []br.Line{line(iFlour, 1, "g")}, Steps: randSteps("R", 1+r.Intn(4))}
		l := lasagne()
		l.Lines = []br.Line{line(iBechamelI, 500, "ml"), line(iRouxI, 100, "g")}
		l.Steps = randSteps("L", 1+r.Intn(5))
		l.Lines[0].NeededAtStep = ptr(r.Intn(len(l.Steps)))
		l.Lines[1].NeededAtStep = ptr(r.Intn(len(l.Steps)))
		c := newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(l)
		got := compose(t, c, rLasagne, nil)
		if g, ok := topGroupsContiguous(got); !ok {
			t.Fatalf("iter %d: block %s split: %v", n, g, texts(got))
		}
	}
}

// ---- 4. the fallback Needed at is the first non-Advance Step ----

func TestComposeFallbackAnchorSkipsALeadingAdvanceStep(t *testing.T) {
	l := lasagne()
	l.Steps = []br.Step{{Text: "Soak the beans", Kind: adv, LeadTimeMinutes: 600}, step("Cook", act, 10)}
	c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(l)
	got := compose(t, c, rLasagne, nil)
	ti := -1
	for i, s := range got.Steps {
		if s.Text == "Cook" {
			ti = i
		}
	}
	if ti < 0 {
		t.Fatalf("steps = %v", texts(got))
	}
	cook := got.Steps[ti]
	var sink = -1
	for i, s := range got.Steps {
		if s.Text == "Whisk in the flour and milk" {
			sink = i
		}
	}
	if !contains(cook.After, sink) {
		t.Errorf("Cook must wait for the block (sink %d): After = %v in %v", sink, cook.After, texts(got))
	}
	if sink > ti {
		t.Errorf("the block must come before Cook: %v", texts(got))
	}
}

func TestComposeRecipeWithOnlyAdvanceStepsUsesTheNoAnchorPath(t *testing.T) {
	l := lasagne()
	l.Steps = []br.Step{{Text: "Soak the beans", Kind: adv, LeadTimeMinutes: 600}}
	c := newCat().add(bechamelWithSteps(), ml("Béchamel")).add(l)
	got := compose(t, c, rLasagne, nil)
	if len(got.Steps) != 3 {
		t.Fatalf("steps = %v", texts(got))
	}
	for _, s := range got.Steps {
		if s.Kind == adv && len(s.After) != 0 {
			t.Errorf("an Advance Step gained an After: %+v", s)
		}
	}
}

// ---- nits ----

func TestComposeNaNFractionMeansMakeIt(t *testing.T) {
	nan := func(br.Path) float64 { return math.NaN() }
	got := compose(t, composeCat(), rLasagne, nan)
	full := compose(t, composeCat(), rLasagne, nil)
	for i := range got.Steps {
		if got.Steps[i].Covered {
			t.Errorf("step %d covered by a NaN fraction", i)
		}
		if got.Steps[i].DurationMinutes != full.Steps[i].DurationMinutes {
			t.Errorf("step %d duration %d, want %d", i, got.Steps[i].DurationMinutes, full.Steps[i].DurationMinutes)
		}
	}
	if q := got.Steps[3].Uses[0].Quantity; !near(q, 500) {
		t.Errorf("uses = %v, want 500 (made in full)", q)
	}
}

func TestComposeCoveredBlockWithAnAdvanceStepLeavesNoReminder(t *testing.T) {
	b := bechamelWithSteps()
	b.Steps = append([]br.Step{{Text: "Soak the beans", Kind: adv, LeadTimeMinutes: 720}}, b.Steps...)
	b.Steps[1].After = nil
	b.Steps[2].After = []int{1}
	c := newCat().add(b, ml("Béchamel")).add(lasagneWithSteps())
	advance := func(made func(br.Path) float64) int {
		got := compose(t, c, rLasagne, made)
		sch, err := schedule.Compute(toSchedule(got))
		if err != nil {
			t.Fatal(err)
		}
		return len(sch.Advance)
	}
	if n := advance(nil); n != 1 {
		t.Fatalf("made in full: %d Advance Steps, want 1", n)
	}
	if n := advance(func(br.Path) float64 { return 0 }); n != 0 {
		t.Errorf("jar covers it: %d Advance Steps left, want 0 (no reminder)", n)
	}
	covered := compose(t, c, rLasagne, func(br.Path) float64 { return 0 })
	for _, s := range covered.Steps {
		if s.Text == "Soak the beans" && (!s.Covered || s.Kind == adv || s.LeadTimeMinutes != 0) {
			t.Errorf("covered Advance Step = %+v, want a zero-length covered Active Step", s)
		}
	}
}

func TestNeededAtFoldsDecomposedAccents(t *testing.T) {
	r := lasagne()
	r.Steps = []br.Step{step("Boil the pasta", act, 1), step("Stir in the béchamel", act, 1)} // e + combining acute
	if got := br.NeededAt(r, 0, "Béchamel"); got != 1 {
		t.Errorf("NFD text vs composed name: %d, want 1", got)
	}
	if got := br.NeededAt(r, 0, "Béchamel"); got != 1 {
		t.Errorf("NFD name: %d, want 1", got)
	}
}

func TestMatchReferenceFoldsDecomposedAccents(t *testing.T) {
	got := br.MatchReference(ref("béchamel"), []br.RefCandidate{base(2, "Béchamel")})
	if len(got) != 1 || !got[0].Exact {
		t.Fatalf("got %+v", got)
	}
}
