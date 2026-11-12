package httpapi

import (
	"net/http"
	"sort"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
	"github.com/fabbarix/feeder-ng/internal/plan/runner"
)

// Team C-RX (docs/dev/design/crs-crx.md): GET /api/plan/couldnt-plan/exclusions, which names the Exclusions that left a
// Course empty. Everything here is new; no existing payload changes.

// memberRefOut is a Member as an Avatar needs it (the plan payload's attendee fields).
type memberRefOut struct {
	ID       int64  `json:"id"`
	Name     string `json:"name"`
	Colour   string `json:"colour"`
	PhotoURL string `json:"photoUrl,omitempty"`
	Avatar   string `json:"avatar,omitempty"`
}

type ingredientRefOut struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

type recipeRefOut struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
}

// exclusionOut is one record: a Member's Ingredient (or, with a null Ingredient, the Recipes the Member excludes
// directly) and the Recipes it ruled out.
type exclusionOut struct {
	Member      memberRefOut      `json:"member"`
	Ingredient  *ingredientRefOut `json:"ingredient"`
	Recipes     []recipeRefOut    `json:"recipes"`
	RecipeCount int               `json:"recipeCount"`
}

// exclusionCellOut is one Course of one Meal Slot occurrence that Exclusions left without a Recipe.
type exclusionCellOut struct {
	Date            string          `json:"date"`
	MealSlotID      int64           `json:"mealSlotId"`
	MealSlotName    string          `json:"mealSlotName"`
	Time            string          `json:"time"`
	CourseID        int64           `json:"courseId"`
	CourseName      string          `json:"courseName"`
	SlotRuleClaimed bool            `json:"slotRuleClaimed"`
	Eliminated      eliminationsOut `json:"eliminated"`
	Attendance      []memberRefOut  `json:"attendance"`
	OptOuts         []memberRefOut  `json:"optOuts"`
	Exclusions      []exclusionOut  `json:"exclusions"` // null (nil) when no detail is stored
	MoreExclusions  int             `json:"moreExclusions"`
}

// memberRefFor is the Member reference of an id; ok is false when the Member is gone.
func memberRefFor(id int64, t table) (memberRefOut, bool) {
	name, ok := t.members[id]
	if !ok {
		return memberRefOut{}, false
	}
	return memberRefOut{ID: id, Name: name, Colour: t.memberColour[id], PhotoURL: t.memberPhoto[id], Avatar: t.memberAvatar[id]}, true
}

// attendanceFor are the Members eating the Course: those of att with a Portion Factor above zero, in att's order.
// Members that are gone are left out.
func attendanceFor(att []plan.Attendee, t table) []memberRefOut {
	out := []memberRefOut{}
	for _, a := range att {
		if a.Factor <= 0 {
			continue
		}
		if ref, ok := memberRefFor(a.MemberID, t); ok {
			out = append(out, ref)
		}
	}
	return out
}

// optOutsFor are the Members of ids as references, in id order, never nil.
func optOutsFor(ids []int64, t table) []memberRefOut {
	sorted := append([]int64(nil), ids...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	out := []memberRefOut{}
	for _, id := range sorted {
		if ref, ok := memberRefFor(id, t); ok {
			out = append(out, ref)
		}
	}
	return out
}

// exclusionsFor resolves the stored detail of a cell's reason against the names at read time (crs-crx.md §3). It
// returns nil (JSON null) when no detail is stored, otherwise a non-nil list, empty when every record was dropped.
func exclusionsFor(u plan.Unfilled, t table) []exclusionOut {
	if u.Exclusions == nil && u.MoreExclusions == 0 {
		return nil
	}
	out := []exclusionOut{}
	for _, rec := range u.Exclusions {
		member, ok := memberRefFor(rec.MemberID, t)
		if !ok {
			continue
		}
		var ing *ingredientRefOut
		if rec.IngredientID != 0 {
			name, ok := t.ingredients[rec.IngredientID]
			if !ok {
				continue
			}
			ing = &ingredientRefOut{ID: rec.IngredientID, Name: name}
		}
		recipes := []recipeRefOut{}
		for _, id := range rec.RecipeIDs {
			if name, ok := t.recipes[id]; ok {
				recipes = append(recipes, recipeRefOut{ID: id, Name: name})
			}
		}
		if len(recipes) == 0 {
			continue
		}
		sort.SliceStable(recipes, func(i, j int) bool {
			a, b := strings.ToLower(recipes[i].Name), strings.ToLower(recipes[j].Name)
			if a != b {
				return a < b
			}
			return recipes[i].ID < recipes[j].ID
		})
		dropped := len(rec.RecipeIDs) - len(recipes)
		out = append(out, exclusionOut{Member: member, Ingredient: ing, Recipes: recipes, RecipeCount: rec.RecipeCount - dropped})
	}
	return out
}

// courseRows indexes the Course rows of a View by slot occurrence and raw Course id, as CouldntPlan keys its cells.
func courseRows(slots []runner.SlotView) map[plan.Key]runner.CourseView {
	idx := map[plan.Key]runner.CourseView{}
	for _, s := range slots {
		for _, cv := range s.Courses {
			if cv.History {
				continue
			}
			k := plan.Key{Date: s.Key.Date, MealSlotID: s.Key.MealSlotID, CourseID: cv.CourseID}
			idx[k] = cv
		}
	}
	return idx
}

// exclusionCell builds one answer cell from a Couldn't plan cell. Its Course Attendance and opt-outs come from the
// View's Course row.
func exclusionCell(s runner.ListEntry, rows map[plan.Key]runner.CourseView, t table) exclusionCellOut {
	u := *s.Unfilled
	att, optOuts := s.Attendance, []int64{}
	if cv, ok := rows[s.Key]; ok {
		att, optOuts = cv.Attendance, cv.OptOutMemberIDs
	}
	courseID := s.Key.CourseID
	return exclusionCellOut{
		Date: s.Key.Date, MealSlotID: s.Key.MealSlotID, MealSlotName: s.Name, Time: s.Time,
		CourseID: courseID, CourseName: t.courses[courseID],
		SlotRuleClaimed: u.SlotRuleClaimed, Eliminated: unfilledFor(u).Eliminated,
		Attendance: attendanceFor(att, t), OptOuts: optOutsFor(optOuts, t),
		Exclusions: exclusionsFor(u, t), MoreExclusions: u.MoreExclusions,
	}
}

// couldntExclusions answers GET /api/plan/couldnt-plan/exclusions.
func (a *api) couldntExclusions(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()
	cells, err := a.run.CouldntPlan(ctx)
	if err != nil {
		writeErr(w, err)
		return
	}
	view, err := a.run.View(ctx, "", "")
	if err != nil {
		writeErr(w, err)
		return
	}
	t, err := a.names.load(ctx)
	if err != nil {
		writeErr(w, err)
		return
	}
	rows := courseRows(view.Slots)
	out := excludedCells(cells, rows, t)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"cells": out})
}

// excludedCells keeps the cells whose reason is no_candidates with an Exclusion count, in the plan's order.
func excludedCells(cells []runner.ListEntry, rows map[plan.Key]runner.CourseView, t table) []exclusionCellOut {
	out := []exclusionCellOut{}
	for _, s := range cells {
		if s.Unfilled == nil || s.Unfilled.Reason != "no_candidates" || s.Unfilled.Eliminated.Exclusion <= 0 {
			continue
		}
		out = append(out, exclusionCell(s, rows, t))
	}
	return out
}
