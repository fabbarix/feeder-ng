// Package store is the SQLite repository for the household package's types.
package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/household"
)

// Store reads and writes the household tables (migration 0100_household.sql).
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store over an open, migrated database.
func New(d *sql.DB, clk clock.Clock) *Store { return &Store{db: d, clk: clk} }

// querier is satisfied by *sql.DB and *sql.Tx.
type querier interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// Settings returns the single settings row (DefaultSettings("UTC") with
// TimeZoneConfigured=false until first saved).
func (s *Store) Settings(ctx context.Context) (household.Settings, error) {
	var (
		v                    household.Settings
		configured           int
		city                 sql.NullString
		lat, lon             sql.NullFloat64
		quietStart, quietEnd string
	)
	err := s.db.QueryRowContext(ctx, `SELECT time_zone, time_zone_configured, planning_horizon_days,
			default_cooldown_days, default_leftover_use_by_days, quiet_hours_start, quiet_hours_end,
			planner_style, location_city, location_latitude, location_longitude, currency
		FROM household_settings WHERE id = 1`).Scan(
		&v.TimeZone, &configured, &v.PlanningHorizonDays, &v.DefaultCooldownDays, &v.DefaultLeftoverUseByDays,
		&quietStart, &quietEnd, &v.PlannerStyle, &city, &lat, &lon, &v.Currency)
	if err != nil {
		return household.Settings{}, err
	}
	v.TimeZoneConfigured = configured == 1
	v.QuietHours = household.QuietHours{Start: quietStart, End: quietEnd}
	switch {
	case city.Valid:
		v.Location = &household.Location{City: city.String}
	case lat.Valid && lon.Valid:
		la, lo := lat.Float64, lon.Float64
		v.Location = &household.Location{Latitude: &la, Longitude: &lo}
	}
	return v, nil
}

// SaveSettings stores every field as given, including TimeZoneConfigured.
func (s *Store) SaveSettings(ctx context.Context, v household.Settings) error {
	var city sql.NullString
	var lat, lon sql.NullFloat64
	if loc := v.Location; loc != nil {
		if loc.City != "" {
			city = sql.NullString{String: loc.City, Valid: true}
		} else if loc.Latitude != nil && loc.Longitude != nil {
			lat = sql.NullFloat64{Float64: *loc.Latitude, Valid: true}
			lon = sql.NullFloat64{Float64: *loc.Longitude, Valid: true}
		}
	}
	_, err := s.db.ExecContext(ctx, `UPDATE household_settings SET time_zone = ?, time_zone_configured = ?,
			planning_horizon_days = ?, default_cooldown_days = ?, default_leftover_use_by_days = ?,
			quiet_hours_start = ?, quiet_hours_end = ?, planner_style = ?,
			location_city = ?, location_latitude = ?, location_longitude = ?, currency = ?
		WHERE id = 1`,
		v.TimeZone, v.TimeZoneConfigured, v.PlanningHorizonDays, v.DefaultCooldownDays, v.DefaultLeftoverUseByDays,
		v.QuietHours.Start, v.QuietHours.End, v.PlannerStyle, city, lat, lon, v.Currency)
	return err
}

// Members lists Members ordered by id.
func (s *Store) Members(ctx context.Context) ([]household.Member, error) {
	return queryMembers(ctx, s.db)
}

// Member returns one Member. household.ErrNotFound if absent.
func (s *Store) Member(ctx context.Context, id int64) (household.Member, error) {
	return getMember(ctx, s.db, id)
}

