package httpapi

import (
	"net/http"

	"github.com/fabbarix/feeder-ng/internal/httpx"
	"github.com/fabbarix/feeder-ng/internal/plan"
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
	return memberRefOut{}, false // C-RX stub
}

// attendanceFor are the Members eating the Course: those of att with a Portion Factor above zero, in att's order.
// Members that are gone are left out.
func attendanceFor(att []plan.Attendee, t table) []memberRefOut {
	return nil // C-RX stub
}

// optOutsFor are the Members of ids as references, in id order, never nil.
func optOutsFor(ids []int64, t table) []memberRefOut {
	return nil // C-RX stub
}

// exclusionsFor resolves the stored detail of a cell's reason against the names at read time (crs-crx.md §3). It
// returns nil (JSON null) when no detail is stored, otherwise a non-nil list, empty when every record was dropped.
func exclusionsFor(u plan.Unfilled, t table) []exclusionOut {
	return nil // C-RX stub
}

// couldntExclusions answers GET /api/plan/couldnt-plan/exclusions.
func (a *api) couldntExclusions(w http.ResponseWriter, r *http.Request) {
	httpx.WriteError(w, http.StatusNotImplemented, "not_implemented", "Not implemented yet")
}
