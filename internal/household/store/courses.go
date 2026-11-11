package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/fabbarix/feeder-ng/internal/clock"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// Course Attendance and a Meal Slot's Courses in the store (crs-plan §1.1 "Course Attendance in the store").
// The three opt-out tables hang off meal_slots, courses and members only, never off meal_slot_courses, so
// deleting and reinserting a slot's meal_slot_courses (a reorder, a batch edit) keeps every opt-out. The same
// transaction that saves a slot's Courses deletes the opt-outs, usual and per date, of every Course no longer on
// that slot, and that Course's unresolved Planned Meals from today on, Slot Rules and Couldn't plan reasons.

// errDryRun ends a batch edit's transaction on purpose: the batch was computed, nothing is kept.
var errDryRun = errors.New("household/store: dry run")

// loadSlotCourses lists the slot's Courses in the slot's order, each with its usual opt-outs (ascending).
func loadSlotCourses(ctx context.Context, q querier, slotID int64) ([]household.SlotCourse, error) {
	courses, err := slotCourseRows(ctx, q, slotID)
	if err != nil {
		return nil, err
	}
	index := make(map[int64]int, len(courses))
	for i, c := range courses {
		index[c.CourseID] = i
	}
	rows, err := q.QueryContext(ctx, `SELECT course_id, member_id FROM meal_slot_course_opt_outs
		WHERE meal_slot_id = ? ORDER BY course_id, member_id`, slotID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var courseID, memberID int64
		if err := rows.Scan(&courseID, &memberID); err != nil {
			return nil, err
		}
		if i, ok := index[courseID]; ok {
			courses[i].OptOutMemberIDs = append(courses[i].OptOutMemberIDs, memberID)
		}
	}
	return courses, rows.Err()
}

func slotCourseRows(ctx context.Context, q querier, slotID int64) ([]household.SlotCourse, error) {
	rows, err := q.QueryContext(ctx, `SELECT msc.course_id, c.name, c.is_main, msc.optional
		FROM meal_slot_courses msc JOIN courses c ON c.id = msc.course_id
		WHERE msc.meal_slot_id = ? ORDER BY msc.position`, slotID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []household.SlotCourse{}
	for rows.Next() {
		var c household.SlotCourse
		var main, optional int
		if err := rows.Scan(&c.CourseID, &c.Name, &main, &optional); err != nil {
			return nil, err
		}
		c.Main, c.Optional = main == 1, optional == 1
		c.OptOutMemberIDs = []int64{}
		out = append(out, c)
	}
	return out, rows.Err()
}

// slotCourseIDs lists the Course ids the slot serves.
func slotCourseIDs(ctx context.Context, q querier, slotID int64) (map[int64]bool, error) {
	rows, err := q.QueryContext(ctx, `SELECT course_id FROM meal_slot_courses WHERE meal_slot_id = ?`, slotID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]bool{}
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out[id] = true
	}
	return out, rows.Err()
}

// mainCourseID is the id of the main Course.
func mainCourseID(ctx context.Context, q querier) (int64, error) {
	var id int64
	err := q.QueryRowContext(ctx, `SELECT id FROM courses WHERE is_main = 1`).Scan(&id)
	return id, err
}

// today is the date (YYYY-MM-DD) of the clock's now in the Household's time zone.
func (s *Store) today(ctx context.Context, q querier) (string, error) {
	return clock.HouseholdToday(ctx, q, s.clk)
}