// CreateMember adds a Member with no User link.
func (s *Store) CreateMember(ctx context.Context, in household.MemberInput) (household.Member, error) {
	now := s.clk.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	res, err := s.db.ExecContext(ctx, `INSERT INTO members (name, colour, avatar, portion_factor, created_at)
		VALUES (?, ?, ?, ?, ?)`, in.Name, in.Colour, in.Avatar, in.PortionFactor, now)
	if err != nil {
		return household.Member{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return household.Member{}, err
	}
	return s.Member(ctx, id)
}

// UpdateMember changes name, colour, avatar and Portion Factor, keeping the User link.
func (s *Store) UpdateMember(ctx context.Context, id int64, in household.MemberInput) (household.Member, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE members SET name = ?, colour = ?, avatar = ?, portion_factor = ?
		WHERE id = ?`, in.Name, in.Colour, in.Avatar, in.PortionFactor, id)
	if err != nil {
		return household.Member{}, err
	}
	if err := requireOne(res); err != nil {
		return household.Member{}, err
	}
	return s.Member(ctx, id)
}

// DeleteMember removes the Member and their place in every Attendance.
func (s *Store) DeleteMember(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM members WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return requireOne(res)
}

// LinkUser links the Member to a User, or unlinks with nil. household.ErrUserLinked when
// that User is already linked to another Member; ErrNotFound for an unknown Member or User.
func (s *Store) LinkUser(ctx context.Context, memberID int64, userID *int64) (household.Member, error) {
	if _, err := s.Member(ctx, memberID); err != nil {
		return household.Member{}, err
	}
	if userID == nil {
		if _, err := s.db.ExecContext(ctx, `UPDATE members SET user_id = NULL WHERE id = ?`, memberID); err != nil {
			return household.Member{}, err
		}
		return s.Member(ctx, memberID)
	}
	var one int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM users WHERE id = ?`, *userID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return household.Member{}, household.ErrNotFound
	}
	if err != nil {
		return household.Member{}, err
	}
	var other int64
	err = s.db.QueryRowContext(ctx, `SELECT id FROM members WHERE user_id = ? AND id <> ?`, *userID, memberID).Scan(&other)
	if err == nil {
		return household.Member{}, household.ErrUserLinked
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return household.Member{}, err
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE members SET user_id = ? WHERE id = ?`, *userID, memberID); err != nil {
		if isUnique(err) {
			return household.Member{}, household.ErrUserLinked
		}
		return household.Member{}, err
	}
	return s.Member(ctx, memberID)
}

// Slots lists Meal Slots ordered by weekday, time, name, each with its usual Attendance.
func (s *Store) Slots(ctx context.Context) ([]household.MealSlot, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, weekday, name, time FROM meal_slots
		ORDER BY weekday, time, name`)
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
		if out[i].Attendance, err = usualAttendance(ctx, s.db, out[i].ID); err != nil {
			return nil, err
		}
	}
	return out, nil
}

// Slot returns one Meal Slot with its usual Attendance. ErrNotFound if absent.
func (s *Store) Slot(ctx context.Context, id int64) (household.MealSlot, error) {
	var m household.MealSlot
	err := s.db.QueryRowContext(ctx, `SELECT id, weekday, name, time FROM meal_slots WHERE id = ?`, id).
		Scan(&m.ID, &m.Weekday, &m.Name, &m.Time)
	if errors.Is(err, sql.ErrNoRows) {
		return household.MealSlot{}, household.ErrNotFound
	}
	if err != nil {
		return household.MealSlot{}, err
	}
	m.Attendance, err = usualAttendance(ctx, s.db, id)
	return m, err
}

// CreateSlot: ErrDuplicateSlot (same weekday, name case-insensitively), ErrUnknownMember.
func (s *Store) CreateSlot(ctx context.Context, in household.MealSlotInput) (household.MealSlot, error) {
	var id int64
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `INSERT INTO meal_slots (weekday, name, time) VALUES (?, ?, ?)`,
			in.Weekday, in.Name, in.Time)
		if err != nil {
			return mapSlotError(err)
		}
		if id, err = res.LastInsertId(); err != nil {
			return err
		}
		return insertAttendees(ctx, tx, id, in.Attendance)
	})
	if err != nil {
		return household.MealSlot{}, err
	}
	return s.Slot(ctx, id)
}

