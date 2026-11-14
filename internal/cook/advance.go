package cook

import "time"

// AdvanceCandidate is one Advance Step of one Planned Meal that is not cooked yet.
type AdvanceCandidate struct {
	Scope           Scope
	MealDate        string
	MealSlotID      int64
	SlotName        string
	CourseID        int64 // the Course the Planned Meal fills (real id)
	CourseName      string
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
func NextAdvance(cands []AdvanceCandidate, now time.Time) *AdvanceDue {
	var best *AdvanceDue
	for _, c := range cands {
		if c.Done {
			continue
		}
		due := c.MealAt.Add(-time.Duration(c.LeadTimeMinutes) * time.Minute)
		d := &AdvanceDue{AdvanceCandidate: c, DueAt: due, Overdue: due.Before(now)}
		if best == nil || earlier(d, best) {
			best = d
		}
	}
	return best
}

// earlier orders by due time, then meal time, then Step index.
func earlier(a, b *AdvanceDue) bool {
	if !a.DueAt.Equal(b.DueAt) {
		return a.DueAt.Before(b.DueAt)
	}
	if !a.MealAt.Equal(b.MealAt) {
		return a.MealAt.Before(b.MealAt)
	}
	return a.Step < b.Step
}

// AdvanceDueWithin lists the not-done candidates due within window of now whose meal is not served yet, in
// NextAdvance order (TB-02, B9-12). A candidate is in when DueAt <= now+window and MealAt > now; an overdue Step
// of a meal that is still ahead is in, first. NextAdvance is its first element.
func AdvanceDueWithin(cands []AdvanceCandidate, now time.Time, window time.Duration) []AdvanceDue {
	return nil
}
