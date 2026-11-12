package store

import (
	"context"
)

// LastCooked returns, for every Recipe with at least one Cooked fresh Planned Meal (any Course; a meal served from a
// Leftover is not fresh), the latest date of those meals as YYYY-MM-DD. The Planned Meal's date counts, not the day it
// was marked. A Recipe never cooked is absent. It is the plan side of the recipe list's "Last cooked" (beta.5 F7): the
// recipe package reads it through a port and never reads the planned_meals table itself.
func (s *Store) LastCooked(ctx context.Context) (map[int64]string, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT recipe_id, MAX(date) FROM planned_meals
		WHERE state = 'cooked' AND from_date IS NULL GROUP BY recipe_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]string{}
	for rows.Next() {
		var id int64
		var date string
		if err := rows.Scan(&id, &date); err != nil {
			return nil, err
		}
		out[id] = date
	}
	return out, rows.Err()
}
