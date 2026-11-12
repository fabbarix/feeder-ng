package store

import "context"

// LastCooked returns, for every Recipe with at least one Cooked fresh Planned Meal (any Course; a meal served from a
// Leftover is not fresh), the latest date of those meals as YYYY-MM-DD. The Planned Meal's date counts, not the day it
// was marked. A Recipe never cooked is absent. It is the plan side of the recipe list's "Last cooked" (beta.5 F7): the
// recipe package reads it through a port and never reads the planned_meals table itself.
//
// Stub: the test author's red phase. The developer implements it.
func (s *Store) LastCooked(ctx context.Context) (map[int64]string, error) {
	return map[int64]string{}, nil
}
