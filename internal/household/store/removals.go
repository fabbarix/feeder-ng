package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// Remove Member and Remove Meal Slot keep what Undo and the history need (B9-04; SAFE-02, ADR 0021).
//
// A removed Meal Slot stays in meal_slots with removed_at set (migration 1570): its Cooked and Not cooked Planned
// Meals, Slot Rules, Attendance, Courses and date changes stay; its unresolved Planned Meals and Couldn't plan reasons
// go, and the To confirm ones are kept in meal_slot_removals so Undo within household.RestoreWindowMinutes puts them
// back. A removed Member is deleted with every row that went with them; member_removals (migration 1571) keeps the
// snapshot Undo restores with the same id. Their photo file stays until the snapshot expires.

// AllSlots lists every Meal Slot, removed ones included (Removed true), in the order of Slots.
func (s *Store) AllSlots(ctx context.Context) ([]household.MealSlot, error) {
	return s.slots(ctx, ``)
}

// RemoveSlot soft-removes an active Meal Slot in one transaction: it deletes the slot's unresolved Planned Meals
// (keeping the To confirm ones, from before today, for Undo) and Couldn't plan reasons, and sets removed_at. Cooked and
// Not cooked meals, Slot Rules, Attendance, Courses and date changes stay. household.ErrNotFound for an unknown or
// already removed one. The caller announces the change, which replans.
func (s *Store) RemoveSlot(ctx context.Context, id int64) error {
	now := s.stamp()
	return s.inTx(ctx, func(tx *sql.Tx) error {
		if err := slotExists(ctx, tx, id); err != nil {
			return err
		}
		today, err := s.today(ctx, tx)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM meal_slot_removals WHERE meal_slot_id = ?`, id); err != nil {
			return err
		}
		// The To confirm rows, each with its Bought rows, as one JSON object (the planned_meals columns by name).
		if _, err := tx.ExecContext(ctx, `INSERT INTO meal_slot_removals (meal_slot_id, removed_at, meal_json)
			SELECT pm.meal_slot_id, ?, json_object(
				'id', pm.id, 'date', pm.date, 'course_id', pm.course_id, 'recipe_id', pm.recipe_id,
				'batches', pm.batches, 'portions', pm.portions, 'pinned', pm.pinned,
				'from_leftover_id', pm.from_leftover_id, 'from_date', pm.from_date,
				'from_meal_slot_id', pm.from_meal_slot_id, 'from_course_id', pm.from_course_id,
				'relaxed', pm.relaxed, 'why_json', pm.why_json, 'created_at', pm.created_at, 'updated_at', pm.updated_at,
				'bought', (SELECT json_group_array(json_object('ingredient_id', b.ingredient_id, 'lot_id', b.lot_id,
						'quantity', b.quantity, 'bought_at', b.bought_at))
					FROM planned_meal_bought b WHERE b.planned_meal_id = pm.id))
			FROM planned_meals pm
			WHERE pm.meal_slot_id = ? AND pm.state = 'planned' AND pm.date < ?
			ORDER BY pm.date, pm.id`, now, id, today); err != nil {
			return err
		}
		for _, q := range []string{
			`DELETE FROM planned_meals WHERE meal_slot_id = ? AND state = 'planned'`,
			`DELETE FROM plan_unfilled WHERE meal_slot_id = ?`,
		} {
			if _, err := tx.ExecContext(ctx, q, id); err != nil {
				return err
			}
		}
		_, err = tx.ExecContext(ctx, `UPDATE meal_slots SET removed_at = ? WHERE id = ?`, now, id)
		return err
	})
}

// RestoreSlot brings a removed Meal Slot back with the same id, Attendance, Courses, Slot Rules and date changes.
// Within household.RestoreWindowMinutes of the removal it also puts the To confirm rows back. A slot left with no
// Course meanwhile (its only Course was archived) gets the main Course. household.ErrNotFound when it is not removed;
// household.ErrSlotNameTaken when an active Meal Slot has its weekday and name (nothing changes). The caller announces
// the change, which replans.
func (s *Store) RestoreSlot(ctx context.Context, id int64) (household.MealSlot, error) {
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		var removed sql.NullString
		err := tx.QueryRowContext(ctx, `SELECT removed_at FROM meal_slots WHERE id = ?`, id).Scan(&removed)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && !removed.Valid) {
			return household.ErrNotFound
		}
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE meal_slots SET removed_at = NULL WHERE id = ?`, id); err != nil {
			if isUnique(err) {
				return household.ErrSlotNameTaken
			}
			return err
		}
		if s.undoable(removed.String) {
			if err := putBackToConfirm(ctx, tx, id); err != nil {
				return err
			}
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM meal_slot_removals WHERE meal_slot_id = ?`, id); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional)
			SELECT ?, id, 0, 0 FROM courses WHERE is_main = 1
			AND NOT EXISTS (SELECT 1 FROM meal_slot_courses WHERE meal_slot_id = ?)`, id, id)
		return err
	})
	if err != nil {
		return household.MealSlot{}, err
	}
	return s.Slot(ctx, id)
}

