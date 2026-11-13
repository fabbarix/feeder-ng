package shopping_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/shopping"
)

// ---- NeedsFromTree, the conversion plans.Meals does from Store.NeedTree ----

func TestNeedsFromTreeKeepsTheTreeNestedAndOptional(t *testing.T) {
	tree := []baserecipe.Need{
		{IngredientID: 1, Quantity: 200},
		{IngredientID: 10, Quantity: 500, BaseRecipeID: 7, Optional: true, Made: []baserecipe.Need{
			{IngredientID: 3, Quantity: 500, Optional: true},
			{IngredientID: 11, Quantity: 50, BaseRecipeID: 8, Optional: true, Made: []baserecipe.Need{{IngredientID: 12, Quantity: 25, Optional: true}}},
		}},
		{IngredientID: 14, Quantity: 50, BaseRecipeID: 9}, // an empty Base recipe: no Made
	}
	got := shopping.NeedsFromTree(tree)
	if len(got) != 3 {
		t.Fatalf("NeedsFromTree = %+v, want 3 nodes", got)
	}
	if g := got[0]; g.IngredientID != 1 || g.Quantity != 200 || g.Optional || g.Made != nil {
		t.Errorf("plain node = %+v", got[0])
	}
	b := got[1]
	if b.IngredientID != 10 || b.Quantity != 500 || !b.Optional || len(b.Made) != 2 || b.Made[0].IngredientID != 3 || len(b.Made[1].Made) != 1 || b.Made[1].Made[0].IngredientID != 12 || b.Made[1].Made[0].Quantity != 25 {
		t.Errorf("Base recipe node = %+v, want its Made children, nested, with Optional kept", b)
	}
	if e := got[2]; e.IngredientID != 14 || e.Quantity != 50 || e.Made != nil {
		t.Errorf("empty Base recipe node = %+v, want a plain Need of its Ingredient (Made nil)", e)
	}
}
