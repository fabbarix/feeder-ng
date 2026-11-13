package baserecipe

import (
	"math"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// frame is one Recipe on the path from the root to the Recipe being expanded or composed.
type frame struct {
	id   int64
	name string
}

// cycleFor returns the CycleError of a call for child made from the path, or nil when child is not on it.
func cycleFor(stack []frame, child Recipe) error {
	for i, f := range stack {
		if f.id == child.ID {
			path := make([]string, 0, len(stack)-i+1)
			for _, g := range stack[i:] {
				path = append(path, g.name)
			}
			return &CycleError{Path: append(path, child.Name)}
		}
	}
	return nil
}

// qtyOf is a line's Quantity in its Ingredient's Base Units. ok is false for an unknown Ingredient or a unit
// that does not convert: such a line is skipped.
func qtyOf(cat Catalog, ln Line) (float64, bool) {
	u, ok := cat.Units(ln.IngredientID)
	if !ok {
		return 0, false
	}
	q, err := units.ToBase(ln.Quantity, ln.Unit, u)
	return q, err == nil
}

// blockOf reports whether an Ingredient is a Base recipe's, and if so the Base recipe and its Yield in the
// Ingredient's Base Units. A broken Base recipe (no Yield Ingredient, unconvertible Yield) counts as plain.
func blockOf(cat Catalog, ingredientID int64) (Recipe, float64, bool) {
	id, ok := cat.BaseOf(ingredientID)
	if !ok {
		return Recipe{}, 0, false
	}
	r, ok := cat.Recipe(id)
	if !ok || r.Base == nil {
		return Recipe{}, 0, false
	}
	u, ok := cat.Units(r.Base.IngredientID)
	if !ok {
		return Recipe{}, 0, false
	}
	yield, err := units.ToBase(r.Base.Quantity, r.Base.Unit, u)
	if err != nil || yield <= 0 {
		return Recipe{}, 0, false
	}
	return r, yield, true
}

// Expand returns the need tree of one Batch of the Recipe. An unconvertible line is skipped. A Base recipe that
// is (transitively) on its own path is a *CycleError. An unknown Recipe id is ErrNotFound.
func Expand(cat Catalog, recipeID int64) ([]Need, error) {
	r, ok := cat.Recipe(recipeID)
	if !ok {
		return nil, ErrNotFound
	}
	return expandLines(cat, r, 1, false, []frame{{r.ID, r.Name}})
}

// expandLines builds the needs of r's lines. scale is the factor from the root Batch down to r: every Quantity is
// the raw line amount (Base Units) times scale, so nested Quantities are absolute for one root Batch.
func expandLines(cat Catalog, r Recipe, scale float64, optional bool, stack []frame) ([]Need, error) {
	var out []Need
	for _, ln := range r.Lines {
		q, ok := qtyOf(cat, ln)
		if !ok {
			continue
		}
		opt := optional || ln.Optional
		n := Need{IngredientID: ln.IngredientID, Quantity: q * scale, Optional: opt}
		child, yield, isBlock := blockOf(cat, ln.IngredientID)
		if !isBlock {
			out = append(out, n)
			continue
		}
		if err := cycleFor(stack, child); err != nil {
			return nil, err
		}
		made, err := expandLines(cat, child, scale*q/yield, opt, append(stack, frame{child.ID, child.Name}))
		if err != nil {
			return nil, err
		}
		n.BaseRecipeID = child.ID
		n.Made = made
		out = append(out, n)
	}
	return out, nil
}

// Flatten returns the leaves of the tree, depth first, for the planner and Exclusions: every plain Ingredient
// at its full Quantity, every Base recipe Ingredient as an optional line of Quantity 0 (placed before the
// leaves inside it), and an empty Base recipe's Ingredient as a real line at its Quantity.
func Flatten(tree []Need) []Need { return flattenInto(nil, tree) }

func flattenInto(out []Need, tree []Need) []Need {
	for _, n := range tree {
		if len(n.Made) == 0 {
			out = append(out, Need{IngredientID: n.IngredientID, Quantity: n.Quantity, Optional: n.Optional, BaseRecipeID: n.BaseRecipeID})
			continue
		}
		out = append(out, Need{IngredientID: n.IngredientID, Optional: true, BaseRecipeID: n.BaseRecipeID})
		out = flattenInto(out, n.Made)
	}
	return out
}

// Resolve walks the tree Stock first, for the given number of Batches. For each Base recipe node needing
// q = Quantity x batches it takes min(have(id), q) of the Base recipe Ingredient (calling take(id, taken) so
// the caller's availability shrinks for later nodes), then resolves Made scaled by (q-taken)/q. The result is
// flat: the Base recipe Ingredient for the part Stock covered, plain Ingredients for the part made; an empty
// Base recipe contributes its Ingredient for the whole q (the covered part and the rest). Optional is kept.
func Resolve(tree []Need, batches float64, have func(ingredientID int64) float64, take func(ingredientID int64, q float64)) []Need {
	return resolveNodes(tree, batches, have, take)
}

// resolveNodes resolves tree nodes whose Quantities are scaled by mult (the root Batches, times the made part
// of each Base recipe above them).
func resolveNodes(tree []Need, mult float64, have func(int64) float64, take func(int64, float64)) []Need {
	var out []Need
	for _, n := range tree {
		need := n.Quantity * mult
		if n.BaseRecipeID == 0 {
			out = append(out, Need{IngredientID: n.IngredientID, Quantity: need, Optional: n.Optional})
			continue
		}
		covered := 0.0
		if need > 0 {
			if h := have(n.IngredientID); h > 0 {
				covered = math.Min(h, need)
			}
			if covered > 0 {
				take(n.IngredientID, covered)
			}
		}
		if len(n.Made) == 0 {
			if need > 0 {
				out = append(out, Need{IngredientID: n.IngredientID, Quantity: need, Optional: n.Optional, BaseRecipeID: n.BaseRecipeID})
			}
			continue
		}
		if covered > 0 {
			out = append(out, Need{IngredientID: n.IngredientID, Quantity: covered, Optional: n.Optional, BaseRecipeID: n.BaseRecipeID})
		}
		if left := need - covered; left > 0 {
			// Made is for n.Quantity of the Base recipe; the part still to make is left of it.
			out = append(out, resolveNodes(n.Made, left/n.Quantity, have, take)...)
		}
	}
	return out
}