// putBackToConfirm re-inserts the To confirm rows RemoveSlot kept, with their ids and Bought rows. A row whose Recipe
// or Course is gone, or whose place was taken meanwhile, is skipped; a Leftover that is gone is cleared.
func putBackToConfirm(ctx context.Context, tx *sql.Tx, slotID int64) error {
	if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO planned_meals (id, date, meal_slot_id, course_id, recipe_id,
			batches, portions, state, pinned, from_leftover_id, from_date, from_meal_slot_id, from_course_id, relaxed,
			why_json, created_at, updated_at)
		SELECT json_extract(r.meal_json, '$.id'), json_extract(r.meal_json, '$.date'), r.meal_slot_id,
			json_extract(r.meal_json, '$.course_id'), json_extract(r.meal_json, '$.recipe_id'),
			json_extract(r.meal_json, '$.batches'), json_extract(r.meal_json, '$.portions'), 'planned',
			json_extract(r.meal_json, '$.pinned'),
			(SELECT l.id FROM leftovers l WHERE l.id = json_extract(r.meal_json, '$.from_leftover_id')),
			json_extract(r.meal_json, '$.from_date'), json_extract(r.meal_json, '$.from_meal_slot_id'),
			json_extract(r.meal_json, '$.from_course_id'), json_extract(r.meal_json, '$.relaxed'),
			json_extract(r.meal_json, '$.why_json'), json_extract(r.meal_json, '$.created_at'),
			json_extract(r.meal_json, '$.updated_at')
		FROM meal_slot_removals r
		WHERE r.meal_slot_id = ?
			AND EXISTS (SELECT 1 FROM recipes WHERE id = json_extract(r.meal_json, '$.recipe_id'))
			AND EXISTS (SELECT 1 FROM courses WHERE id = json_extract(r.meal_json, '$.course_id'))
			AND (json_extract(r.meal_json, '$.from_course_id') IS NULL
				OR EXISTS (SELECT 1 FROM courses WHERE id = json_extract(r.meal_json, '$.from_course_id')))
		ORDER BY r.id`, slotID); err != nil {
		return err
	}
	_, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO planned_meal_bought (planned_meal_id, ingredient_id, lot_id, quantity, bought_at)
		SELECT json_extract(r.meal_json, '$.id'), json_extract(b.value, '$.ingredient_id'), json_extract(b.value, '$.lot_id'),
			json_extract(b.value, '$.quantity'), json_extract(b.value, '$.bought_at')
		FROM meal_slot_removals r, json_each(r.meal_json, '$.bought') b
		WHERE r.meal_slot_id = ?
			AND EXISTS (SELECT 1 FROM planned_meals pm WHERE pm.id = json_extract(r.meal_json, '$.id') AND pm.meal_slot_id = r.meal_slot_id)
			AND EXISTS (SELECT 1 FROM ingredients i WHERE i.id = json_extract(b.value, '$.ingredient_id'))`, slotID)
	return err
}

// SlotImpact is what RemoveSlot would do. household.ErrNotFound for an unknown or removed Meal Slot.
func (s *Store) SlotImpact(ctx context.Context, id int64) (household.SlotImpact, error) {
	if err := slotExists(ctx, s.db, id); err != nil {
		return household.SlotImpact{}, err
	}
	today, err := s.today(ctx, s.db)
	if err != nil {
		return household.SlotImpact{}, err
	}
	im := household.SlotImpact{SlotRules: []household.RemovedRule{}}
	if im.PlannedMeals, err = unresolvedMeals(ctx, s.db, `pm.meal_slot_id = ? AND pm.state = 'planned' AND pm.date >= ?`, id, today); err != nil {
		return household.SlotImpact{}, err
	}
	if im.ToConfirm, err = unresolvedMeals(ctx, s.db, `pm.meal_slot_id = ? AND pm.state = 'planned' AND pm.date < ?`, id, today); err != nil {
		return household.SlotImpact{}, err
	}
	if err := scanAll(ctx, s.db, `SELECT id, meal_slot_id, course_id, COALESCE(recipe_id, 0), COALESCE(tag, '')
		FROM slot_rules WHERE meal_slot_id = ? ORDER BY id`, func(r *sql.Rows) error {
		var rule household.RemovedRule
		if err := r.Scan(&rule.ID, &rule.MealSlotID, &rule.CourseID, &rule.RecipeID, &rule.Tag); err != nil {
			return err
		}
		im.SlotRules = append(im.SlotRules, rule)
		return nil
	}, id); err != nil {
		return household.SlotImpact{}, err
	}
	err = s.db.QueryRowContext(ctx, `SELECT count(*) FROM planned_meals WHERE meal_slot_id = ? AND state IN ('cooked', 'skipped')`,
		id).Scan(&im.CookedKept)
	return im, err
}

