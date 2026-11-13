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
	db     *sql.DB
	clk    clock.Clock
	images Images
}

// Images is the image file store as the Store needs it: a Delete that keeps any file some record still references
// (images.Guarded).
type Images interface {
	Delete(ctx context.Context, id string) error
}

// New returns a Store over an open, migrated database.
func New(d *sql.DB, clk clock.Clock) *Store { return &Store{db: d, clk: clk} }

// WithImages lets the Store remove the file of a Member photo that is no longer used (ReleasePhoto).
func (s *Store) WithImages(im Images) *Store {
	s.images = im
	return s
}

// ReleasePhoto deletes the file of a Member photo that nothing uses any more (best effort, call it after the change is
// saved). The file store decides "nothing uses": it checks every table, not only Members.
func (s *Store) ReleasePhoto(ctx context.Context, id string) {
	if id == "" || s.images == nil {
		return
	}
	_ = s.images.Delete(ctx, id)
}

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
			default_cooldown_days, default_leftover_use_by_days, frozen_use_by_days, quiet_hours_start, quiet_hours_end,
			planner_style, location_city, location_latitude, location_longitude, currency
		FROM household_settings WHERE id = 1`).Scan(
		&v.TimeZone, &configured, &v.PlanningHorizonDays, &v.DefaultCooldownDays, &v.DefaultLeftoverUseByDays, &v.FrozenUseByDays,
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
			planning_horizon_days = ?, default_cooldown_days = ?, default_leftover_use_by_days = ?, frozen_use_by_days = ?,
			quiet_hours_start = ?, quiet_hours_end = ?, planner_style = ?,
			location_city = ?, location_latitude = ?, location_longitude = ?, currency = ?
		WHERE id = 1`,
		v.TimeZone, v.TimeZoneConfigured, v.PlanningHorizonDays, v.DefaultCooldownDays, v.DefaultLeftoverUseByDays, v.FrozenUseByDays,
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

// CreateMember adds a Member with no User link. The new Member attends every existing Meal Slot
// (no Portion Factor override); date Attendance is never touched.
func (s *Store) CreateMember(ctx context.Context, in household.MemberInput) (household.Member, error) {
	now := s.clk.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
	var id int64
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `INSERT INTO members (name, colour, avatar, photo, portion_factor, email, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`, in.Name, in.Colour, in.Avatar, in.Photo, in.PortionFactor, nullEmail(in.Email), now)
		if err != nil {
			return err
		}
		if id, err = res.LastInsertId(); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO meal_slot_attendees (slot_id, member_id, portion_factor_override)
			SELECT id, ?, NULL FROM meal_slots`, id)
		return err
	})
	if isUnique(err) {
		return household.Member{}, household.ErrEmailTaken
	}
	if err != nil {
		return household.Member{}, err
	}
	return s.Member(ctx, id)
}

// UpdateMember changes name, colour, avatar, photo, Portion Factor and email, keeping the User link.
func (s *Store) UpdateMember(ctx context.Context, id int64, in household.MemberInput) (household.Member, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE members SET name = ?, colour = ?, avatar = ?, photo = ?, portion_factor = ?, email = ?
		WHERE id = ?`, in.Name, in.Colour, in.Avatar, in.Photo, in.PortionFactor, nullEmail(in.Email), id)
	if isUnique(err) {
		return household.Member{}, household.ErrEmailTaken
	}
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
		if out[i].Courses, err = loadSlotCourses(ctx, s.db, out[i].ID); err != nil {
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
	if m.Attendance, err = usualAttendance(ctx, s.db, id); err != nil {
		return household.MealSlot{}, err
	}
	m.Courses, err = loadSlotCourses(ctx, s.db, id)
	return m, err
}

// CreateSlot: ErrDuplicateSlot (same weekday, name case-insensitively), ErrUnknownMember. Courses nil: the
// main Course, required, nobody opting out.
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
		if in.Attendance == nil { // not given: everyone attends; an empty list means nobody
			if _, err := tx.ExecContext(ctx, `INSERT INTO meal_slot_attendees (slot_id, member_id, portion_factor_override)
				SELECT ?, id, NULL FROM members`, id); err != nil {
				return err
			}
		} else if err := insertAttendees(ctx, tx, id, in.Attendance); err != nil {
			return err
		}
		courses := in.Courses
		if courses == nil {
			mainID, err := mainCourseID(ctx, tx)
			if err != nil {
				return err
			}
			courses = []household.SlotCourseInput{{CourseID: mainID}}
		}
		return s.saveSlotCourses(ctx, tx, id, courses, nil, &household.Removals{})
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
		if err := insertAttendees(ctx, tx, id, in.Attendance); err != nil {
			return err
		}
		if in.Courses == nil { // not given: the stored Courses and their opt-outs stay
			return nil
		}
		return s.saveSlotCourses(ctx, tx, id, in.Courses, nil, &household.Removals{})
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
	return dateAttendance(ctx, s.db, slotID, date)
}

