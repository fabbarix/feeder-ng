package baserecipe

import (
	"reflect"
	"testing"
)

// A small tree: a plain line, an optional Base recipe node with an inner line, and a required Base recipe node.
func requiredFixture() []Need {
	return []Need{
		{IngredientID: 21, Quantity: 200, Path: "0"},
		{IngredientID: 30, Quantity: 500, BaseRecipeID: 7, Optional: true, Path: "1", Made: []Need{
			{IngredientID: 31, Quantity: 400, Optional: true, Path: "1/0"}}},
		{IngredientID: 40, Quantity: 500, BaseRecipeID: 8, Path: "2", Made: []Need{
			{IngredientID: 41, Quantity: 400, Path: "2/0"}}},
	}
}

func TestRequiredOnlyTurnsAnOptionalBaseNodeIntoAPlainOptionalLeaf(t *testing.T) {
	got := RequiredOnly(requiredFixture())
	want := Need{IngredientID: 30, Quantity: 500, Optional: true, Path: "1"}
	if !reflect.DeepEqual(got[1], want) {
		t.Errorf("optional node = %+v, want the plain optional leaf %+v", got[1], want)
	}
}

func TestRequiredOnlyKeepsARequiredBaseNodeAndItsMade(t *testing.T) {
	got := RequiredOnly(requiredFixture())
	if got[2].BaseRecipeID != 8 || got[2].Optional || len(got[2].Made) != 1 || got[2].Made[0].IngredientID != 41 {
		t.Errorf("required node = %+v, want its Base recipe and Made kept", got[2])
	}
	if got[0].IngredientID != 21 || got[0].Optional {
		t.Errorf("plain line = %+v, want unchanged", got[0])
	}
}

func TestRequiredOnlyDoesNotChangeItsInput(t *testing.T) {
	in := requiredFixture()
	before := requiredFixture()
	RequiredOnly(in)
	if !reflect.DeepEqual(in, before) {
		t.Errorf("input changed to %+v", in)
	}
}

func TestRequiredOnlyLeavesAnOptionalBaseLinesInsideARequiredOneAsLeaves(t *testing.T) {
	tree := []Need{{IngredientID: 40, Quantity: 500, BaseRecipeID: 8, Path: "0", Made: []Need{
		{IngredientID: 30, Quantity: 100, BaseRecipeID: 7, Optional: true, Path: "0/0", Made: []Need{{IngredientID: 31, Quantity: 50, Path: "0/0/0"}}},
	}}}
	inner := RequiredOnly(tree)[0].Made[0]
	if inner.BaseRecipeID != 0 || inner.Made != nil || !inner.Optional {
		t.Errorf("optional inner node = %+v, want an optional leaf", inner)
	}
}

func TestMadeFractionsSkipsOptionalNodesAndTheyStayMade(t *testing.T) {
	have := func(id int64) float64 { return 5000 }
	tree := []Need{
		{IngredientID: 30, Quantity: 500, BaseRecipeID: 7, Optional: true, Path: "0"},
		{IngredientID: 40, Quantity: 500, BaseRecipeID: 8, Path: "1"},
	}
	fr := MadeFractions(tree, 1, func(id int64) float64 {
		if id == 30 {
			return 5000 // the optional line's jar: must not be taken
		}
		return have(id)
	})
	if f := fr("0"); f != 1 {
		t.Errorf("optional node fraction = %v, want 1 (made, not covered)", f)
	}
	if f := fr("1"); f != 0 {
		t.Errorf("required node fraction = %v, want 0 (covered by its jar)", f)
	}
}

func TestMadeFractionsAfterRequiredOnlyLeavesTheJarToARequiredLaterLine(t *testing.T) {
	tree := []Need{
		{IngredientID: 30, Quantity: 500, BaseRecipeID: 7, Optional: true, Path: "0"},
		{IngredientID: 30, Quantity: 500, BaseRecipeID: 7, Path: "1"},
	}
	jar := map[int64]float64{30: 500}
	fr := MadeFractions(RequiredOnly(tree), 1, func(id int64) float64 { return jar[id] })
	if f := fr("1"); f != 0 {
		t.Errorf("required later line fraction = %v, want 0", f)
	}
	if f := fr("0"); f != 1 {
		t.Errorf("optional line fraction = %v, want 1", f)
	}
}

func TestResolveTakesNothingForAnOptionalLeafAndTheRequiredLineGetsTheJar(t *testing.T) {
	avail := map[int64]float64{30: 500}
	tree := RequiredOnly([]Need{
		{IngredientID: 30, Quantity: 500, BaseRecipeID: 7, Optional: true, Path: "0"},
		{IngredientID: 30, Quantity: 500, BaseRecipeID: 7, Path: "1"},
	})
	out := Resolve(tree, 1, func(id int64) float64 { return avail[id] }, func(id int64, q float64) { avail[id] -= q })
	var required []Need
	for _, n := range out {
		if !n.Optional {
			required = append(required, n)
		}
	}
	if len(required) != 1 || required[0].IngredientID != 30 || required[0].Quantity != 500 || avail[30] != 0 {
		t.Errorf("required = %+v, left %v; want the jar's 500 taken by the required line", required, avail[30])
	}
}
