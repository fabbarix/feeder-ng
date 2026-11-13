package runner

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// RegeneratePreview is what Regenerate would replace, read without writing anything (POST /api/plan/regenerate?dryRun=1).
type RegeneratePreview struct {
	// Replaces is the number of Planned Meals Regenerate redoes: every unresolved, unpinned one whose slot has not
	// passed and that is not in a Not served slot (Bought ones included).
	Replaces int
	// Bought are the Bought ones among them (Meal.Bought lists the Ingredients), in date, slot and Course order.
	Bought []plan.Meal
}

// RegeneratePreview answers what Regenerate would replace. It bumps no generation, writes nothing and publishes nothing.
func (r *Runner) RegeneratePreview(ctx context.Context) (RegeneratePreview, error) {
	return RegeneratePreview{}, nil
}