// unresolvedMeals lists the Planned Meals that where selects (by date, then id), each with what was bought for it.
func unresolvedMeals(ctx context.Context, q querier, where string, args ...any) ([]household.RemovedMeal, error) {
	out := []household.RemovedMeal{}
	var ids []int64
	if err := scanAll(ctx, q, `SELECT pm.id, pm.date, pm.meal_slot_id, pm.course_id, pm.recipe_id, pm.pinned
		FROM planned_meals pm WHERE `+where+` ORDER BY pm.date, pm.id`, func(r *sql.Rows) error {
		var (
			m      household.RemovedMeal
			id     int64
			pinned int
		)
		if err := r.Scan(&id, &m.Date, &m.MealSlotID, &m.CourseID, &m.RecipeID, &pinned); err != nil {
			return err
		}
		m.Pinned = pinned == 1
		out = append(out, m)
		ids = append(ids, id)
		return nil
	}, args...); err != nil {
		return nil, err
	}
	for i, id := range ids {
		names, err := boughtNames(ctx, q, id)
		if err != nil {
			return nil, err
		}
		out[i].Bought = names
	}
	return out, nil
}

// RemovedSlots lists the removed Meal Slots that kept Cooked or Not cooked meals (the Removed Meal Slots read, SET-15):
// the ones with the same name and the same removal instant make one row, newest removal first, then by name.
func (s *Store) RemovedSlots(ctx context.Context) ([]household.RemovedSlot, error) {
	out := []household.RemovedSlot{}
	err := scanAll(ctx, s.db, `SELECT ms.id, ms.weekday, ms.name, ms.time, ms.removed_at,
			(SELECT count(*) FROM planned_meals pm WHERE pm.meal_slot_id = ms.id AND pm.state = 'cooked'),
			(SELECT count(*) FROM planned_meals pm WHERE pm.meal_slot_id = ms.id AND pm.state = 'skipped')
		FROM meal_slots ms
		WHERE ms.removed_at IS NOT NULL
			AND EXISTS (SELECT 1 FROM planned_meals pm WHERE pm.meal_slot_id = ms.id AND pm.state IN ('cooked', 'skipped'))
		ORDER BY ms.removed_at DESC, ms.name, ms.weekday, ms.id`, func(r *sql.Rows) error {
		var (
			id                int64
			weekday           int
			name, at, removed string
			cooked, notCooked int
		)
		if err := r.Scan(&id, &weekday, &name, &at, &removed, &cooked, &notCooked); err != nil {
			return err
		}
		if n := len(out); n > 0 && out[n-1].RemovedAt == removed && strings.EqualFold(out[n-1].Name, name) {
			g := &out[n-1]
			g.IDs, g.Weekdays = append(g.IDs, id), append(g.Weekdays, weekday)
			g.Cooked += cooked
			g.NotCooked += notCooked
			return nil
		}
		out = append(out, household.RemovedSlot{IDs: []int64{id}, Name: name, Weekdays: []int{weekday}, Time: at,
			RemovedAt: removed, Cooked: cooked, NotCooked: notCooked})
		return nil
	})
	return out, err
}

