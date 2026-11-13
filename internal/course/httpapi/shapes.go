package httpapi

import (
	"errors"
	"net/http"
	"strconv"

	"github.com/fabbarix/feeder-ng/internal/course"
	"github.com/fabbarix/feeder-ng/internal/httpx"
)

// courseJSON is a Course as GET /api/courses and every single-Course answer show it.
type courseJSON struct {
	ID            int64  `json:"id"`
	Name          string `json:"name"`
	Position      int    `json:"position"`
	Main          bool   `json:"main"`
	Archived      bool   `json:"archived"`
	RecipeCount   int    `json:"recipeCount"`
	MealSlotCount int    `json:"mealSlotCount"`
	Planned       bool   `json:"planned"`
}

func courseOut(l course.Listing) courseJSON {
	return courseJSON{ID: l.ID, Name: l.Name, Position: l.Position, Main: l.Main, Archived: l.Archived,
		RecipeCount: l.RecipeCount, MealSlotCount: l.MealSlotCount, Planned: l.Planned}
}

func coursesOut(list []course.Listing) []courseJSON {
	out := make([]courseJSON, 0, len(list))
	for _, l := range list {
		out = append(out, courseOut(l))
	}
	return out
}

// impactJSON is what a Delete or Archive changes (GET /api/courses/{id}/impact).
type impactJSON struct {
	Planned           bool             `json:"planned"`
	Recipes           int              `json:"recipes"`
	RecipesOnlyThis   int              `json:"recipesOnlyThis"`
	MealSlots         int              `json:"mealSlots"`
	MealSlotsOnlyThis int              `json:"mealSlotsOnlyThis"`
	PlannedMeals      []plannedMealOut `json:"plannedMeals"`
	SlotRules         []ruleOut        `json:"slotRules"`
}

type plannedMealOut struct {
	Date         string   `json:"date"`
	MealSlotID   int64    `json:"mealSlotId"`
	MealSlotName string   `json:"mealSlotName"`
	RecipeID     int64    `json:"recipeId"`
	RecipeName   string   `json:"recipeName"`
	Pinned       bool     `json:"pinned"`
	Bought       []string `json:"bought"` // the Ingredients bought for the meal by name; [] when none (ADR 0013)
}

// ruleOut is a Slot Rule: a Recipe rule carries recipeId and recipeName, a rule by Tag carries tag.
type ruleOut struct {
	ID         int64  `json:"id"`
	MealSlotID int64  `json:"mealSlotId"`
	RecipeID   int64  `json:"recipeId,omitempty"`
	RecipeName string `json:"recipeName,omitempty"`
	Tag        string `json:"tag,omitempty"`
}

func impactOut(im course.Impact, recipeNames map[int64]string) impactJSON {
	out := impactJSON{Planned: im.Planned, Recipes: im.Recipes, RecipesOnlyThis: im.RecipesOnlyThis,
		MealSlots: im.MealSlots, MealSlotsOnlyThis: im.MealSlotsOnlyThis,
		PlannedMeals: make([]plannedMealOut, 0, len(im.PlannedMeals)), SlotRules: make([]ruleOut, 0, len(im.SlotRules))}
	for _, m := range im.PlannedMeals {
		out.PlannedMeals = append(out.PlannedMeals, plannedMealOut{Date: m.Date, MealSlotID: m.MealSlotID,
			MealSlotName: m.MealSlotName, RecipeID: m.RecipeID, RecipeName: m.RecipeName, Pinned: m.Pinned,
			Bought: nonNilNames(m.Bought)})
	}
	for _, r := range im.SlotRules {
		o := ruleOut{ID: r.ID, MealSlotID: r.MealSlotID, Tag: r.Tag}
		if r.RecipeID != 0 {
			o.RecipeID, o.RecipeName = r.RecipeID, recipeNames[r.RecipeID]
		}
		out.SlotRules = append(out.SlotRules, o)
	}
	return out
}

// refusal is the error body of a refused request. field, reason and archivedCourseId appear when set.
type refusal struct {
	Code             string `json:"code"`
	Message          string `json:"message"`
	Field            string `json:"field,omitempty"`
	Reason           string `json:"reason,omitempty"`
	ArchivedCourseID int64  `json:"archivedCourseId,omitempty"`
}

func writeRefusal(w http.ResponseWriter, status int, rf refusal) {
	httpx.WriteJSON(w, status, map[string]refusal{"error": rf})
}

// fail maps a store or domain error to the API's answer (spec §16). name is the name the request
// used, so a clash with an archived Course can point at it (archivedCourseId).
func (a *api) fail(w http.ResponseWriter, r *http.Request, err error, name string) {
	switch {
	case errors.Is(err, course.ErrNotFound):
		writeRefusal(w, http.StatusNotFound, refusal{Code: "not_found", Message: "Not found"})
	case errors.Is(err, course.ErrNameInvalid):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "name",
			Message: "A Course name needs 1 to 40 characters"})
	case errors.Is(err, course.ErrNameTaken):
		a.nameTaken(w, r, name)
	case errors.Is(err, course.ErrTooMany):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "too_many_courses",
			Message: "A Household has at most 20 Courses"})
	case errors.Is(err, course.ErrMain):
		writeRefusal(w, http.StatusConflict, refusal{Code: "course_main",
			Message: "The main Course cannot be removed; make another Course main first"})
	case errors.Is(err, course.ErrLast):
		writeRefusal(w, http.StatusConflict, refusal{Code: "course_last", Message: "The last Course cannot be removed"})
	case errors.Is(err, course.ErrPlanned):
		writeRefusal(w, http.StatusConflict, refusal{Code: "course_planned",
			Message: "A Planned Meal or Leftover uses this Course; archive it instead"})
	case errors.Is(err, course.ErrReplacement):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "replacement",
			Reason: "replacement_invalid", Message: "Choose an active Course to give the Recipes and Meal Slots left without one"})
	case errors.Is(err, course.ErrOrder):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "ids",
			Message: "The order must list every active Course once"})
	case errors.Is(err, course.ErrArchived):
		writeRefusal(w, http.StatusUnprocessableEntity, refusal{Code: "validation_failed", Field: "main",
			Message: "An archived Course cannot be made main"})
	default:
		httpx.WriteAPIError(w, err)
	}
}

// nameTaken answers 409 course_name_taken; when the clashing Course is archived the answer names it, so the
// editor can offer to unarchive it.
func (a *api) nameTaken(w http.ResponseWriter, r *http.Request, name string) {
	key := course.NameKey(name)
	all, err := a.st.List(r.Context(), true)
	if err != nil {
		httpx.WriteAPIError(w, err)
		return
	}
	for _, l := range all {
		if l.Archived && course.NameKey(l.Name) == key {
			writeRefusal(w, http.StatusConflict, refusal{Code: "course_name_taken", ArchivedCourseID: l.ID,
				Message: "A Course with that name is archived: unarchive it to use the name"})
			return
		}
	}
	writeRefusal(w, http.StatusConflict, refusal{Code: "course_name_taken", Message: "Another Course already has that name"})
}

// idParam reads the {id} path segment; a non-numeric id is not a Course.
func idParam(r *http.Request) (int64, bool) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	return id, err == nil
}

// nonNilNames is names, or an empty list for none: the JSON of a bought list is [] and never null.
func nonNilNames(names []string) []string {
	if names == nil {
		return []string{}
	}
	return names
}
