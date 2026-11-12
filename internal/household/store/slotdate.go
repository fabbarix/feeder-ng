package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// A Meal Slot on one date (table meal_slot_dates, migration 1500; ADR 0014; docs/dev/design/b5-sd.md).

// SlotDate returns the per-date row of the Meal Slot, or the default row (SlotID and Date set, nothing else) when
// there is none. household.ErrNotFound for an unknown Meal Slot.
func (s *Store) SlotDate(ctx context.Context, slotID int64, date string) (household.SlotDate, error) {
	if err := slotExists(ctx, s.db, slotID); err != nil {
		return household.SlotDate{}, err
	}
	return readSlotDate(ctx, s.db, slotID, date)
}

// SaveSlotDate stores the row (updated_at = now). A row that IsDefault is deleted instead (idempotent).
// household.ErrNotFound for an unknown Meal Slot.
func (s *Store) SaveSlotDate(ctx context.Context, row household.SlotDate) error {
	if err := household.ValidateGuests(row.Guests); err != nil {
		return err
	}
	if err := household.ValidateSlotTime(row.Time); err != nil {
		return err
	}
	return s.inTx(ctx, func(tx *sql.Tx) error {
		if err := slotExists(ctx, tx, row.SlotID); err != nil {
			return err
		}
		return writeSlotDate(ctx, tx, row, s.clk.Now())
	})
}

// SaveWhoIsEating saves "Who's eating" for the date in one transaction: the date's Members (SetDateAttendance) when
// in.Members is set, and the Guests when in.Guests is set. When in.Members is set and EmptiesDate(*in.Members, the
// date's Guests after this save) is true, the date is also saved Not served (U1). A save that leaves Members as they
// are never changes Not served. Course opt-outs are written separately (SetDateCourseOptOuts).
func (s *Store) SaveWhoIsEating(ctx context.Context, slotID int64, date string, in household.WhoIsEating) error {
	if in.Guests != nil {
		if err := household.ValidateGuests(*in.Guests); err != nil {
			return err
		}
	}
	if in.Members != nil {
		if err := household.ValidateAttendees(*in.Members); err != nil {
			return err
		}
	}
	return s.inTx(ctx, func(tx *sql.Tx) error {
		if err := slotExists(ctx, tx, slotID); err != nil {
			return err
		}
		row, err := readSlotDate(ctx, tx, slotID, date)
		if err != nil {
			return err
		}
		if in.Guests != nil {
			row.Guests = *in.Guests
		}
		if in.Members != nil {
			if err := setDateAttendance(ctx, tx, slotID, date, *in.Members); err != nil {
				return err
			}
			if household.EmptiesDate(*in.Members, row.Guests) {
				row.NotServed = true
			}
		}
		return writeSlotDate(ctx, tx, row, s.clk.Now())
	})
}

