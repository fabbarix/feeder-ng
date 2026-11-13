package baserecipe_test

import (
	"math"
	"testing"

	br "github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Recipe ids.
const (
	rLasagne  int64 = 1
	rBechamel int64 = 2
	rRoux     int64 = 3
	rFrolla   int64 = 4
)

// Ingredient ids.
const (
	iMilk      int64 = 10
	iButter    int64 = 11
	iFlour     int64 = 12
	iPasta     int64 = 13
	iBechamelI int64 = 20 // Béchamel's Ingredient
	iRouxI     int64 = 30 // Roux's Ingredient
	iFrollaI   int64 = 40
)

type fakeCat struct {
	recipes map[int64]br.Recipe
	base    map[int64]int64
	units   map[int64]units.Ingredient
}

func (c *fakeCat) Recipe(id int64) (br.Recipe, bool) { r, ok := c.recipes[id]; return r, ok }
func (c *fakeCat) BaseOf(ing int64) (int64, bool)    { id, ok := c.base[ing]; return id, ok }
func (c *fakeCat) Units(ing int64) (units.Ingredient, bool) {
	u, ok := c.units[ing]
	return u, ok
}

// newCat is a catalog of plain Ingredients only (milk ml; butter, flour, pasta g).
func newCat() *fakeCat {
	return &fakeCat{
		recipes: map[int64]br.Recipe{},
		base:    map[int64]int64{},
		units: map[int64]units.Ingredient{
			iMilk:   {Name: "milk", Base: units.Millilitre},
			iButter: {Name: "butter", Base: units.Gram},
			iFlour:  {Name: "flour", Base: units.Gram},
			iPasta:  {Name: "pasta", Base: units.Gram},
		},
	}
}

// add registers a Recipe; a Base recipe also registers its Ingredient (units given, plus the batch conversion
// the store keeps: 1 batch = the Yield in Base Units).
func (c *fakeCat) add(r br.Recipe, u ...units.Ingredient) *fakeCat {
	c.recipes[r.ID] = r
	if r.Base != nil {
		c.base[r.Base.IngredientID] = r.ID
		ing := units.Ingredient{Name: r.Name, Base: units.Millilitre}
		if len(u) > 0 {
			ing = u[0]
		}
		c.units[r.Base.IngredientID] = ing
	}
	return c
}

func ml(name string, conv ...units.Conversion) units.Ingredient {
	return units.Ingredient{Name: name, Base: units.Millilitre, Conversions: conv}
}
func grams(name string, conv ...units.Conversion) units.Ingredient {
	return units.Ingredient{Name: name, Base: units.Gram, Conversions: conv}
}
func pieces(name string, conv ...units.Conversion) units.Ingredient {
	return units.Ingredient{Name: name, Base: units.Piece, Conversions: conv}
}

func line(ing int64, q float64, unit string) br.Line {
	return br.Line{IngredientID: ing, Quantity: q, Unit: unit}
}

// bechamel: Yield 1 l; 1000 ml milk, 50 g butter, 50 g flour.
func bechamel() br.Recipe {
	return br.Recipe{ID: rBechamel, Name: "Béchamel", Base: &br.Yield{IngredientID: iBechamelI, Quantity: 1, Unit: "l"},
		Lines: []br.Line{line(iMilk, 1000, "ml"), line(iButter, 50, "g"), line(iFlour, 50, "g")}}
}

// lasagne: 500 ml Béchamel, 200 g pasta.
func lasagne() br.Recipe {
	return br.Recipe{ID: rLasagne, Name: "Lasagne",
		Lines: []br.Line{line(iBechamelI, 500, "ml"), line(iPasta, 200, "g")}}
}

// baseCat: Lasagne -> Béchamel.
func baseCat() *fakeCat {
	return newCat().add(bechamel(), ml("Béchamel", units.Conversion{Unit: "batch", ToBase: 1000}, units.Conversion{Unit: "jar", ToBase: 300})).add(lasagne())
}

// nestedCat: Lasagne -> 500 ml Béchamel (Yield 1 l) -> 200 g Roux (Yield 400 g; 200 g flour, 200 g butter).
func nestedCat() *fakeCat {
	b := bechamel()
	b.Lines = []br.Line{line(iMilk, 1000, "ml"), line(iRouxI, 200, "g")}
	roux := br.Recipe{ID: rRoux, Name: "Roux", Base: &br.Yield{IngredientID: iRouxI, Quantity: 400, Unit: "g"},
		Lines: []br.Line{line(iFlour, 200, "g"), line(iButter, 200, "g")}}
	return newCat().add(b, ml("Béchamel")).add(roux, grams("Roux")).add(lasagne())
}

const eps = 1e-9

func near(a, b float64) bool { return math.Abs(a-b) < eps }

// sum adds the Quantity of every need of an Ingredient in a flat list.
func sum(flat []br.Need, ing int64) float64 {
	var t float64
	for _, n := range flat {
		if n.IngredientID == ing {
			t += n.Quantity
		}
	}
	return t
}

// find returns the need of an Ingredient in a (non-flat) list.
func find(t *testing.T, ns []br.Need, ing int64) br.Need {
	t.Helper()
	for _, n := range ns {
		if n.IngredientID == ing {
			return n
		}
	}
	t.Fatalf("no need for ingredient %d in %+v", ing, ns)
	return br.Need{}
}

func wantQty(t *testing.T, what string, got, want float64) {
	t.Helper()
	if !near(got, want) {
		t.Errorf("%s = %v, want %v", what, got, want)
	}
}

func mustExpand(t *testing.T, c br.Catalog, id int64) []br.Need {
	t.Helper()
	tree, err := br.Expand(c, id)
	if err != nil {
		t.Fatalf("Expand: %v", err)
	}
	return tree
}

// stockOf is a shared availability map for Resolve.
type stockOf map[int64]float64

func (s stockOf) have(id int64) float64 { return s[id] }
func (s stockOf) take(id int64, q float64) {
	s[id] -= q
}

// toSchedule maps composed Steps to scheduling Steps.
func toSchedule(c br.Composed) []schedule.Step {
	out := make([]schedule.Step, len(c.Steps))
	for i, s := range c.Steps {
		out[i] = schedule.Step{Kind: s.Kind, DurationMinutes: s.DurationMinutes, LeadTimeMinutes: s.LeadTimeMinutes, After: s.After}
	}
	return out
}

func texts(c br.Composed) []string {
	out := make([]string, len(c.Steps))
	for i, s := range c.Steps {
		out[i] = s.Text
	}
	return out
}

func eqStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func ptr(i int) *int { return &i }

func step(text string, kind schedule.Kind, minutes int, after ...int) br.Step {
	return br.Step{Text: text, Kind: kind, DurationMinutes: minutes, After: after}
}
