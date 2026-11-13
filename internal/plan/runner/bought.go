package runner

import (
	"context"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/planner"
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
	in, err := r.info(ctx)
	if err != nil {
		return RegeneratePreview{}, err
	}
	meals, err := r.d.Store.Meals(ctx, in.today, "")
	if err != nil {
		return RegeneratePreview{}, err
	}
	var out RegeneratePreview
	for _, m := range meals {
		if m.State != plan.StatePlanned || m.Pinned {
			continue
		}
		at, ok, err := r.slotAt(ctx, in, m.Key)
		if err != nil {
			return RegeneratePreview{}, err
		}
		if !ok || at.Before(in.now) {
			continue // the slot has passed (or is no longer on the calendar): waits in To confirm
		}
		d, err := r.d.Source.SlotDate(ctx, m.Key.MealSlotID, m.Key.Date)
		if err != nil {
			return RegeneratePreview{}, err
		}
		if d.NotServed {
			continue
		}
		out.Replaces++
		if m.IsBought() {
			out.Bought = append(out.Bought, m)
		}
	}
	sort.SliceStable(out.Bought, func(a, b int) bool {
		ka, kb := out.Bought[a].Key, out.Bought[b].Key
		if ka.Date != kb.Date {
			return ka.Date < kb.Date
		}
		if ka.MealSlotID != kb.MealSlotID {
			return ka.MealSlotID < kb.MealSlotID
		}
		return ka.CourseID < kb.CourseID
	})
	return out, nil
}

// warnCells sets the hard-rule Warning of every Pinned or Bought Planned Meal in cells (plan.HardRuleWarning). The
// Recipes and Preferences are read only when a cell can carry a warning.
func (r *Runner) warnCells(ctx context.Context, cells []CourseView) error {
	var recipes map[int64]planner.Recipe
	var prefs map[int64]planner.Preferences
	for i := range cells {
		m := cells[i].Meal
		if m == nil || m.State != plan.StatePlanned || m.From != nil || !(m.Pinned || m.IsBought()) {
			continue
		}
		if recipes == nil {
			all, err := r.d.Source.Recipes(ctx)
			if err != nil {
				return err
			}
			recipes = make(map[int64]planner.Recipe, len(all))
			for _, rc := range all {
				recipes[int64(rc.ID)] = rc
			}
			if prefs, err = r.d.Source.Preferences(ctx); err != nil {
				return err
			}
		}
		rc, found := recipes[m.RecipeID]
		cells[i].Warning = plan.HardRuleWarning(*m, rc, found, cells[i].Attendance, prefs)
	}
	return nil
}
