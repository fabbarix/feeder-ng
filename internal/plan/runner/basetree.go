package runner

import (
	"context"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// treeResults is the need tree of every plannable Recipe (archived ones included; never a Base recipe, which is never
// planned), from one batch Store.NeedTrees: one catalog load for the whole read. The warnings are logged here, once per
// read: a Recipe on a cycle (it has no tree, and the others are still given), and each line expansion skipped, with
// the Recipe that owns it (a Base recipe nested under the root is named as the owner, not the caller).
func (s *DBSources) treeResults(ctx context.Context) (map[int64]recipestore.TreeResult, error) {
	res, err := s.rc.NeedTrees(ctx)
	if err != nil {
		return nil, err
	}
	ids := make([]int64, 0, len(res))
	for id := range res {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool { return ids[i] < ids[j] })
	for _, id := range ids {
		tr := res[id]
		if tr.Err != nil {
			s.log.Warn("recipe with a Base recipe cycle left out of the need trees", "recipe", id)
		}
		for _, sk := range tr.Skipped {
			s.log.Warn("recipe line skipped", "recipe", sk.RecipeID, "ingredient", sk.IngredientID,
				"reason", string(sk.Reason), "line", sk.Line)
		}
	}
	return res, nil
}

// NeedTrees gives the need tree of one Batch of every Recipe a Planned Meal can hold (plannable Recipes, archived ones
// included; never a Base recipe, which is never planned), by Recipe id, over one batch read (treeResults)
// (docs/dev/design/base-recipes.md sections 5, 7 and 14.1).
//
// It is the one place the tree is read for planning and shopping: DBSources.Recipes flattens it for the planner
// (baserecipe.Flatten), and the Shopping List's plans.Meals hands it on as shopping.Need.Made. A Recipe whose tree
// cannot be built (a cycle written before the check) is left out and logged; it does not fail the others.
func (s *DBSources) NeedTrees(ctx context.Context) (map[int64][]baserecipe.Need, error) {
	res, err := s.treeResults(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[int64][]baserecipe.Need, len(res))
	for id, tr := range res {
		if tr.Err == nil {
			out[id] = tr.Needs
		}
	}
	return out, nil
}