// memberSnapshot is what member_removals.snapshot_json holds: the Member's row and every row that went with them.
type memberSnapshot struct {
	Name          string             `json:"name"`
	Colour        string             `json:"colour"`
	Avatar        string             `json:"avatar"`
	Photo         string             `json:"photo"`
	PortionFactor float64            `json:"portionFactor"`
	UserID        *int64             `json:"userId"`
	Email         string             `json:"email"`
	CreatedAt     string             `json:"createdAt"`
	Attendance    []snapAttendee     `json:"attendance"`     // meal_slot_attendees
	DateAttend    []snapDateAttendee `json:"dateAttendance"` // attendance_override_attendees
	SlotOptOuts   []snapSlotOptOut   `json:"slotOptOuts"`    // meal_slot_course_opt_outs
	DateOptOuts   []snapDateOptOut   `json:"dateOptOuts"`    // course_attendance_override_opt_outs
	Preferences   []snapRecipePref   `json:"preferences"`    // member_recipe_preferences
	Exclusions    []int64            `json:"exclusions"`     // member_ingredient_exclusions (Ingredient ids)
}

type snapAttendee struct {
	SlotID   int64    `json:"slotId"`
	Override *float64 `json:"override"`
}

type snapDateAttendee struct {
	SlotID   int64    `json:"slotId"`
	Date     string   `json:"date"`
	Override *float64 `json:"override"`
}

type snapSlotOptOut struct {
	SlotID   int64 `json:"slotId"`
	CourseID int64 `json:"courseId"`
}

type snapDateOptOut struct {
	SlotID   int64  `json:"slotId"`
	Date     string `json:"date"`
	CourseID int64  `json:"courseId"`
}

type snapRecipePref struct {
	RecipeID int64  `json:"recipeId"`
	State    string `json:"state"`
}

// RemoveMember snapshots the Member and removes them with every row that goes with them, in one transaction.
// household.ErrNotFound for an unknown one. The photo file stays (ExpireMemberRemovals releases it later).
func (s *Store) RemoveMember(ctx context.Context, id int64) error {
	now := s.stamp()
	return s.inTx(ctx, func(tx *sql.Tx) error {
		snap, err := readMemberSnapshot(ctx, tx, id)
		if err != nil {
			return err
		}
		body, err := json.Marshal(snap)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT OR REPLACE INTO member_removals (member_id, removed_at, photo, snapshot_json)
			VALUES (?, ?, ?, ?)`, id, now, snap.Photo, string(body)); err != nil {
			return err
		}
		res, err := tx.ExecContext(ctx, `DELETE FROM members WHERE id = ?`, id)
		if err != nil {
			return err
		}
		return requireOne(res)
	})
}

// readMemberSnapshot reads the Member and the rows that go with them. household.ErrNotFound for an unknown one.
func readMemberSnapshot(ctx context.Context, tx *sql.Tx, id int64) (memberSnapshot, error) {
	var (
		snap  memberSnapshot
		user  sql.NullInt64
		email sql.NullString
	)
	err := tx.QueryRowContext(ctx, `SELECT name, colour, avatar, photo, portion_factor, user_id, email, created_at
		FROM members WHERE id = ?`, id).Scan(&snap.Name, &snap.Colour, &snap.Avatar, &snap.Photo, &snap.PortionFactor, &user, &email, &snap.CreatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return memberSnapshot{}, household.ErrNotFound
	}
	if err != nil {
		return memberSnapshot{}, err
	}
	if user.Valid {
		u := user.Int64
		snap.UserID = &u
	}
	snap.Email = email.String
	reads := []struct {
		query string
		each  func(*sql.Rows) error
	}{
		{`SELECT slot_id, portion_factor_override FROM meal_slot_attendees WHERE member_id = ? ORDER BY slot_id`,
			func(r *sql.Rows) error {
				var a snapAttendee
				var o sql.NullFloat64
				if err := r.Scan(&a.SlotID, &o); err != nil {
					return err
				}
				a.Override = floatPtr(o)
				snap.Attendance = append(snap.Attendance, a)
				return nil
			}},
		{`SELECT slot_id, date, portion_factor_override FROM attendance_override_attendees WHERE member_id = ? ORDER BY slot_id, date`,
			func(r *sql.Rows) error {
				var a snapDateAttendee
				var o sql.NullFloat64
				if err := r.Scan(&a.SlotID, &a.Date, &o); err != nil {
					return err
				}
				a.Override = floatPtr(o)
				snap.DateAttend = append(snap.DateAttend, a)
				return nil
			}},
		{`SELECT meal_slot_id, course_id FROM meal_slot_course_opt_outs WHERE member_id = ? ORDER BY meal_slot_id, course_id`,
			func(r *sql.Rows) error {
				var o snapSlotOptOut
				if err := r.Scan(&o.SlotID, &o.CourseID); err != nil {
					return err
				}
				snap.SlotOptOuts = append(snap.SlotOptOuts, o)
				return nil
			}},
		{`SELECT slot_id, date, course_id FROM course_attendance_override_opt_outs WHERE member_id = ? ORDER BY slot_id, date, course_id`,
			func(r *sql.Rows) error {
				var o snapDateOptOut
				if err := r.Scan(&o.SlotID, &o.Date, &o.CourseID); err != nil {
					return err
				}
				snap.DateOptOuts = append(snap.DateOptOuts, o)
				return nil
			}},
		{`SELECT recipe_id, state FROM member_recipe_preferences WHERE member_id = ? ORDER BY recipe_id`,
			func(r *sql.Rows) error {
				var p snapRecipePref
				if err := r.Scan(&p.RecipeID, &p.State); err != nil {
					return err
				}
				snap.Preferences = append(snap.Preferences, p)
				return nil
			}},
		{`SELECT ingredient_id FROM member_ingredient_exclusions WHERE member_id = ? ORDER BY ingredient_id`,
			func(r *sql.Rows) error {
				var i int64
				if err := r.Scan(&i); err != nil {
					return err
				}
				snap.Exclusions = append(snap.Exclusions, i)
				return nil
			}},
	}
	for _, rd := range reads {
		if err := scanAll(ctx, tx, rd.query, rd.each, id); err != nil {
			return memberSnapshot{}, err
		}
	}
	return snap, nil
}

// RestoreMember puts a removed Member back with the same id and every row that went with them, within
// household.RestoreWindowMinutes, and deletes the snapshot. A row whose Meal Slot, date change, Course, Recipe or
// Ingredient is gone meanwhile is skipped; the User link comes back when that User exists and has no other Member.
// household.ErrNotFound when there is no snapshot or it is more than ten minutes old; household.ErrEmailTaken when the
// address was taken since (nothing changes).
func (s *Store) RestoreMember(ctx context.Context, id int64) (household.Member, error) {
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		var removedAt, body string
		err := tx.QueryRowContext(ctx, `SELECT removed_at, snapshot_json FROM member_removals WHERE member_id = ?`, id).Scan(&removedAt, &body)
		if errors.Is(err, sql.ErrNoRows) {
			return household.ErrNotFound
		}
		if err != nil {
			return err
		}
		if !s.undoable(removedAt) {
			return household.ErrNotFound
		}
		var snap memberSnapshot
		if err := json.Unmarshal([]byte(body), &snap); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO members (id, name, colour, avatar, photo, portion_factor, user_id, email, created_at)
			VALUES (?, ?, ?, ?, ?, ?,
				(SELECT u.id FROM users u WHERE u.id = ? AND NOT EXISTS (SELECT 1 FROM members m WHERE m.user_id = u.id)),
				?, ?)`,
			id, snap.Name, snap.Colour, snap.Avatar, snap.Photo, snap.PortionFactor, snap.UserID, nullEmail(snap.Email), snap.CreatedAt); err != nil {
			if isUnique(err) {
				return household.ErrEmailTaken
			}
			return err
		}
		if err := restoreMemberRows(ctx, tx, id, snap); err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, `DELETE FROM member_removals WHERE member_id = ?`, id)
		return err
	})
	if err != nil {
		return household.Member{}, err
	}
	return s.Member(ctx, id)
}

