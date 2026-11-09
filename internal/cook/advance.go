package cook

import "time"

// AdvanceCandidate is one Advance Step of one Planned Meal that is not cooked yet.
type AdvanceCandidate struct {
	Scope           Scope
	MealDate        string
	MealSlotID      int64
	SlotName        string
	RecipeName      string
	MealAt          time.Time // when the meal is served
	Step            int
	Text            string
	LeadTimeMinutes int
	Done            bool
}

// AdvanceDue is the next Advance Step to do.
type AdvanceDue struct {
	AdvanceCandidate
	DueAt   time.Time // MealAt minus the lead time
	Overdue bool      // DueAt before now
}

// NextAdvance returns the not-done candidate with the earliest DueAt (overdue
// ones therefore first); ties go to the earlier meal, then the lower Step
// index. Nil when nothing is left to do.
func NextAdvance(cands []AdvanceCandidate, now time.Time) *AdvanceDue { panic("TODO") }
