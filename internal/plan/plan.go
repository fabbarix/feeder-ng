package plan

import (
	"time"

	"github.com/fabbarix/feeder-ng/internal/planner"
)

// Today is the household calendar date of now in zone.
func Today(now time.Time, zone *time.Location) string {
	return ""
}

// HorizonDates are the days dates starting at today (YYYY-MM-DD), so the Planning Horizon includes today.
func HorizonDates(today string, days int) []string {
	return nil
}

// SlotInstant is the instant of date plus hhmm in zone. ErrBadTime for a malformed time.
func SlotInstant(date, hhmm string, zone *time.Location) (time.Time, error) {
	return time.Time{}, errNotImplemented
}

// SeedFor derives the planner seed from the plan generation (Regenerate bumps the generation, so it reshuffles).
// It is deterministic, non-negative and differs for different generations.
func SeedFor(generation int64) int64 {
	return -1
}

// BuildInput maps a Snapshot to the planner's Input.
//
//   - Slots: one planner.Slot per SlotInfo, At = SlotInstant(date, time). A slot with no existing meal whose At is
//     before Now is dropped (the past cannot be planned); a slot with an existing meal is always kept.
//   - Existing: Planned unpinned -> MealPlanned, Planned pinned -> MealPinned, Cooked -> MealCooked, Skipped ->
//     MealSkipped, with Recipe, Batches and From (Source -> planner.LeftoverSource). Keys listed in Clear make an
//     unpinned Planned meal count as empty. A Planned meal whose slot is already over (At before Now) and has not
//     been confirmed is passed as MealPinned: it happened, only Cooked / Not cooked resolves it, and the planner must
//     neither replan nor drop it (it still counts for Stock, Leftovers and Cool-down). Clear does not apply to it.
//   - Rules: SlotRules of the slot's Meal Slot id.
//   - Attendance: Factor <= 0 attendees are dropped.
//   - Tags (recipes and rules) are normalised with recipe.TagKey; Variety Rules likewise.
//   - Leftovers: only Status available with Portions > 0 (the planner decides Use-by), FromSlot from Leftover.From.
//   - LastPlanned: the latest History date per Recipe.
//   - Config: planner.DefaultConfig() with the Household's Cool-down and Use-by days. Style, Seed, Now as given.
//
// ErrNoZone when Zone is nil, ErrBadTime for a malformed slot time.
func BuildInput(s Snapshot) (planner.Input, error) {
	return planner.Input{}, errNotImplemented
}

// Reconcile turns the planner's Result into row changes against the Snapshot it came from.
//
//   - Every Placement becomes an upsert: State planned, not Pinned, Batches, Portions, From (planner.LeftoverSource ->
//     Source), Why converted with WhyFrom.
//   - An existing unpinned Planned meal whose slot is not over yet and that is neither in Result.Kept nor re-placed (so it
//     was invalid or cleared and nothing replaced it) is deleted. Pinned, Cooked and Skipped meals, and unconfirmed meals
//     whose slot is already over, are never touched.
//   - Result.Unfilled become Unfilled rows; every other slot of the snapshot is in ClearUnfilled.
func Reconcile(s Snapshot, res planner.Result) Changes {
	return Changes{}
}

// WhyFrom converts a planner chip to the stored form (the Date is kept as is).
func WhyFrom(w planner.Why) Why {
	return Why{}
}

// WhyAll converts a placement's chips.
func WhyAll(ws []planner.Why) []Why {
	return nil
}

// EncodeWhy and DecodeWhy are the JSON stored in planned_meals.why_json ("[]" for none).
func EncodeWhy(ws []Why) (string, error) { return "", errNotImplemented }
func DecodeWhy(s string) ([]Why, error)  { return nil, errNotImplemented }

// Invalidate tells the Runner the plan may be stale (publishes on InvalidateTopic). Safe to call from any module.
func Invalidate(p Publisher, reason Reason) {}

// ReasonForEvent says whether an event on another module's topic invalidates the plan, and why:
//
//	"plan.invalidate" {"reason": r}                       -> r (unknown or empty reasons are ignored)
//	"recipes" (any event: a Recipe, or a Member's preferences) -> ReasonRecipeChanged
//	"household" {"changed": "attendance"|"mealSlots"|"members"|"settings"} -> ReasonAttendanceChanged
//	"stock" {"changed": "lots"}                           -> ReasonStockTake
//
// Everything else (stock waste, the "plan" topic itself, products, ...) is ignored.
func ReasonForEvent(topic string, data []byte) (Reason, bool) { return "", false }
