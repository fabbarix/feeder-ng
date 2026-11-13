package runner

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
)

// errNotImplemented marks the BR-F stub; the developer replaces it.
var errNotImplemented = errors.New("runner: NeedTrees is not implemented yet (BR-F)")

// NeedTrees gives the need tree of one Batch of every Recipe a Planned Meal can hold (plannable Recipes, archived ones
// included; never a Base recipe, which is never planned), by Recipe id, through Store.NeedTree
// (docs/dev/design/base-recipes.md sections 5, 7 and 14.1).
//
// It is the one place the tree is read for planning and shopping: DBSources.Recipes flattens it for the planner
// (baserecipe.Flatten), and the Shopping List's plans.Meals hands it on as shopping.Need.Made. BR-G's Cooked
// (needsFor with baserecipe.Resolve) reads the same trees. A Recipe whose tree cannot be built (a cycle written before
// the check) is left out and logged, as an unconvertible line is today; it does not fail the others.
func (s *DBSources) NeedTrees(ctx context.Context) (map[int64][]baserecipe.Need, error) {
	return nil, errNotImplemented
}
