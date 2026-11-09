package planner

// Plan fills the empty slots of the horizon (§7.2). Existing Pinned, Cooked and
// skipped meals are never touched. Unpinned Planned meals are kept when still
// valid (Recipe not archived, nobody attending has an Exclusion on it, enough
// Batches for the attendance, and a Leftover source that still covers it) and
// otherwise replanned.
func Plan(in Input) (Result, error) { panic("TODO") }

// Regenerate redoes every unpinned, uncooked Planned Meal: Planned meals are
// treated as empty slots. Use a new Seed for a different plan.
func Regenerate(in Input) (Result, error) { panic("TODO") }

// Swap returns the top 3 alternatives for the slot under the same scoring,
// excluding the slot's current Recipe. Slot Rules are ignored (the User is
// overriding them); all other filters apply; Leftovers are not offered. The
// slot's current meal is dropped from the walk; other existing meals stay as
// they are. Input is not modified. Errors: ErrUnknownSlot, ErrSlotNotSwappable.
func Swap(in Input, key SlotKey) ([]Placement, error) { panic("TODO") }

// WeightsFor maps a Planner Style position to weights: 0 = "Use what we
// have", 0.5 = Variety (the spec's default weights), 1 = "Favourites",
// piecewise linear in between. Out-of-range positions clamp; NaN means 0.5.
func WeightsFor(style float64) Weights { panic("TODO") }

// JitterFor is the seeded jitter in [-amplitude, +amplitude] for one candidate
// in one slot. It is a pure function of its arguments (no math/rand state).
func JitterFor(seed int64, key SlotKey, recipe RecipeID, amplitude float64) float64 {
	panic("TODO")
}

// PortionsNeeded is the sum of the Portion Factors of the attendance.
func PortionsNeeded(att []Attendee) float64 { panic("TODO") }

// BatchesFor is ceil(portions / yield), tolerant of float error
// (0.9 / 0.3 is 3 batches, not 4). Yield must be > 0.
func BatchesFor(portions, yield float64) int { panic("TODO") }
