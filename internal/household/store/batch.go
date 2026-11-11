package store

import (
	"context"
	"database/sql"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// UpdateSlotsBatch applies a batch edit in one transaction: all matching Meal Slots or none.
// Date Attendance overrides are untouched.
func (s *Store) UpdateSlotsBatch(ctx context.Context, in household.BatchInput) (household.BatchResult, error) {
	var res household.BatchResult
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		all, err := slotsIn(ctx, tx)
		if err != nil {
			return err
		}
		matched, skipped := household.MatchSlots(all, in.Match, in.Weekdays)
		if len(matched) == 0 {
			return household.ErrNoMatchingSlot
		}
		c := in.Change
		for i := range matched {
			m := &matched[i]
			if c.Name != nil {
				m.Name = *c.Name
			}
			if c.Time != nil {
				m.Time = *c.Time
			}
			if _, err := tx.ExecContext(ctx, `UPDATE meal_slots SET name = ?, time = ? WHERE id = ?`, m.Name, m.Time, m.ID); err != nil {
				return mapSlotError(err)
			}
			if c.Attendance != nil {
				if _, err := tx.ExecContext(ctx, `DELETE FROM meal_slot_attendees WHERE slot_id = ?`, m.ID); err != nil {
					return err
				}
				if err := insertAttendees(ctx, tx, m.ID, *c.Attendance); err != nil {
					return err
				}
				m.Attendance = *c.Attendance
			}
		}
		res = household.BatchResult{Updated: matched, Skipped: skipped}
		return nil
	})
	if err != nil {
		return household.BatchResult{}, err
	}
	return res, nil
}

// slotsIn lists Meal Slots with their usual Attendance inside a transaction.
func slotsIn(ctx context.Context, q querier) ([]household.MealSlot, error) {
	rows, err := q.QueryContext(ctx, `SELECT id, weekday, name, time FROM meal_slots ORDER BY weekday, time, name`)
	if err != nil {
		return nil, err
	}
	var out []household.MealSlot
	for rows.Next() {
		var m household.MealSlot
		if err := rows.Scan(&m.ID, &m.Weekday, &m.Name, &m.Time); err != nil {
			rows.Close()
			return nil, err
		}
		out = append(out, m)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	for i := range out {
		if out[i].Attendance, err = usualAttendance(ctx, q, out[i].ID); err != nil {
			return nil, err
		}
	}
	return out, nil
}