// restoreMemberRows re-inserts the snapshot's rows for Member id, skipping any whose parent is gone.
func restoreMemberRows(ctx context.Context, tx *sql.Tx, id int64, snap memberSnapshot) error {
	type stmt struct {
		q    string
		args []any
	}
	var stmts []stmt
	for _, a := range snap.Attendance {
		stmts = append(stmts, stmt{`INSERT OR IGNORE INTO meal_slot_attendees (slot_id, member_id, portion_factor_override)
			SELECT id, ?, ? FROM meal_slots WHERE id = ?`, []any{id, nullFloat(a.Override), a.SlotID}})
	}
	for _, a := range snap.DateAttend {
		stmts = append(stmts, stmt{`INSERT OR IGNORE INTO attendance_override_attendees (slot_id, date, member_id, portion_factor_override)
			SELECT slot_id, date, ?, ? FROM attendance_overrides WHERE slot_id = ? AND date = ?`, []any{id, nullFloat(a.Override), a.SlotID, a.Date}})
	}
	for _, o := range snap.SlotOptOuts {
		stmts = append(stmts, stmt{`INSERT OR IGNORE INTO meal_slot_course_opt_outs (meal_slot_id, course_id, member_id)
			SELECT ms.id, c.id, ? FROM meal_slots ms, courses c WHERE ms.id = ? AND c.id = ?`, []any{id, o.SlotID, o.CourseID}})
	}
	for _, o := range snap.DateOptOuts {
		stmts = append(stmts, stmt{`INSERT OR IGNORE INTO course_attendance_override_opt_outs (slot_id, date, course_id, member_id)
			SELECT slot_id, date, course_id, ? FROM course_attendance_overrides WHERE slot_id = ? AND date = ? AND course_id = ?`,
			[]any{id, o.SlotID, o.Date, o.CourseID}})
	}
	for _, p := range snap.Preferences {
		stmts = append(stmts, stmt{`INSERT OR IGNORE INTO member_recipe_preferences (member_id, recipe_id, state)
			SELECT ?, id, ? FROM recipes WHERE id = ?`, []any{id, p.State, p.RecipeID}})
	}
	for _, ing := range snap.Exclusions {
		stmts = append(stmts, stmt{`INSERT OR IGNORE INTO member_ingredient_exclusions (member_id, ingredient_id)
			SELECT ?, id FROM ingredients WHERE id = ?`, []any{id, ing}})
	}
	for _, st := range stmts {
		if _, err := tx.ExecContext(ctx, st.q, st.args...); err != nil {
			return err
		}
	}
	return nil
}