// dateAttendance is the date's Attendance inside a query or transaction: its override when it has one, else the usual.
func dateAttendance(ctx context.Context, q querier, slotID int64, date string) (att []household.Attendee, isOverride bool, err error) {
	var one int
	err = q.QueryRowContext(ctx, `SELECT 1 FROM attendance_overrides WHERE slot_id = ? AND date = ?`,
		slotID, date).Scan(&one)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		att, err = usualAttendance(ctx, q, slotID)
		return att, false, err
	case err != nil:
		return nil, false, err
	}
	att, err = overrideAttendance(ctx, q, slotID, date)
	return att, true, err
}

// SetDateAttendance stores the override for date, replacing any earlier one.
func (s *Store) SetDateAttendance(ctx context.Context, slotID int64, date string, att []household.Attendee) error {
	if _, err := s.Slot(ctx, slotID); err != nil {
		return err
	}
	return s.inTx(ctx, func(tx *sql.Tx) error {
		return setDateAttendance(ctx, tx, slotID, date, att)
	})
}

// setDateAttendance replaces the override for date inside tx (SetDateAttendance; Who's eating saves it with Guests).
func setDateAttendance(ctx context.Context, tx *sql.Tx, slotID int64, date string, att []household.Attendee) error {
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
}

// ClearDateAttendance removes the override for date (idempotent), and the date's Course opt-outs with it.
//
// It also drops the date's Guests (ADR 0014). Not served and the date's own time stay: they are not attendance.
//
// An emptied date (no Member and no Guest) is served again (decision 3f); a date marked Not served by hand keeps it.
func (s *Store) ClearDateAttendance(ctx context.Context, slotID int64, date string) error {
	return s.inTx(ctx, func(tx *sql.Tx) error {
		row, err := readSlotDate(ctx, tx, slotID, date)
		if err != nil {
			return err
		}
		att, hasOverride, err := dateAttendance(ctx, tx, slotID, date)
		if err != nil {
			return err
		}
		if household.IsNotServed(household.SlotDate{Guests: row.Guests}, att, hasOverride) {
			row.NotServed = false
		}
		if err := clearDateCourses(ctx, tx, slotID, date); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM attendance_overrides WHERE slot_id = ? AND date = ?`, slotID, date); err != nil {
			return err
		}
		row.Guests = 0
		return writeSlotDate(ctx, tx, row, s.clk.Now())
	})
}

// Preferences returns the User's preferences, or DefaultPreferences when none are saved.
func (s *Store) Preferences(ctx context.Context, userID int64) (household.Preferences, error) {
	p := household.DefaultPreferences()
	err := s.db.QueryRowContext(ctx, `SELECT scheme, accent, units FROM user_preferences WHERE user_id = ?`,
		userID).Scan(&p.Scheme, &p.Accent, &p.Units)
	if errors.Is(err, sql.ErrNoRows) {
		return household.DefaultPreferences(), nil
	}
	if err != nil {
		return household.Preferences{}, err
	}
	return p, nil
}

// SavePreferences stores the User's preferences, replacing any earlier ones.
func (s *Store) SavePreferences(ctx context.Context, userID int64, p household.Preferences) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO user_preferences (user_id, scheme, accent, units)
		VALUES (?, ?, ?, ?)
		ON CONFLICT (user_id) DO UPDATE SET scheme = excluded.scheme, accent = excluded.accent,
			units = excluded.units`,
		userID, p.Scheme, p.Accent, p.Units)
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
	rows, err := q.QueryContext(ctx, `SELECT id, name, colour, avatar, photo, portion_factor, user_id, email FROM members ORDER BY id`)
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
		`SELECT id, name, colour, avatar, photo, portion_factor, user_id, email FROM members WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return household.Member{}, household.ErrNotFound
	}
	return m, err
}

type scanner interface{ Scan(dest ...any) error }

func scanMember(r scanner) (household.Member, error) {
	var (
		m     household.Member
		user  sql.NullInt64
		email sql.NullString
	)
	if err := r.Scan(&m.ID, &m.Name, &m.Colour, &m.Avatar, &m.Photo, &m.PortionFactor, &user, &email); err != nil {
		return household.Member{}, err
	}
	m.Email = email.String
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

// Created is when the Household was created in Feeder (R11c): household_settings.created_at, stamped
// with the clock on first read when still NULL (a fresh install).
func (s *Store) Created(ctx context.Context) (time.Time, error) {
	var at sql.NullString
	if err := s.db.QueryRowContext(ctx, `SELECT created_at FROM household_settings WHERE id = 1`).Scan(&at); err != nil {
		return time.Time{}, err
	}
	if !at.Valid {
		stamp := s.clk.Now().UTC().Format(time.RFC3339)
		if _, err := s.db.ExecContext(ctx, `UPDATE household_settings SET created_at = ? WHERE id = 1 AND created_at IS NULL`, stamp); err != nil {
			return time.Time{}, err
		}
		if err := s.db.QueryRowContext(ctx, `SELECT created_at FROM household_settings WHERE id = 1`).Scan(&at); err != nil {
			return time.Time{}, err
		}
	}
	return time.Parse(time.RFC3339, at.String)
}

// nullEmail stores no address as NULL so the unique index ignores it.
func nullEmail(e string) any {
	if e == "" {
		return nil
	}
	return e
}
