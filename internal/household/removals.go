package household

// B9-04 removals (ADR 0021): what Remove Member and Remove Meal Slot report and keep. STUB: the types are the test
// author's contract for the developer; the reads and rules are in store.

// RestoreWindowMinutes is how long after a removal Undo brings everything back: a Member's snapshot, and a Meal
// Slot's To confirm rows.
const RestoreWindowMinutes = 10

// SlotImpact is what removing one Meal Slot does (read-only, GET /api/meal-slots/{id}/impact).
type SlotImpact struct {
	PlannedMeals []RemovedMeal // unresolved (state planned) from today on, Pinned included: they go
	SlotRules    []RemovedRule // the slot's Slot Rules: they stop applying (they are kept for Undo)
	ToConfirm    []RemovedMeal // unresolved before today: they go, and Undo within RestoreWindowMinutes brings them back
	CookedKept   int           // Cooked and Not cooked meals that stay in the history
}

// MemberImpact is what removing one Member does (read-only, GET /api/members/{id}/impact).
type MemberImpact struct {
	Preferences int    // Favourites, Dislikes and Exclusions (Recipes and Ingredients)
	MealSlots   int    // active Meal Slots the Member usually attends
	SignInEmail string // the Member's sign-in address, "" when none: the sign-in ends
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