// ServeAgain clears Not served for the date ("Plan Dinner again"). When the date's own Attendance is an empty
// override and the date has no Guest (an emptied date), the override is removed too, so the usual Attendance applies
// again; otherwise the date's Members and Guests are left as they are.
func (s *Store) ServeAgain(ctx context.Context, slotID int64, date string) error {
	return s.inTx(ctx, func(tx *sql.Tx) error {
		if err := slotExists(ctx, tx, slotID); err != nil {
			return err
		}
		row, err := readSlotDate(ctx, tx, slotID, date)
		if err != nil {
			return err
		}
		var members int
		err = tx.QueryRowContext(ctx, `SELECT count(*) FROM attendance_override_attendees WHERE slot_id = ? AND date = ?`,
			slotID, date).Scan(&members)
		if err != nil {
			return err
		}
		var hasOverride int
		err = tx.QueryRowContext(ctx, `SELECT count(*) FROM attendance_overrides WHERE slot_id = ? AND date = ?`,
			slotID, date).Scan(&hasOverride)
		if err != nil {
			return err
		}
		if hasOverride == 1 && members == 0 && row.Guests == 0 {
			if err := clearDateCourses(ctx, tx, slotID, date); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM attendance_overrides WHERE slot_id = ? AND date = ?`,
				slotID, date); err != nil {
				return err
			}
		}
		row.NotServed = false
		return writeSlotDate(ctx, tx, row, s.clk.Now())
	})
}

// slotExists is household.ErrNotFound for an unknown Meal Slot.
func slotExists(ctx context.Context, q querier, slotID int64) error {
	var one int
	err := q.QueryRowContext(ctx, `SELECT 1 FROM meal_slots WHERE id = ?`, slotID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return household.ErrNotFound
	}
	return err
}

// readSlotDate returns the stored row, or the default row when none is stored.
func readSlotDate(ctx context.Context, q querier, slotID int64, date string) (household.SlotDate, error) {
	row := household.SlotDate{SlotID: slotID, Date: date}
	var (
		notServed int
		tm        sql.NullString
	)
	err := q.QueryRowContext(ctx, `SELECT not_served, time, guests FROM meal_slot_dates WHERE slot_id = ? AND date = ?`,
		slotID, date).Scan(&notServed, &tm, &row.Guests)
	if errors.Is(err, sql.ErrNoRows) {
		return row, nil
	}
	if err != nil {
		return household.SlotDate{}, err
	}
	row.NotServed = notServed == 1
	row.Time = tm.String
	return row, nil
}

// writeSlotDate stores the row, or deletes it when it is back to the default (the repository keeps no empty rows).
func writeSlotDate(ctx context.Context, q querier, row household.SlotDate, now time.Time) error {
	if row.IsDefault() {
		_, err := q.ExecContext(ctx, `DELETE FROM meal_slot_dates WHERE slot_id = ? AND date = ?`, row.SlotID, row.Date)
		return err
	}
	var tm any
	if row.Time != "" {
		tm = row.Time
	}
	notServed := 0
	if row.NotServed {
		notServed = 1
	}
	_, err := q.ExecContext(ctx, `INSERT INTO meal_slot_dates (slot_id, date, not_served, time, guests, updated_at)
		VALUES (?, ?, ?, ?, ?, ?)
		ON CONFLICT (slot_id, date) DO UPDATE SET not_served = excluded.not_served, time = excluded.time,
			guests = excluded.guests, updated_at = excluded.updated_at`,
		row.SlotID, row.Date, notServed, tm, row.Guests, now.UTC().Format(time.RFC3339))
	return err
}

// UnresolvedMealsOn lists the slot's unresolved Planned Meals on the date in the slot's Course order: what marking the
// date Not served would remove. household.ErrNotFound for an unknown Meal Slot.
func (s *Store) UnresolvedMealsOn(ctx context.Context, slotID int64, date string) ([]household.UnresolvedMeal, error) {
	if err := slotExists(ctx, s.db, slotID); err != nil {
		return nil, err
	}
	rows, err := s.db.QueryContext(ctx, `SELECT pm.course_id, c.name, r.name, pm.pinned
		FROM planned_meals pm
		JOIN courses c ON c.id = pm.course_id
		JOIN recipes r ON r.id = pm.recipe_id
		LEFT JOIN meal_slot_courses msc ON msc.meal_slot_id = pm.meal_slot_id AND msc.course_id = pm.course_id
		WHERE pm.meal_slot_id = ? AND pm.date = ? AND pm.state = 'planned'
		ORDER BY COALESCE(msc.position, 1000000), pm.id`, slotID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []household.UnresolvedMeal{}
	for rows.Next() {
		var (
			m      household.UnresolvedMeal
			pinned int
		)
		if err := rows.Scan(&m.CourseID, &m.CourseName, &m.RecipeName, &pinned); err != nil {
			return nil, err
		}
		m.Pinned = pinned == 1
		out = append(out, m)
	}
	return out, rows.Err()
}

// SlotStarted says whether a Course of the slot is already Cooked or Not cooked on the date (U2).
func (s *Store) SlotStarted(ctx context.Context, slotID int64, date string) (bool, error) {
	if err := slotExists(ctx, s.db, slotID); err != nil {
		return false, err
	}
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM planned_meals
		WHERE meal_slot_id = ? AND date = ? AND state IN ('cooked', 'skipped')`, slotID, date).Scan(&n)
	return n > 0, err
}
