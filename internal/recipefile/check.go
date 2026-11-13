package recipefile

import (
	"fmt"
	"math"

	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// CheckFile reports the file-intrinsic Recipe rules that the JSON Schema does
// not (or cannot) express and that BuildPlan would otherwise report during
// Import Review. It is pure and needs no database: it is the second half of
// "is this model answer a usable Recipe File?" after Parse. Paths are those of
// PathError ("$.recipes[0].steps[2].after[0]"); the result is in document
// order and nil when the file is fine.
//
// Rules (see docs/dev/design/ra-ab-core.md):
//   - Step timing: schedule.Validate on each Recipe's Steps (unknown kind,
//     Passive without duration, Advance without lead time, "after" index not
//     an earlier Step or an Advance Step); an Advance Step with "after".
//   - Fractional minutes: durationMinutes and leadTimeMinutes must be whole.
//     BuildPlan rounds up, but a model should say what it means, so it is
//     reported (and repaired) instead of silently rounded.
//   - A Ready Meal has exactly one ingredient line.
//   - Two Recipes of the file with the same normalised name.
//   - Base recipes (beta.6, BR-C): a Base recipe has a yieldUnit from the Yield units, and none of the
//     Course and planning fields (courses, wholeMeal, readyMeal, cooldownDays, leftoverUseByDays, reheatMinutes).
//   - A line's neededAtStep names a Step of its Recipe.
func CheckFile(f File) []PathError {
	var out []PathError
	seen := map[string]bool{}
	for ri, r := range f.Recipes {
		base := fmt.Sprintf("$.recipes[%d]", ri)
		key := units.NormalizeName(r.Name)
		if seen[key] {
			out = append(out, PathError{Path: base + ".name", Message: "another recipe in this file has the same name"})
		}
		seen[key] = true
		out = append(out, checkBaseRecipe(base, r)...)
		out = append(out, checkSteps(base, r.Steps)...)
		if r.ReadyMeal && len(r.Ingredients) != 1 {
			out = append(out, PathError{Path: base + ".ingredients", Message: "a ready meal has exactly one ingredient line"})
		}
		for li, l := range r.Ingredients {
			if l.NeededAtStep == nil {
				continue
			}
			if n := *l.NeededAtStep; n < 0 || n >= len(r.Steps) {
				out = append(out, PathError{Path: fmt.Sprintf("%s.ingredients[%d].neededAtStep", base, li),
					Message: fmt.Sprintf("the recipe has no step %d", n)})
			}
		}
	}
	return out
}

// yieldUnits are the units a Base recipe's Yield may be stated in (docs/spec/recipe-file.md, Base recipes).
var yieldUnits = map[string]bool{
	"g": true, "kg": true, "ml": true, "l": true, "dl": true, "cl": true,
	"tsp": true, "tbsp": true, "cup": true, "piece": true, "portion": true,
}

// ValidYieldUnit reports whether unit may state a Base recipe's Yield.
func ValidYieldUnit(unit string) bool { return yieldUnits[unit] }

// checkBaseRecipe reports the rules of a Base recipe that the schema cannot express: its yieldUnit, and no
// Course or planning field. A plannable Recipe (baseRecipe absent, null or false) has no rule here.
func checkBaseRecipe(base string, r Recipe) []PathError {
	if r.BaseRecipe == nil || !*r.BaseRecipe {
		return nil
	}
	var out []PathError
	switch {
	case r.YieldUnit == "":
		out = append(out, PathError{Path: base + ".yieldUnit", Message: "a base recipe needs a yield unit"})
	case !ValidYieldUnit(r.YieldUnit):
		out = append(out, PathError{Path: base + ".yieldUnit", Message: "the yield unit of a base recipe must be g, kg, ml, l, dl, cl, tsp, tbsp, cup, piece or portion"})
	}
	none := func(field string, set bool) {
		if set {
			out = append(out, PathError{Path: base + "." + field, Message: "a base recipe is never planned, so it has no " + field})
		}
	}
	none("courses", len(r.Courses) > 0)
	none("wholeMeal", r.WholeMeal != nil)
	none("readyMeal", r.ReadyMeal)
	none("cooldownDays", r.CooldownDays != nil)
	none("leftoverUseByDays", r.LeftoverUseByDays != nil)
	none("reheatMinutes", r.ReheatMinutes != nil)
	return out
}

// checkSteps reports the Step rules of one Recipe, grouped by Step.
func checkSteps(base string, steps []Step) []PathError {
	if len(steps) == 0 {
		return nil
	}
	sched := make([]schedule.Step, len(steps))
	perStep := make([][]PathError, len(steps))
	add := func(i int, path, msg string) {
		perStep[i] = append(perStep[i], PathError{Path: fmt.Sprintf("%s.steps[%d]%s", base, i, path), Message: msg})
	}
	for i, s := range steps {
		sched[i] = schedule.Step{Kind: schedule.Kind(s.Kind), After: s.After}
		if s.DurationMinutes != nil {
			sched[i].DurationMinutes = wholeMinutes(s.DurationMinutes)
			if *s.DurationMinutes != math.Trunc(*s.DurationMinutes) {
				add(i, ".durationMinutes", "minutes must be a whole number")
			}
		}
		if s.LeadTimeMinutes != nil {
			sched[i].LeadTimeMinutes = wholeMinutes(s.LeadTimeMinutes)
			if *s.LeadTimeMinutes != math.Trunc(*s.LeadTimeMinutes) {
				add(i, ".leadTimeMinutes", "minutes must be a whole number")
			}
		}
		if s.Kind == string(schedule.Advance) && len(s.After) > 0 {
			add(i, ".after", "an advance step has no 'after': it sits outside the timeline")
		}
	}
	// Schedule errors, in Validate's order per Step; "after" ones are located by index.
	byStep := make([][]schedule.ValidationError, len(steps))
	for _, e := range schedule.Validate(sched) {
		byStep[e.Step] = append(byStep[e.Step], e)
	}
	for i, es := range byStep {
		var afterPaths []int
		for _, j := range steps[i].After {
			if j < 0 || j >= i || (j < len(sched) && sched[j].Kind == schedule.Advance) {
				afterPaths = append(afterPaths, j)
			}
		}
		afterAt := func(j int) int {
			for k, a := range steps[i].After {
				if a == j {
					return k
				}
			}
			return 0
		}
		n := 0
		for _, e := range es {
			switch e.Code {
			case schedule.CodeUnknownKind:
				add(i, ".kind", e.Message)
			case schedule.CodePassiveNeedsDuration:
				add(i, ".durationMinutes", e.Message)
			case schedule.CodeAdvanceNeedsLead:
				add(i, ".leadTimeMinutes", e.Message)
			case schedule.CodeNegativeMinutes:
				if sched[i].Kind == schedule.Advance {
					add(i, ".leadTimeMinutes", e.Message)
				} else {
					add(i, ".durationMinutes", e.Message)
				}
			case schedule.CodeAfterNotEarlier, schedule.CodeAfterAdvance:
				if n < len(afterPaths) {
					add(i, fmt.Sprintf(".after[%d]", afterAt(afterPaths[n])), e.Message)
					n++
				}
			}
		}
	}
	var out []PathError
	for _, p := range perStep {
		out = append(out, p...)
	}
	return out
}