// saveSlotCourses writes a slot's Courses (in the list's order) inside the caller's transaction. Every Course
// must be active and every opt-out Member must exist (ValidationErrors, nothing written). A Course no longer on
// the slot loses its usual and date opt-outs, its Slot Rules, its Couldn't plan reasons and its unresolved Planned
// Meals from today on; those go into rem. A nil OptOutMemberIDs keeps the stored opt-outs; a non-nil one replaces
// them. When attending is non-nil (a batch edit), opt-outs of Members not in it are dropped.
func (s *Store) saveSlotCourses(ctx context.Context, tx *sql.Tx, slotID int64, in []household.SlotCourseInput,
	attending []int64, rem *household.Removals) error {
	if err := household.ValidateSlotCourses(in); err != nil {
		return err
	}
	in = household.NormalizeSlotCourses(in)
	for i, c := range in {
		var active int
		if err := tx.QueryRowContext(ctx, `SELECT count(*) FROM courses WHERE id = ? AND archived = 0`, c.CourseID).Scan(&active); err != nil {
			return err
		}
		if active == 0 {
			return &household.ValidationError{Field: "courses", Reason: household.ReasonCourseUnknown,
				Message: "that Course does not exist or is archived"}
		}
		for _, m := range c.OptOutMemberIDs {
			if err := checkMember(ctx, tx, m); err != nil {
				if errors.Is(err, household.ErrUnknownMember) {
					return &household.ValidationError{Field: fmt.Sprintf("courses[%d].optOutMemberIds", i),
						Reason: household.ReasonMemberUnknown, Message: "that Member does not exist"}
				}
				return err
			}
		}
	}

	kept := map[int64]bool{}
	for _, c := range in {
		kept[c.CourseID] = true
	}
	before, err := slotCourseIDs(ctx, tx, slotID)
	if err != nil {
		return err
	}
	today, err := s.today(ctx, tx)
	if err != nil {
		return err
	}
	for courseID := range before {
		if !kept[courseID] {
			if err := removeSlotCourse(ctx, tx, slotID, courseID, today, rem); err != nil {
				return err
			}
		}
	}

	// Delete and reinsert the rows: no foreign key points at them, so the opt-outs of the kept Courses survive.
	if _, err := tx.ExecContext(ctx, `DELETE FROM meal_slot_courses WHERE meal_slot_id = ?`, slotID); err != nil {
		return err
	}
	for i, c := range in {
		if _, err := tx.ExecContext(ctx, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, ?, ?)`,
			slotID, c.CourseID, i, boolInt(c.Optional)); err != nil {
			return err
		}
		if c.OptOutMemberIDs == nil {
			continue
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM meal_slot_course_opt_outs WHERE meal_slot_id = ? AND course_id = ?`, slotID, c.CourseID); err != nil {
			return err
		}
		for _, m := range c.OptOutMemberIDs {
			if attending != nil && !containsID(attending, m) {
				continue
			}
			if _, err := tx.ExecContext(ctx, `INSERT INTO meal_slot_course_opt_outs (meal_slot_id, course_id, member_id) VALUES (?, ?, ?)`,
				slotID, c.CourseID, m); err != nil {
				return err
			}
		}
	}
	return nil
}

// removeSlotCourse takes one Course off a slot: its unresolved Planned Meals from today on (Pinned included) are
// reported and deleted, and so are its opt-outs (usual and per date), Slot Rules and Couldn't plan reasons.
func removeSlotCourse(ctx context.Context, tx *sql.Tx, slotID, courseID int64, today string, rem *household.Removals) error {
	rows, err := tx.QueryContext(ctx, `SELECT date, meal_slot_id, course_id, recipe_id, pinned FROM planned_meals
		WHERE meal_slot_id = ? AND course_id = ? AND state = 'planned' AND date >= ? ORDER BY date, id`, slotID, courseID, today)
	if err != nil {
		return err
	}
	for rows.Next() {
		var m household.RemovedMeal
		var pinned int
		if err := rows.Scan(&m.Date, &m.MealSlotID, &m.CourseID, &m.RecipeID, &pinned); err != nil {
			rows.Close()
			return err
		}
		m.Pinned = pinned == 1
		rem.PlannedMeals = append(rem.PlannedMeals, m)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	rows, err = tx.QueryContext(ctx, `SELECT id, meal_slot_id, course_id, COALESCE(recipe_id, 0), COALESCE(tag, '') FROM slot_rules
		WHERE meal_slot_id = ? AND course_id = ? ORDER BY id`, slotID, courseID)
	if err != nil {
		return err
	}
	for rows.Next() {
		var r household.RemovedRule
		if err := rows.Scan(&r.ID, &r.MealSlotID, &r.CourseID, &r.RecipeID, &r.Tag); err != nil {
			rows.Close()
			return err
		}
		rem.SlotRules = append(rem.SlotRules, r)
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := rows.Err(); err != nil {
		return err
	}
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`DELETE FROM course_attendance_override_opt_outs WHERE slot_id = ? AND course_id = ?`, []any{slotID, courseID}},
		{`DELETE FROM course_attendance_overrides WHERE slot_id = ? AND course_id = ?`, []any{slotID, courseID}},
		{`DELETE FROM meal_slot_course_opt_outs WHERE meal_slot_id = ? AND course_id = ?`, []any{slotID, courseID}},
		{`DELETE FROM slot_rules WHERE meal_slot_id = ? AND course_id = ?`, []any{slotID, courseID}},
		{`DELETE FROM plan_unfilled WHERE meal_slot_id = ? AND course_id = ?`, []any{slotID, courseID}},
		{`DELETE FROM planned_meals WHERE meal_slot_id = ? AND course_id = ? AND state = 'planned' AND date >= ?`, []any{slotID, courseID, today}},
	} {
		if _, err := tx.ExecContext(ctx, q.sql, q.args...); err != nil {
			return err
		}
	}
	return nil
}