// MemberImpact is what RemoveMember would do: the Member's Favourites, Dislikes and Exclusions, the active Meal Slots
// they usually attend, and their sign-in address. household.ErrNotFound for an unknown Member.
func (s *Store) MemberImpact(ctx context.Context, id int64) (household.MemberImpact, error) {
	m, err := s.Member(ctx, id)
	if err != nil {
		return household.MemberImpact{}, err
	}
	im := household.MemberImpact{SignInEmail: m.Email}
	err = s.db.QueryRowContext(ctx, `SELECT
			(SELECT count(*) FROM member_recipe_preferences WHERE member_id = ?) +
			(SELECT count(*) FROM member_ingredient_exclusions WHERE member_id = ?),
			(SELECT count(*) FROM meal_slot_attendees a JOIN meal_slots ms ON ms.id = a.slot_id
				WHERE a.member_id = ? AND ms.removed_at IS NULL)`, id, id, id).Scan(&im.Preferences, &im.MealSlots)
	return im, err
}

// ExpireMemberRemovals drops the snapshots older than household.RestoreWindowMinutes and then releases their photos
// (ReleasePhoto: the file store keeps any file something still uses). It returns how many it dropped.
func (s *Store) ExpireMemberRemovals(ctx context.Context) (int, error) {
	var (
		photos []string
		n      int
	)
	err := s.inTx(ctx, func(tx *sql.Tx) error {
		var gone []int64
		if err := scanAll(ctx, tx, `SELECT member_id, removed_at, photo FROM member_removals ORDER BY member_id`, func(r *sql.Rows) error {
			var (
				id        int64
				at, photo string
			)
			if err := r.Scan(&id, &at, &photo); err != nil {
				return err
			}
			if !s.undoable(at) {
				gone = append(gone, id)
				if photo != "" {
					photos = append(photos, photo)
				}
			}
			return nil
		}); err != nil {
			return err
		}
		for _, id := range gone {
			if _, err := tx.ExecContext(ctx, `DELETE FROM member_removals WHERE member_id = ?`, id); err != nil {
				return err
			}
		}
		n = len(gone)
		return nil
	})
	if err != nil {
		return 0, err
	}
	for _, p := range photos {
		s.ReleasePhoto(ctx, p)
	}
	return n, nil
}

// stamp is the clock's now as stored: RFC 3339 UTC, to the second.
func (s *Store) stamp() string {
	return s.clk.Now().UTC().Truncate(time.Second).Format(time.RFC3339)
}

// undoable reports whether a removal stamped at is at most household.RestoreWindowMinutes old (Undo still works).
func (s *Store) undoable(at string) bool {
	t, err := time.Parse(time.RFC3339, at)
	if err != nil {
		return false
	}
	return !s.clk.Now().After(t.Add(household.RestoreWindowMinutes * time.Minute))
}

// scanAll runs query with args and calls each for every row.
func scanAll(ctx context.Context, q querier, query string, each func(*sql.Rows) error, args ...any) error {
	rows, err := q.QueryContext(ctx, query, args...)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		if err := each(rows); err != nil {
			return err
		}
	}
	return rows.Err()
}

func floatPtr(v sql.NullFloat64) *float64 {
	if !v.Valid {
		return nil
	}
	f := v.Float64
	return &f
}