// UpdateSlot replaces weekday, name, time and the usual Attendance. Date overrides are kept.
func (s *Store) UpdateSlot(ctx context.Context, id int64, in household.MealSlotInput) (household.MealSlot, error) {
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE meal_slots SET weekday = ?, name = ?, time = ? WHERE id = ?`,
			in.Weekday, in.Name, in.Time, id)
		if err != nil {
			return mapSlotError(err)
		}
		if err := requireOne(res); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM meal_slot_attendees WHERE slot_id = ?`, id); err != nil {
			return err
		}
		return insertAttendees(ctx, tx, id, in.Attendance)
	})
	if err != nil {
		return household.MealSlot{}, err
	}
	return s.Slot(ctx, id)
}

// DeleteSlot removes the Meal Slot with its Attendance and date overrides.
func (s *Store) DeleteSlot(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM meal_slots WHERE id = ?`, id)
	if err != nil {
		return err
	}
	return requireOne(res)
}

// DateAttendance returns the override for date when one exists (isOverride true,
// possibly empty), otherwise the usual Attendance. ErrNotFound for an unknown slot.
func (s *Store) DateAttendance(ctx context.Context, slotID int64, date string) (att []household.Attendee, isOverride bool, err error) {
	if _, err := s.Slot(ctx, slotID); err != nil {
		return nil, false, err
	}
	var one int
	err = s.db.QueryRowContext(ctx, `SELECT 1 FROM attendance_overrides WHERE slot_id = ? AND date = ?`,
		slotID, date).Scan(&one)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		att, err = usualAttendance(ctx, s.db, slotID)
		return att, false, err
	case err != nil:
		return nil, false, err
	}
	att, err = overrideAttendance(ctx, s.db, slotID, date)
	return att, true, err
}

// SetDateAttendance stores the override for date, replacing any earlier one.
func (s *Store) SetDateAttendance(ctx context.Context, slotID int64, date string, att []household.Attendee) error {
	if _, err := s.Slot(ctx, slotID); err != nil {
		return err
	}
	return s.inTx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO attendance_overrides (slot_id, date) VALUES (?, ?)`,
			slotID, date); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM attendance_override_attendees WHERE slot_id = ? AND date = ?`,
			slotID, date); err != nil {
			return err
		}
		for _, a := range att {
			if err := checkMember(ctx, tx, a.MemberID); err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO attendance_override_attendees
				(slot_id, date, member_id, portion_factor_override) VALUES (?, ?, ?, ?)`,
				slotID, date, a.MemberID, nullFloat(a.PortionFactorOverride)); err != nil {
				if isUnique(err) {
					return household.ErrDuplicateAttendee
				}
				return err
			}
		}
		return nil
	})
}

// ClearDateAttendance removes the override for date (idempotent).
func (s *Store) ClearDateAttendance(ctx context.Context, slotID int64, date string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM attendance_overrides WHERE slot_id = ? AND date = ?`, slotID, date)
	return err
}

// Preferences returns the User's preferences, or DefaultPreferences when none are saved.
func (s *Store) Preferences(ctx context.Context, userID int64) (household.Preferences, error) {
	var (
		p         = household.DefaultPreferences()
		secondary sql.NullString
	)
	err := s.db.QueryRowContext(ctx, `SELECT scheme, accent, secondary, units FROM user_preferences WHERE user_id = ?`,
		userID).Scan(&p.Scheme, &p.Accent, &secondary, &p.Units)
	if errors.Is(err, sql.ErrNoRows) {
		return household.DefaultPreferences(), nil
	}
	if err != nil {
		return household.Preferences{}, err
	}
	if secondary.Valid {
		v := secondary.String
		p.Secondary = &v
	}
	return p, nil
}

// SavePreferences stores the User's preferences, replacing any earlier ones.
func (s *Store) SavePreferences(ctx context.Context, userID int64, p household.Preferences) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO user_preferences (user_id, scheme, accent, secondary, units)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT (user_id) DO UPDATE SET scheme = excluded.scheme, accent = excluded.accent,
			secondary = excluded.secondary, units = excluded.units`,
		userID, p.Scheme, p.Accent, nullString(p.Secondary), p.Units)
	return err
}

