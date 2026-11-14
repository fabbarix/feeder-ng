package household

import "time"

// B9-04 removals (SAFE-02, ADR 0021): what Remove Member and Remove Meal Slot report and keep. The reads and the
// writes are in store.

// RestoreWindowMinutes is how long after a removal Undo brings everything back: a Member's snapshot, and a Meal
// Slot's To confirm rows.
const RestoreWindowMinutes = 10

// SlotImpact is what removing one Meal Slot does (read-only, GET /api/meal-slots/{id}/impact).
type SlotImpact struct {
	PlannedMeals []RemovedMeal // unresolved (state planned) whose slot time is still ahead, Pinned included: they go
	SlotRules    []RemovedRule // the slot's Slot Rules: they stop applying (they are kept for Undo)
	ToConfirm    []RemovedMeal // unresolved whose slot time has passed (today's included): they go, and Undo within RestoreWindowMinutes brings them back
	CookedKept   int           // Cooked and Not cooked meals that stay in the history
}

// MemberImpact is what removing one Member does (read-only, GET /api/members/{id}/impact).
type MemberImpact struct {
	Preferences int    // Favourites, Dislikes and Exclusions (Recipes and Ingredients)
	MealSlots   int    // active Meal Slots the Member usually attends
	SignInEmail string // the Member's address when it is not on the Allowlist, so their sign-in ends; "" otherwise
}

// RemovedSlot is one row of the Removed Meal Slots read: the removed Meal Slots with the same name and the same
// removal instant, with the Cooked and Not cooked meals they kept.
type RemovedSlot struct {
	IDs       []int64
	Name      string
	Weekdays  []int // ascending
	Time      string
	RemovedAt string
	Cooked    int
	NotCooked int
}

// WeekdayName is the English name of an ISO weekday (1 Monday to 7 Sunday).
func WeekdayName(weekday int) string { return time.Weekday(weekday % 7).String() }

// SlotNameTakenMessage is what a refused Put back says (409 meal_slot_name_taken): "There is already a Dinner on Monday."
func SlotNameTakenMessage(name string, weekday int) string {
	return "There is already a " + name + " on " + WeekdayName(weekday) + "."
}
