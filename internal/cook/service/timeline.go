package service

import (
	"context"
	"fmt"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// Timeline is the cooking timeline of one Meal Slot occurrence (spec §11, §16; crs-c2 §5.1): every Course of the
// slot in its order, the timeline items of the unresolved ones (cook.Timeline on whole minutes) and the Advance Steps
// of their fresh Courses.
type Timeline struct {
	Date         string
	MealSlotID   int64
	SlotName     string
	Time         string    // HH:MM, household time
	At           time.Time // the slot instant
	StartAt      time.Time // At less TotalMinutes: when cooking starts
	TotalMinutes int
	Courses      []TimelineCourse
	Items        []TimelineItem
	Advance      []TimelineAdvance
	Unresolved   int               // Courses still to cook or reheat
	Fresh        int               // fresh Courses still to cook
	Covered      []cook.BaseRecipe // the Base recipes whose Steps Stock covers: left out of Items and Advance (never nil)
}

// TimelineCourse is one Course of the slot. ReheatSeconds is set for an unresolved Leftover Course only.
type TimelineCourse struct {
	CourseID      int64
	Name          string
	RecipeID      int64
	RecipeName    string
	Scope         cook.Scope
	Batches       float64
	Fresh         bool
	State         string
	ReheatSeconds int
}

// TimelineItem is one entry of the timeline. Kind is active, passive, reheat or serve; Step is the Recipe Step index
// (-1 for Reheat and Serve; the composed index of the Recipe's Steps, which Stock never moves); Number is the 1-based
// place in Items (covered Steps are not numbered); TimerSeconds is 0 when the item has no timer. BaseRecipe is the Base
// recipe a Step comes from, nil for the Recipe's own.
type TimelineItem struct {
	CourseID        int64
	Scope           cook.Scope
	Kind            string
	Step            int
	Number          int
	Text            string
	DurationMinutes int
	StartSeconds    int
	EndSeconds      int
	Uses            []schedule.Use
	ImageURL        string
	TimerLabel      string
	TimerSeconds    int
	After           []int
	BaseRecipe      *cook.BaseRecipe
}

// TimelineAdvance is an Advance Step of a fresh Course, with its mark.
type TimelineAdvance struct {
	CourseID        int64
	Scope           cook.Scope
	Step            int
	Text            string
	LeadTimeMinutes int
	Done            bool
	DoneAt          *time.Time
	Warning         bool
	BaseRecipe      *cook.BaseRecipe
}

// openCourse is an unresolved Course with its Recipe's Steps.
type openCourse struct {
	meal MealInfo
	rs   cook.RecipeSteps
}

// SlotTimeline builds the timeline of a slot on a date. ErrNotFound when the slot has no Planned Meal there;
// ErrNotCookable when no Course is left to cook or reheat. Leftover Courses are reheats: items, but no Steps.
func (s *Service) SlotTimeline(ctx context.Context, date string, mealSlotID int64) (Timeline, error) {
	metas, err := s.cfg.Meals.Slot(ctx, date, mealSlotID)
	if err != nil {
		return Timeline{}, err
	}
	if len(metas) == 0 {
		return Timeline{}, ErrNotFound
	}
	zone, err := s.cfg.Household.Zone(ctx)
	if err != nil {
		return Timeline{}, err
	}
	if zone == nil {
		zone = time.UTC
	}
	t := Timeline{Date: date, MealSlotID: mealSlotID, SlotName: metas[0].SlotName, At: metas[0].At,
		Time: metas[0].At.In(zone).Format("15:04")}
	var inputs []cook.Course
	var open []openCourse
	// The planned fresh Courses share the Stock in Course order: one SlotSteps call when the port gives it (BR-G round 2).
	var fresh []SlotMeal
	freshAt := map[int64]int{} // Course id -> place in fresh
	for _, m := range metas {
		if m.State == "planned" && m.Batches > 0 {
			freshAt[m.CourseID] = len(fresh)
			fresh = append(fresh, SlotMeal{RecipeID: m.RecipeID, Batches: m.Batches, Date: m.Date})
		}
	}
	var shared []cook.RecipeSteps
	if sr, ok := s.cfg.Recipes.(SlotRecipes); ok && len(fresh) > 0 {
		if shared, err = sr.SlotSteps(ctx, fresh); err != nil {
			return Timeline{}, err
		}
		if len(shared) != len(fresh) {
			return Timeline{}, fmt.Errorf("slot steps: %d answers for %d meals", len(shared), len(fresh))
		}
	}
	for _, m := range metas {
		var rs cook.RecipeSteps
		if i, ok := freshAt[m.CourseID]; ok && shared != nil {
			rs = shared[i]
		} else if rs, err = s.mealSteps(ctx, m.RecipeID, m.Batches, m.Date); err != nil {
			return Timeline{}, err
		}
		tc := TimelineCourse{CourseID: m.CourseID, Name: m.CourseName, RecipeID: m.RecipeID, RecipeName: rs.Name,
			Scope: courseScope(m), Batches: m.Batches, Fresh: m.Batches > 0, State: m.State}
		if m.State == "planned" {
			t.Unresolved++
			c := cook.Course{ID: m.CourseID}
			if m.Batches > 0 {
				t.Fresh++
				c.Steps = scheduleSteps(rs.Steps)
			} else {
				c.Reheat = true
				c.ReheatSeconds = cook.DefaultReheatSeconds(m.Portions, rs.ReheatMinutes)
				tc.ReheatSeconds = c.ReheatSeconds
			}
			inputs = append(inputs, c)
			open = append(open, openCourse{meal: m, rs: rs})
		}
		t.Courses = append(t.Courses, tc)
	}
	if t.Unresolved == 0 {
		return Timeline{}, ErrNotCookable
	}
	res, err := cook.Timeline(inputs)
	if err != nil {
		return Timeline{}, err
	}
	res, minutes := cook.RoundToMinutes(res)
	t.TotalMinutes = minutes
	t.StartAt = t.At.Add(-time.Duration(minutes) * time.Minute)

	byCourse := map[int64]openCourse{}
	for _, oc := range open {
		byCourse[oc.meal.CourseID] = oc
	}
	multi := len(open) > 1
	t.Covered = coveredBy(open)
	for _, it := range res.Items {
		oc := byCourse[it.CourseID]
		ti := TimelineItem{CourseID: it.CourseID, Scope: courseScope(oc.meal), Step: -1,
			StartSeconds: it.StartSeconds, EndSeconds: it.EndSeconds, After: []int{}}
		switch it.Kind {
		case cook.ItemStep:
			st := oc.rs.Steps[it.StepIndex]
			if st.Covered {
				continue // Stock covers the Base recipe: the Step is not shown (its index stays)
			}
			uses, err := schedule.ScaleUses(st.Uses, oc.meal.Batches)
			if err != nil {
				return Timeline{}, err
			}
			ti.Kind, ti.Step, ti.Text, ti.DurationMinutes = string(st.Kind), it.StepIndex, st.Text, st.DurationMinutes
			ti.Uses, ti.ImageURL, ti.After = uses, st.ImageURL, append([]int{}, st.After...)
			ti.BaseRecipe = st.BaseRecipe
			if st.Kind == schedule.Passive {
				ti.TimerSeconds = st.DurationMinutes * 60
				ti.TimerLabel = cook.TimerLabel(recipeNumber(oc.rs, it.StepIndex), st.Text)
				if multi {
					ti.TimerLabel = oc.rs.Name + " · " + cook.CutStepText(st.Text)
				}
				if st.BaseRecipe != nil {
					ti.TimerLabel = cook.BaseTimerLabel(st.BaseRecipe, st.Text)
				}
			}
		case cook.ItemReheat:
			seconds := it.EndSeconds - it.StartSeconds
			ti.Kind, ti.Text = "reheat", "Reheat "+oc.rs.Name
			ti.DurationMinutes = (seconds + 59) / 60
			ti.TimerLabel, ti.TimerSeconds = "Reheat", seconds
		case cook.ItemServe:
			ti.Kind, ti.Text = "serve", oc.rs.Name+": ready to serve"
		}
		ti.Number = len(t.Items) + 1
		t.Items = append(t.Items, ti)
	}

	for _, oc := range open {
		if oc.meal.Batches <= 0 {
			continue
		}
		sc, err := schedule.Compute(scheduleSteps(oc.rs.Steps))
		if err != nil {
			return Timeline{}, err
		}
		scope := courseScope(oc.meal)
		marks, err := s.cfg.Store.Marks(ctx, scope)
		if err != nil {
			return Timeline{}, err
		}
		for _, adv := range sc.Advance {
			st := oc.rs.Steps[adv.Index]
			if st.Covered {
				continue
			}
			_, done := marks[adv.Index]
			a := TimelineAdvance{CourseID: oc.meal.CourseID, Scope: scope, Step: adv.Index,
				Text: st.Text, LeadTimeMinutes: adv.LeadTimeMinutes, Warning: !done, BaseRecipe: st.BaseRecipe}
			if at, ok := marks[adv.Index]; ok {
				a.Done, a.DoneAt = true, &at
			}
			t.Advance = append(t.Advance, a)
		}
	}
	return t, nil
}

// scheduleSteps maps a Recipe's Steps to the scheduler's.
func scheduleSteps(steps []cook.Step) []schedule.Step {
	out := make([]schedule.Step, 0, len(steps))
	for _, st := range steps {
		out = append(out, schedule.Step{Kind: st.Kind, DurationMinutes: st.DurationMinutes,
			LeadTimeMinutes: st.LeadTimeMinutes, After: st.After})
	}
	return out
}

// recipeNumber is the 1-based place of a Recipe Step among the Steps Cook Mode shows (not Advance, not covered): the
// number Cook Mode's labels use.
func recipeNumber(rs cook.RecipeSteps, index int) int {
	n := 1
	for i := 0; i < index && i < len(rs.Steps); i++ {
		if rs.Steps[i].Kind != schedule.Advance && !rs.Steps[i].Covered {
			n++
		}
	}
	return n
}

// coveredBy lists the outermost Base recipe of each covered block in the open Courses, each Course on its own (a jar
// covers the Courses' blocks separately), in order and never nil.
func coveredBy(open []openCourse) []cook.BaseRecipe {
	out := []cook.BaseRecipe{}
	seen := map[int64]bool{}
	for _, oc := range open {
		for _, b := range cook.OutermostCovered(oc.rs.Steps) {
			if seen[b.ID] {
				continue
			}
			seen[b.ID] = true
			out = append(out, b)
		}
	}
	return out
}
