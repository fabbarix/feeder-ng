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
//
// A save that takes the date from someone eating to nobody eating (no Member and no Guest) is refused with
// household.ErrSlotStarted when a Course of the slot is already Cooked or Not cooked (decision 3a, 3b). Nothing is written.
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
		current, _, err := dateAttendance(ctx, tx, slotID, date)
		if err != nil {
			return err
		}
		members := current
		if in.Members != nil {
			members = *in.Members
		}
		eatingBefore := len(current) > 0 || row.Guests > 0
		if in.Guests != nil {
			row.Guests = *in.Guests
		}
		if eatingBefore && household.EmptiesDate(members, row.Guests) {
			started, err := slotStarted(ctx, tx, slotID, date)
			if err != nil {
				return err
			}
			if started {
				return household.ErrSlotStarted
			}
		}
		if in.Members != nil {
			if err := setDateAttendance(ctx, tx, slotID, date, *in.Members); err != nil {
				return err
			}
			// An emptied date is Not served (U1); any other save serves it again, a Guest included (U3).
			row.NotServed = household.EmptiesDate(*in.Members, row.Guests)
		} else if in.Guests != nil && *in.Guests > 0 {
			row.NotServed = false // Guests eat: a Guests-only save serves the date again (PM, round 2)
		}
		return writeSlotDate(ctx, tx, row, s.clk.Now())
	})
}

// serveAgain clears Not served on row. An emptied date (an empty override and no Guest) also loses its override, so
// the usual Attendance applies again; its Course overrides go with it.
func serveAgain(ctx context.Context, tx *sql.Tx, slotID int64, date string, row *household.SlotDate) error {
	att, hasOverride, err := dateAttendance(ctx, tx, slotID, date)
	if err != nil {
		return err
	}
	if household.IsNotServed(household.SlotDate{Guests: row.Guests}, att, hasOverride) {
		if err := clearDateCourses(ctx, tx, slotID, date); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM attendance_overrides WHERE slot_id = ? AND date = ?`,
			slotID, date); err != nil {
			return err
		}
	}
	row.NotServed = false
	return nil
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
// date Not served would remove. effective is the slot's effective time on the date (the date's own, or the usual);
// a slot whose instant is already before now removes nothing, so the list is empty. household.ErrNotFound for an
// unknown Meal Slot.
func (s *Store) UnresolvedMealsOn(ctx context.Context, slotID int64, date, effective string, now time.Time) ([]household.UnresolvedMeal, error) {
	if err := slotExists(ctx, s.db, slotID); err != nil {
		return nil, err
	}
	out := []household.UnresolvedMeal{}
	settings, err := s.Settings(ctx)
	if err != nil {
		return nil, err
	}
	zone, lerr := time.LoadLocation(settings.TimeZone)
	if lerr != nil {
		zone = time.UTC
	}
	over, err := household.SlotOver(date, effective, zone, now)
	if err != nil || over {
		return out, err
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

// slotStarted says whether a Course of the slot is already Cooked or Not cooked on the date (U2).
func slotStarted(ctx context.Context, q querier, slotID int64, date string) (bool, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM planned_meals
		WHERE meal_slot_id = ? AND date = ? AND state IN ('cooked', 'skipped')`, slotID, date).Scan(&n)
	return n > 0, err
}

// PatchSlotDate applies a PATCH of the Meal Slot on the date in one transaction and returns the saved row: it reads the
// row, checks every field sent (time_invalid, date_past, slot_started), serves the date again when NotServed is false
// (an emptied date loses its override), applies only the fields sent, and saves. A refused patch writes nothing. With
// patch.DryRun the row as it would be saved is returned and nothing is written. household.ErrNotFound for an unknown
// Meal Slot; the refusals are *household.ValidationError.
func (s *Store) PatchSlotDate(ctx context.Context, slotID int64, date string, patch household.SlotDatePatch) (household.SlotDate, error) {
	var out household.SlotDate
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		if err := slotExists(ctx, tx, slotID); err != nil {
			return err
		}
		row, err := readSlotDate(ctx, tx, slotID, date)
		if err != nil {
			return err
		}
		// Every field is checked before the first write.
		if patch.Time != nil {
			if err := household.ValidateSlotTime(*patch.Time); err != nil {
				return err
			}
			if *patch.Time != row.Time && date < patch.Today {
				return &household.ValidationError{Field: "time", Message: "a past date keeps its time", Reason: "date_past"}
			}
		}
		if patch.NotServed != nil && *patch.NotServed {
			started, err := slotStarted(ctx, tx, slotID, date)
			if err != nil {
				return err
			}
			if err := household.ValidateNotServedChange(date, patch.Today, started); err != nil {
				return err
			}
		}
		if patch.Time != nil {
			row.Time = *patch.Time
		}
		if patch.DryRun {
			if patch.NotServed != nil {
				row.NotServed = *patch.NotServed
			}
			out = row
			return nil
		}
		if patch.NotServed != nil {
			if *patch.NotServed {
				row.NotServed = true
			} else if err := serveAgain(ctx, tx, slotID, date, &row); err != nil {
				return err
			}
		}
		if err := writeSlotDate(ctx, tx, row, s.clk.Now()); err != nil {
			return err
		}
		out = row
		return nil
	})
	return out, err
}
