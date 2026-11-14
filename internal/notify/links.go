package notify

import (
	"fmt"
	"net/url"

	"github.com/fabbarix/feeder-ng/internal/cook"
)

// Where each notification lands (TB-14, decision TB 8). Every URL is app-relative; the service worker opens it.

// boardURL is where a Timer finished without a Cook Mode leads: the kitchen board shows every running timer.
const boardURL = "/board"

// advanceStepURL opens Today on the Advance Step: "/?step=<cook scope>:<Step index>", the key of PUT /api/cook/marks.
func advanceStepURL(date string, mealSlotID, courseID, step int64) string {
	scope := cook.MealScope(date, mealSlotID, courseID)
	return "/?" + url.Values{"step": {fmt.Sprintf("%s:%d", scope, step)}}.Encode()
}

// startCookingURL opens the slot's Cook Mode, all its Courses.
func startCookingURL(date string, mealSlotID int64) string {
	return fmt.Sprintf("/cook/meal/%s/%d", url.PathEscape(date), mealSlotID)
}

// confirmCookedURL opens the Plan with the slot's Mark Cooked: "/plan?mark=<date>:<Meal Slot id>".
func confirmCookedURL(date string, mealSlotID int64) string {
	return "/plan?" + url.Values{"mark": {fmt.Sprintf("%s:%d", date, mealSlotID)}}.Encode()
}

// leftoverURL opens Today on the Leftover.
func leftoverURL(id int64) string {
	return "/?" + url.Values{"leftover": {fmt.Sprint(id)}}.Encode()
}

// stockSpoilURL opens the Pantry on Use soon, at the Stock Lot.
func stockSpoilURL(lotID int64) string {
	return "/pantry?" + url.Values{"status": {"useSoon"}, "lot": {fmt.Sprint(lotID)}}.Encode()
}

// timerURL opens the Cook Mode of the timer's scope: one Course of a Planned Meal, or a Recipe. A free timer, or a scope
// that does not parse, lands on the board.
func timerURL(scope string) string {
	if scope == "" {
		return boardURL
	}
	p, err := cook.ParseScope(scope)
	switch {
	case err != nil:
		return boardURL
	case p.IsMeal:
		return fmt.Sprintf("/cook/meal/%s/%d/%d", url.PathEscape(p.Date), p.MealSlotID, p.CourseID)
	case p.RecipeID > 0:
		return fmt.Sprintf("/cook/recipe/%d", p.RecipeID)
	}
	return boardURL
}