// inTx runs fn in a transaction, committing when it returns nil.
func (s *Store) inTx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
}

func queryMembers(ctx context.Context, q querier) ([]household.Member, error) {
	rows, err := q.QueryContext(ctx, `SELECT id, name, colour, avatar, portion_factor, user_id FROM members ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []household.Member{}
	for rows.Next() {
		m, err := scanMember(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func getMember(ctx context.Context, q querier, id int64) (household.Member, error) {
	m, err := scanMember(q.QueryRowContext(ctx,
		`SELECT id, name, colour, avatar, portion_factor, user_id FROM members WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return household.Member{}, household.ErrNotFound
	}
	return m, err
}

type scanner interface{ Scan(dest ...any) error }

func scanMember(r scanner) (household.Member, error) {
	var (
		m    household.Member
		user sql.NullInt64
	)
	if err := r.Scan(&m.ID, &m.Name, &m.Colour, &m.Avatar, &m.PortionFactor, &user); err != nil {
		return household.Member{}, err
	}
	if user.Valid {
		u := user.Int64
		m.UserID = &u
	}
	return m, nil
}

// usualAttendance lists the slot's usual Attendance, ordered by Member.
func usualAttendance(ctx context.Context, q querier, slotID int64) ([]household.Attendee, error) {
	rows, err := q.QueryContext(ctx, `SELECT member_id, portion_factor_override FROM meal_slot_attendees
		WHERE slot_id = ? ORDER BY member_id`, slotID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAttendees(rows)
}

// overrideAttendance lists the attendance recorded for one date.
func overrideAttendance(ctx context.Context, q querier, slotID int64, date string) ([]household.Attendee, error) {
	rows, err := q.QueryContext(ctx, `SELECT member_id, portion_factor_override FROM attendance_override_attendees
		WHERE slot_id = ? AND date = ? ORDER BY member_id`, slotID, date)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanAttendees(rows)
}

func scanAttendees(rows *sql.Rows) ([]household.Attendee, error) {
	out := []household.Attendee{}
	for rows.Next() {
		var (
			a   household.Attendee
			pfo sql.NullFloat64
		)
		if err := rows.Scan(&a.MemberID, &pfo); err != nil {
			return nil, err
		}
		if pfo.Valid {
			v := pfo.Float64
			a.PortionFactorOverride = &v
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

// insertAttendees writes a usual Attendance for slotID, checking every Member exists.
func insertAttendees(ctx context.Context, tx *sql.Tx, slotID int64, att []household.Attendee) error {
	for _, a := range att {
		if err := checkMember(ctx, tx, a.MemberID); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO meal_slot_attendees (slot_id, member_id, portion_factor_override)
			VALUES (?, ?, ?)`, slotID, a.MemberID, nullFloat(a.PortionFactorOverride)); err != nil {
			if isUnique(err) {
				return household.ErrDuplicateAttendee
			}
			return err
		}
	}
	return nil
}

func checkMember(ctx context.Context, q querier, id int64) error {
	var one int
	err := q.QueryRowContext(ctx, `SELECT 1 FROM members WHERE id = ?`, id).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return household.ErrUnknownMember
	}
	return err
}

// mapSlotError turns a unique-name clash into ErrDuplicateSlot.
func mapSlotError(err error) error {
	if isUnique(err) {
		return household.ErrDuplicateSlot
	}
	return err
}

func isUnique(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}

func requireOne(res sql.Result) error {
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return household.ErrNotFound
	}
	return nil
}

func nullFloat(f *float64) sql.NullFloat64 {
	if f == nil {
		return sql.NullFloat64{}
	}
	return sql.NullFloat64{Float64: *f, Valid: true}
}

func nullString(s *string) sql.NullString {
	if s == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: *s, Valid: true}
}
