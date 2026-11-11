package httpapi

import (
	"context"
	"net/http"
	"sort"

	"github.com/fabbarix/feeder-ng/internal/household"
	recipestore "github.com/fabbarix/feeder-ng/internal/recipe/store"
)

// removesJSON is what taking Courses off Meal Slots removes (or, with dryRun, would remove). Both lists are []
// when nothing goes.
type removesJSON struct {
	PlannedMeals []removedMealJSON `json:"plannedMeals"`
	SlotRules    []removedRuleJSON `json:"slotRules"`
}

type removedMealJSON struct {
	Date         string `json:"date"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	CourseID     int64  `json:"courseId"`
	CourseName   string `json:"courseName"`
	RecipeID     int64  `json:"recipeId"`
	RecipeName   string `json:"recipeName"`
	Pinned       bool   `json:"pinned"`
}

type removedRuleJSON struct {
	ID           int64  `json:"id"`
	MealSlotID   int64  `json:"mealSlotId"`
	MealSlotName string `json:"mealSlotName"`
	CourseID     int64  `json:"courseId"`
	CourseName   string `json:"courseName"`
	RecipeID     int64  `json:"recipeId,omitempty"`
	RecipeName   string `json:"recipeName,omitempty"`
	Tag          string `json:"tag,omitempty"`
}

// removesOut names what goes and sorts it: Pinned meals first (the dialog names them before saving), then by
// date, Meal Slot and Course; rules by id. Courses keep their real ids, the main Course included.
func (a *api) removesOut(r *http.Request, rem household.Removals) (removesJSON, error) {
	ctx := r.Context()
	slots, err := a.slotNames(ctx)
	if err != nil {
		return removesJSON{}, err
	}
	courses, err := a.courseNames(ctx)
	if err != nil {
		return removesJSON{}, err
	}
	recipes, err := a.recipeNames(ctx)
	if err != nil {
		return removesJSON{}, err
	}
	out := removesJSON{PlannedMeals: []removedMealJSON{}, SlotRules: []removedRuleJSON{}}

	meals := append([]household.RemovedMeal(nil), rem.PlannedMeals...)
	sort.SliceStable(meals, func(i, j int) bool {
		if meals[i].Pinned != meals[j].Pinned {
			return meals[i].Pinned
		}
		if meals[i].Date != meals[j].Date {
			return meals[i].Date < meals[j].Date
		}
		if meals[i].MealSlotID != meals[j].MealSlotID {
			return meals[i].MealSlotID < meals[j].MealSlotID
		}
		return meals[i].CourseID < meals[j].CourseID
	})
	for _, m := range meals {
		out.PlannedMeals = append(out.PlannedMeals, removedMealJSON{Date: m.Date, MealSlotID: m.MealSlotID,
			MealSlotName: slots[m.MealSlotID], CourseID: m.CourseID, CourseName: courses[m.CourseID],
			RecipeID: m.RecipeID, RecipeName: recipes[m.RecipeID], Pinned: m.Pinned})
	}

	rules := append([]household.RemovedRule(nil), rem.SlotRules...)
	sort.SliceStable(rules, func(i, j int) bool { return rules[i].ID < rules[j].ID })
	for _, s := range rules {
		o := removedRuleJSON{ID: s.ID, MealSlotID: s.MealSlotID, MealSlotName: slots[s.MealSlotID],
			CourseID: s.CourseID, CourseName: courses[s.CourseID], Tag: s.Tag}
		if s.RecipeID != 0 {
			o.RecipeID, o.RecipeName = s.RecipeID, recipes[s.RecipeID]
		}
		out.SlotRules = append(out.SlotRules, o)
	}
	return out, nil
}

// slotNames maps every Meal Slot id to its name.
func (a *api) slotNames(ctx context.Context) (map[int64]string, error) {
	list, err := a.st.Slots(ctx)
	if err != nil {
		return nil, err
	}
	out := make(map[int64]string, len(list))
	for _, s := range list {
		out[s.ID] = s.Name
	}
	return out, nil
}

// recipeNames maps every Recipe id, archived ones included, to its name.
func (a *api) recipeNames(ctx context.Context) (map[int64]string, error) {
	list, err := a.recipes.List(ctx, recipestore.ListFilter{Archived: "all"})
	if err != nil {
		return nil, err
	}
	out := make(map[int64]string, len(list))
	for _, s := range list {
		out[s.ID] = s.Name
	}
	return out, nil
}