// courseOverride returns the date's own opt-outs for a Course (found: the date has an override row, possibly empty).
func courseOverride(ctx context.Context, q querier, slotID int64, date string, courseID int64) (members []int64, found bool, err error) {
	var one int
	err = q.QueryRowContext(ctx, `SELECT 1 FROM course_attendance_overrides WHERE slot_id = ? AND date = ? AND course_id = ?`,
		slotID, date, courseID).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	rows, err := q.QueryContext(ctx, `SELECT member_id FROM course_attendance_override_opt_outs
		WHERE slot_id = ? AND date = ? AND course_id = ? ORDER BY member_id`, slotID, date, courseID)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	members = []int64{}
	for rows.Next() {
		var m int64
		if err := rows.Scan(&m); err != nil {
			return nil, false, err
		}
		members = append(members, m)
	}
	return members, true, rows.Err()
}

// attendingIDs lists the Members of an Attendance (non-nil, even when empty).
func attendingIDs(att []household.Attendee) []int64 {
	out := make([]int64, 0, len(att))
	for _, a := range att {
		out = append(out, a.MemberID)
	}
	return out
}

// CoursesOn returns the slot's Courses on one date, in the slot's order, each with its effective
// Course Attendance (household.CourseAttendance over DateAttendance). household.ErrNotFound for an
// unknown slot.
func (s *Store) CoursesOn(ctx context.Context, slotID int64, date string) ([]household.CourseDay, error) {
	if _, err := s.Slot(ctx, slotID); err != nil {
		return nil, err
	}
	courses, err := loadSlotCourses(ctx, s.db, slotID)
	if err != nil {
		return nil, err
	}
	att, _, err := s.DateAttendance(ctx, slotID, date)
	if err != nil {
		return nil, err
	}
	out := make([]household.CourseDay, 0, len(courses))
	for _, c := range courses {
		day := household.CourseDay{CourseID: c.CourseID, Main: c.Main, Optional: c.Optional, OptOutMemberIDs: c.OptOutMemberIDs}
		override, found, err := courseOverride(ctx, s.db, slotID, date, c.CourseID)
		if err != nil {
			return nil, err
		}
		var dateOpts *[]int64
		if found {
			day.IsOverride, day.OptOutMemberIDs, dateOpts = true, override, &override
		}
		day.Attendance = household.CourseAttendance(att, c.OptOutMemberIDs, dateOpts)
		out = append(out, day)
	}
	return out, nil
}

// SetDateCourseOptOuts sets (memberIDs non-nil, empty list included: "everyone eats it") or drops
// (nil: back to the usual opt-outs) the date's own opt-outs for one Course of the slot. It does not
// touch the slot's date Attendance. household.ErrNotFound (slot), household.ErrCourseNotInSlot,
// household.ErrUnknownMember. Repeated Members are dropped; a Member who does not attend is accepted.
func (s *Store) SetDateCourseOptOuts(ctx context.Context, slotID int64, date string, courseID int64, memberIDs *[]int64) error {
	if _, err := s.Slot(ctx, slotID); err != nil {
		return err
	}
	return s.inTx(ctx, func(tx *sql.Tx) error {
		var one int
		err := tx.QueryRowContext(ctx, `SELECT 1 FROM meal_slot_courses WHERE meal_slot_id = ? AND course_id = ?`, slotID, courseID).Scan(&one)
		if errors.Is(err, sql.ErrNoRows) {
			return household.ErrCourseNotInSlot
		}
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM course_attendance_override_opt_outs WHERE slot_id = ? AND date = ? AND course_id = ?`,
			slotID, date, courseID); err != nil {
			return err
		}
		if memberIDs == nil {
			_, err := tx.ExecContext(ctx, `DELETE FROM course_attendance_overrides WHERE slot_id = ? AND date = ? AND course_id = ?`,
				slotID, date, courseID)
			return err
		}
		seen := map[int64]bool{}
		members := []int64{}
		for _, m := range *memberIDs {
			if err := checkMember(ctx, tx, m); err != nil {
				return err
			}
			if !seen[m] {
				seen[m] = true
				members = append(members, m)
			}
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO course_attendance_overrides (slot_id, date, course_id) VALUES (?, ?, ?)`,
			slotID, date, courseID); err != nil {
			return err
		}
		for _, m := range members {
			if _, err := tx.ExecContext(ctx, `INSERT INTO course_attendance_override_opt_outs (slot_id, date, course_id, member_id)
				VALUES (?, ?, ?, ?)`, slotID, date, courseID, m); err != nil {
				return err
			}
		}
		return nil
	})
}

// clearDateCourses drops the date's Course overrides and their opt-outs (ClearDateAttendance).
func clearDateCourses(ctx context.Context, tx *sql.Tx, slotID int64, date string) error {
	if _, err := tx.ExecContext(ctx, `DELETE FROM course_attendance_override_opt_outs WHERE slot_id = ? AND date = ?`, slotID, date); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `DELETE FROM course_attendance_overrides WHERE slot_id = ? AND date = ?`, slotID, date)
	return err
}

func containsID(ids []int64, id int64) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
