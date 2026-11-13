package runner

import (
	"context"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/planner"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// NeedTrees gives the need tree of one Batch of every Recipe a Planned Meal can hold (plannable Recipes, archived ones
// included; never a Base recipe, which is never planned), by Recipe id, through Store.NeedTree
// (docs/dev/design/base-recipes.md sections 5, 7 and 14.1).
//
// It is the one place the tree is read for planning and shopping: DBSources.Recipes flattens it for the planner
// (baserecipe.Flatten), and the Shopping List's plans.Meals hands it on as shopping.Need.Made. BR-G's Cooked
// (needsFor with baserecipe.Resolve) reads the same trees. A Recipe whose tree cannot be built (a cycle written before
// the check) is left out and logged, as an unconvertible line is today; it does not fail the others.
func (s *DBSources) NeedTrees(ctx context.Context) (map[int64][]baserecipe.Need, error) {
	list, err := s.rc.List(ctx, recipestore.ListFilter{Archived: "all"})
	if err != nil {
		return nil, err
	}
	out := make(map[int64][]baserecipe.Need, len(list))
	for _, sum := range list {
		tree, err := s.rc.NeedTree(ctx, sum.ID)
		if errors.Is(err, baserecipe.ErrCycle) {
			s.log.Warn("recipe with a Base recipe cycle left out of the need trees", "recipe", sum.ID)
			continue
		}
		if err != nil {
			return nil, err
		}
		out[sum.ID] = tree
	}
	return out, nil
}

// advanceSteps are the Advance Steps of a Recipe for the lead-time filter: its own, and those of the Base recipes it
// calls for (composed, Stock not taken into account: the planner sees the Recipe as made from scratch).
func (s *DBSources) advanceSteps(ctx context.Context, rec recipe.Recipe) ([]planner.AdvanceStep, error) {
	if !hasBaseLine(rec) {
		var out []planner.AdvanceStep
		for _, a := range rec.Timing.Advance {
			out = append(out, planner.AdvanceStep{Lead: time.Duration(a.LeadTimeMinutes) * time.Minute})
		}
		return out, nil
	}
	composed, err := s.rc.Cook(ctx, rec.ID, nil)
	if err != nil {
		return nil, err
	}
	var out []planner.AdvanceStep
	for _, st := range composed.Steps {
		if st.Kind == schedule.Advance {
			out = append(out, planner.AdvanceStep{Lead: time.Duration(st.LeadTimeMinutes) * time.Minute})
		}
	}
	return out, nil
}

// hasBaseLine reports whether a Recipe calls for a Base recipe on any of its lines.
func hasBaseLine(rec recipe.Recipe) bool {
	for _, l := range rec.Lines {
		if l.Base != nil {
			return true
		}
	}
	return false
}
