package baserecipe

import (
	"math"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// madeFractions is MadeFractions: one walk over the tree in line order, on a private copy of the availability.
// Each Base recipe node's fraction is (need - taken) / need, need being its Quantity times the made part of its
// parent (so the fraction is relative to the parent). A node under a fully covered parent gets 0 and takes
// nothing. A node needing nothing gets 1. Lines sharing one Base recipe share its jar, in line order.
func madeFractions(tree []Need, batches float64, have func(ingredientID int64) float64) func(Path) float64 {
	avail := map[int64]float64{}
	get := func(id int64) float64 {
		if v, ok := avail[id]; ok {
			return v
		}
		return have(id)
	}
	fracs := map[Path]float64{}
	var walk func(nodes []Need, mult float64, covered bool)
	walk = func(nodes []Need, mult float64, covered bool) {
		for _, n := range nodes {
			// An Optional line never takes Stock (BR-G round 3): it is shown as made, and so are the lines inside it.
			if n.BaseRecipeID == 0 || n.Optional {
				continue
			}
			need := n.Quantity * mult
			frac := 0.0
			if !covered {
				frac = 1
				if need > 0 {
					h := get(n.IngredientID)
					taken := 0.0
					if h > 0 {
						taken = math.Min(h, need)
					}
					avail[n.IngredientID] = h - taken
					frac = (need - taken) / need
				}
			}
			fracs[n.Path] = frac
			walk(n.Made, mult*frac, frac == 0)
		}
	}
	walk(tree, batches, false)
	return func(p Path) float64 {
		if f, ok := fracs[p]; ok {
			return f
		}
		return 1
	}
}

// RequiredOnly is the need tree with its Optional Base recipe nodes turned into plain optional leaves (BaseRecipeID 0, no Made):
// a leaf never takes Stock, so an optional line can neither take a jar from a later line nor from a later Course. A required
// Base recipe node keeps its Made, and its lines are made the same way, so it still takes its jar first. The result is the input
// of Resolve, and of MadeFractions (which skips optional nodes too). Pure; the input is not changed.
func RequiredOnly(tree []Need) []Need {
	out := make([]Need, 0, len(tree))
	for _, n := range tree {
		if n.Optional && n.BaseRecipeID != 0 {
			out = append(out, Need{IngredientID: n.IngredientID, Quantity: n.Quantity, Optional: true, Path: n.Path})
			continue
		}
		if len(n.Made) > 0 {
			n.Made = RequiredOnly(n.Made)
		}
		out = append(out, n)
	}
	return out
}

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
	q, _, ok := lineQty(cat, ln)
	return q, ok
}

// lineQty is qtyOf with the reason a line is skipped (empty when ok).
func lineQty(cat Catalog, ln Line) (float64, SkipReason, bool) {
	u, ok := cat.Units(ln.IngredientID)
	if !ok {
		return 0, SkipUnknownIngredient, false
	}
	q, err := units.ToBase(ln.Quantity, ln.Unit, u)
	if err != nil {
		return 0, SkipUnconvertibleUnit, false
	}
	return q, "", true
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
	exp, err := ExpandReport(cat, recipeID)
	if err != nil {
		return nil, err
	}
	return exp.Needs, nil
}

// ExpandReport is Expand plus the lines it skipped, each with the Recipe it sits in. Its Needs are exactly Expand's.
func ExpandReport(cat Catalog, recipeID int64) (Expansion, error) {
	r, ok := cat.Recipe(recipeID)
	if !ok {
		return Expansion{}, ErrNotFound
	}
	var rep Expansion
	needs, err := expandLines(cat, r, 1, false, []frame{{r.ID, r.Name}}, "", &rep)
	if err != nil {
		return Expansion{}, err
	}
	rep.Needs = needs
	return rep, nil
}

// expandLines builds the needs of r's lines. scale is the factor from the root Batch down to r: every Quantity is
// the raw line amount (Base Units) times scale, so nested Quantities are absolute for one root Batch. prefix is
// the Path of r's line in its parent ("" for the root); each node's Path is the raw index of its line, with
// unconvertible lines counted, joined to the prefix. Skipped lines are appended to rep as they are met.
func expandLines(cat Catalog, r Recipe, scale float64, optional bool, stack []frame, prefix string, rep *Expansion) ([]Need, error) {
	var out []Need
	for i, ln := range r.Lines {
		p := strconv.Itoa(i)
		if prefix != "" {
			p = prefix + "/" + p
		}
		q, reason, ok := lineQty(cat, ln)
		if !ok {
			rep.Skipped = append(rep.Skipped, Skipped{RecipeID: r.ID, RecipeName: r.Name, Line: i,
				IngredientID: ln.IngredientID, Unit: ln.Unit, Reason: reason})
			continue
		}
		opt := optional || ln.Optional
		n := Need{IngredientID: ln.IngredientID, Quantity: q * scale, Optional: opt, Path: Path(p)}
		child, yield, isBlock := blockOf(cat, ln.IngredientID)
		if !isBlock {
			out = append(out, n)
			continue
		}
		if err := cycleFor(stack, child); err != nil {
			return nil, err
		}
		made, err := expandLines(cat, child, scale*q/yield, opt, append(stack, frame{child.ID, child.Name}), p, rep)
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
