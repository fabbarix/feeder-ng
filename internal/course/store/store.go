// Package store is the SQLite repository for Courses (migration 1400_courses.sql). It enforces
// the rules of internal/course and, for Delete and Archive, does the whole change in one
// transaction: the Course lists of Recipes and Meal Slots, the opt-outs, Slot Rules, unresolved
// Planned Meals and Couldn't plan reasons.
package store

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/course"
)

// Store is the Course repository. "Today" for "unresolved Planned Meals from today on" is the
// clock's now in the Household's time zone (household_settings.time_zone).
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store over an open, migrated database.
func New(d *sql.DB, clk clock.Clock) *Store { return &Store{db: d, clk: clk} }

// dbtx is the part of *sql.DB and *sql.Tx the store uses.
type dbtx interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// List returns the Courses in household order (position, then id) with their counts. Archived
// ones are listed only when includeArchived.
func (s *Store) List(ctx context.Context, includeArchived bool) ([]course.Listing, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT c.id, c.name, c.position, c.is_main, c.archived,
		(SELECT count(*) FROM recipe_courses rc WHERE rc.course_id = c.id),
		(SELECT count(*) FROM meal_slot_courses mc WHERE mc.course_id = c.id),
		CASE WHEN EXISTS (SELECT 1 FROM planned_meals pm WHERE pm.course_id = c.id OR pm.from_course_id = c.id)
		       OR EXISTS (SELECT 1 FROM leftovers l WHERE l.from_course_id = c.id) THEN 1 ELSE 0 END
		FROM courses c
		WHERE ? = 1 OR c.archived = 0
		ORDER BY c.position, c.id`, boolInt(includeArchived))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []course.Listing
	for rows.Next() {
		var (
			l                   course.Listing
			main, archived, pln int
		)
		if err := rows.Scan(&l.ID, &l.Name, &l.Position, &main, &archived, &l.RecipeCount, &l.MealSlotCount, &pln); err != nil {
			return nil, err
		}
		l.Main, l.Archived, l.Planned = main == 1, archived == 1, pln == 1
		out = append(out, l)
	}
	return out, rows.Err()
}

// Get returns one Course of any state; course.ErrNotFound.
func (s *Store) Get(ctx context.Context, id int64) (course.Course, error) {
	return getCourse(ctx, s.db, id)
}

// Main returns the id of the main Course.
func (s *Store) Main(ctx context.Context) (int64, error) {
	var id int64
	err := s.db.QueryRowContext(ctx, `SELECT id FROM courses WHERE is_main = 1`).Scan(&id)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, course.ErrNotFound
	}
	return id, err
}

// Create adds a Course last in the order. course.ErrNameInvalid, ErrNameTaken (name_key clash
// with any Course, archived ones included), ErrTooMany (20 active).
func (s *Store) Create(ctx context.Context, name string) (course.Course, error) {
	clean, err := course.CleanName(name)
	if err != nil {
		return course.Course{}, err
	}
	key := course.NameKey(clean)
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return course.Course{}, err
	}
	defer tx.Rollback()
	if taken, err := exists(ctx, tx, `SELECT 1 FROM courses WHERE name_key = ?`, key); err != nil {
		return course.Course{}, err
	} else if taken {
		return course.Course{}, course.ErrNameTaken
	}
	if err := checkRoom(ctx, tx); err != nil {
		return course.Course{}, err
	}
	var pos int
	if err := tx.QueryRowContext(ctx, `SELECT COALESCE(MAX(position), -1) + 1 FROM courses`).Scan(&pos); err != nil {
		return course.Course{}, err
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO courses (name, name_key, position, is_main, archived, created_at)
		VALUES (?, ?, ?, 0, 0, ?)`, clean, key, pos, s.now())
	if err != nil {
		return course.Course{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return course.Course{}, err
	}
	if err := tx.Commit(); err != nil {
		return course.Course{}, err
	}
	return course.Course{ID: id, Name: clean, Position: pos}, nil
}

// Rename changes the name and name_key; every reference points at the id so nothing else changes.
// A Course may be renamed to a different spelling of its own name. ErrNotFound, ErrNameInvalid, ErrNameTaken.
func (s *Store) Rename(ctx context.Context, id int64, name string) (course.Course, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return course.Course{}, err
	}
	defer tx.Rollback()
	c, err := getCourse(ctx, tx, id)
	if err != nil {
		return course.Course{}, err
	}
	clean, err := course.CleanName(name)
	if err != nil {
		return course.Course{}, err
	}
	key := course.NameKey(clean)
	var other int64
	err = tx.QueryRowContext(ctx, `SELECT id FROM courses WHERE name_key = ?`, key).Scan(&other)
	if err == nil && other != id {
		return course.Course{}, course.ErrNameTaken
	}
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return course.Course{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE courses SET name = ?, name_key = ? WHERE id = ?`, clean, key, id); err != nil {
		return course.Course{}, err
	}
	if err := tx.Commit(); err != nil {
		return course.Course{}, err
	}
	c.Name = clean
	return c, nil
}

// MakeMain moves the main flag to id in one transaction (the old main is cleared first, so the
// partial unique index never sees two). ErrNotFound, ErrArchived. Making the main Course main is a no-op.
func (s *Store) MakeMain(ctx context.Context, id int64) (course.Course, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return course.Course{}, err
	}
	defer tx.Rollback()
	c, err := getCourse(ctx, tx, id)
	if err != nil {
		return course.Course{}, err
	}
	if c.Archived {
		return course.Course{}, course.ErrArchived
	}
	if c.Main {
		return c, nil
	}
	if _, err := tx.ExecContext(ctx, `UPDATE courses SET is_main = 0 WHERE is_main = 1`); err != nil {
		return course.Course{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE courses SET is_main = 1 WHERE id = ?`, id); err != nil {
		return course.Course{}, err
	}
	if err := tx.Commit(); err != nil {
		return course.Course{}, err
	}
	c.Main = true
	return c, nil
}

// Reorder sets the household order of the active Courses: ids must list each active Course once
// (course.ErrOrder otherwise). Archived Courses keep their positions out of the way (after the active ones).
func (s *Store) Reorder(ctx context.Context, ids []int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	active, err := ids2(ctx, tx, `SELECT id FROM courses WHERE archived = 0 ORDER BY position, id`)
	if err != nil {
		return err
	}
	if err := course.CheckOrder(active, ids); err != nil {
		return err
	}
	for i, id := range ids {
		if _, err := tx.ExecContext(ctx, `UPDATE courses SET position = ? WHERE id = ?`, i, id); err != nil {
			return err
		}
	}
	archived, err := ids2(ctx, tx, `SELECT id FROM courses WHERE archived = 1 ORDER BY position, id`)
	if err != nil {
		return err
	}
	for j, id := range archived {
		if _, err := tx.ExecContext(ctx, `UPDATE courses SET position = ? WHERE id = ?`, len(ids)+j, id); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// Impact says what Delete or Archive of id would change. ErrNotFound.
func (s *Store) Impact(ctx context.Context, id int64) (course.Impact, error) {
	if _, err := getCourse(ctx, s.db, id); err != nil {
		return course.Impact{}, err
	}
	today, err := s.today(ctx, s.db)
	if err != nil {
		return course.Impact{}, err
	}
	return impact(ctx, s.db, id, today)
}

// Delete removes a Course that was never planned, for good, with the same transaction as Archive:
// replacement Course for the Recipes and Meal Slots that would be left with none, the Course taken
// off the others, its opt-outs (usual and per date), its Slot Rules and unresolved Planned Meals
// from today on removed. replacementID 0 means none given (fine when nothing is left without a
// Course). Errors: ErrNotFound, ErrMain, ErrLast, ErrPlanned, ErrReplacement. It returns the Impact it applied.
func (s *Store) Delete(ctx context.Context, id, replacementID int64) (course.Impact, error) {
	_, im, err := s.remove(ctx, id, replacementID, course.RemoveDelete)
	return im, err
}

// Archive does the same for any Course (planned ones included) but keeps the row, with archived = 1,
// and keeps Cooked, Not cooked and past Planned Meals, Leftovers and their Course. Errors as Delete
// except ErrPlanned.
func (s *Store) Archive(ctx context.Context, id, replacementID int64) (course.Course, course.Impact, error) {
	return s.remove(ctx, id, replacementID, course.RemoveArchive)
}

// Unarchive puts an archived Course back last in the order, without restoring it to any Recipe or
// Meal Slot. ErrNotFound, ErrTooMany. Unarchiving an active Course is a no-op.
func (s *Store) Unarchive(ctx context.Context, id int64) (course.Course, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return course.Course{}, err
	}
	defer tx.Rollback()
	c, err := getCourse(ctx, tx, id)
	if err != nil {
		return course.Course{}, err
	}
	if !c.Archived {
		return c, nil
	}
	if err := checkRoom(ctx, tx); err != nil {
		return course.Course{}, err
	}
	if _, err := tx.ExecContext(ctx, `UPDATE courses SET archived = 0,
		position = (SELECT COALESCE(MAX(position), -1) + 1 FROM courses) WHERE id = ?`, id); err != nil {
		return course.Course{}, err
	}
	if err := tx.Commit(); err != nil {
		return course.Course{}, err
	}
	return getCourse(ctx, s.db, id)
}

// remove is the shared body of Delete and Archive: every check first, then every change, in one transaction.
func (s *Store) remove(ctx context.Context, id, replacementID int64, kind course.Removal) (course.Course, course.Impact, error) {
	today, err := s.today(ctx, s.db)
	if err != nil {
		return course.Course{}, course.Impact{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return course.Course{}, course.Impact{}, err
	}
	defer tx.Rollback()

	c, err := getCourse(ctx, tx, id)
	if err != nil {
		return course.Course{}, course.Impact{}, err
	}
	active, err := activeCourses(ctx, tx)
	if err != nil {
		return course.Course{}, course.Impact{}, err
	}
	if err := course.CanRemove(c, active); err != nil {
		return course.Course{}, course.Impact{}, err
	}
	planned, err := isPlanned(ctx, tx, id)
	if err != nil {
		return course.Course{}, course.Impact{}, err
	}
	if kind == course.RemoveDelete && planned {
		return course.Course{}, course.Impact{}, course.ErrPlanned
	}
	recipeOwners, err := owners(ctx, tx, `SELECT recipe_id, course_id FROM recipe_courses ORDER BY recipe_id`)
	if err != nil {
		return course.Course{}, course.Impact{}, err
	}
	slotOwners, err := owners(ctx, tx, `SELECT meal_slot_id, course_id FROM meal_slot_courses ORDER BY meal_slot_id, position`)
	if err != nil {
		return course.Course{}, course.Impact{}, err
	}
	needed := leftWithNone(recipeOwners, id) || leftWithNone(slotOwners, id)
	activeIDs := make([]int64, 0, len(active))
	for _, a := range active {
		activeIDs = append(activeIDs, a.ID)
	}
	if err := course.CheckReplacement(id, replacementID, activeIDs, needed); err != nil {
		return course.Course{}, course.Impact{}, err
	}
	im, err := impact(ctx, tx, id, today)
	if err != nil {
		return course.Course{}, course.Impact{}, err
	}

	// Recipes: the replacement only where a Recipe is left with none.
	reassigned := course.Reassign(recipeOwners, id, replacementID)
	if _, err := tx.ExecContext(ctx, `DELETE FROM recipe_courses WHERE course_id = ?`, id); err != nil {
		return course.Course{}, course.Impact{}, err
	}
	for recipe, kept := range reassigned {
		if len(kept) == 1 && kept[0] == replacementID {
			if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, recipe, replacementID); err != nil {
				return course.Course{}, course.Impact{}, err
			}
		}
	}
	// Meal Slots: the replacement takes the removed Course's position where the slot is left with none.
	slotChanges := course.Reassign(slotOwners, id, replacementID)
	for slot := range slotChanges {
		if len(slotOwners[slot]) != 1 {
			continue
		}
		var pos int
		if err := tx.QueryRowContext(ctx, `SELECT position FROM meal_slot_courses WHERE meal_slot_id = ? AND course_id = ?`, slot, id).Scan(&pos); err != nil {
			return course.Course{}, course.Impact{}, err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM meal_slot_courses WHERE meal_slot_id = ? AND course_id = ?`, slot, id); err != nil {
			return course.Course{}, course.Impact{}, err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, ?, 0)`, slot, replacementID, pos); err != nil {
			return course.Course{}, course.Impact{}, err
		}
	}
	// Everything of the removed Course that stays behind: Meal Slot rows, opt-outs (usual and per date, never
	// copied), Slot Rules, Couldn't plan reasons and the unresolved Planned Meals from today on.
	steps := []struct {
		q    string
		args []any
	}{
		{`DELETE FROM meal_slot_courses WHERE course_id = ?`, []any{id}},
		{`DELETE FROM meal_slot_course_opt_outs WHERE course_id = ?`, []any{id}},
		{`DELETE FROM course_attendance_override_opt_outs WHERE course_id = ?`, []any{id}},
		{`DELETE FROM course_attendance_overrides WHERE course_id = ?`, []any{id}},
		{`DELETE FROM slot_rules WHERE course_id = ?`, []any{id}},
		{`DELETE FROM plan_unfilled WHERE course_id = ?`, []any{id}},
		{`DELETE FROM planned_meals WHERE course_id = ? AND state = 'planned' AND date >= ?`, []any{id, today}},
	}
	for _, st := range steps {
		if _, err := tx.ExecContext(ctx, st.q, st.args...); err != nil {
			return course.Course{}, course.Impact{}, err
		}
	}
	if kind == course.RemoveDelete {
		if _, err := tx.ExecContext(ctx, `DELETE FROM courses WHERE id = ?`, id); err != nil {
			return course.Course{}, course.Impact{}, err
		}
	} else {
		if _, err := tx.ExecContext(ctx, `UPDATE courses SET archived = 1 WHERE id = ?`, id); err != nil {
			return course.Course{}, course.Impact{}, err
		}
		c.Archived = true
	}
	if err := tx.Commit(); err != nil {
		return course.Course{}, course.Impact{}, err
	}
	return c, im, nil
}

// impact computes what Delete or Archive of id changes, as of today (YYYY-MM-DD in the Household's zone).
func impact(ctx context.Context, q dbtx, id int64, today string) (course.Impact, error) {
	var im course.Impact
	planned, err := isPlanned(ctx, q, id)
	if err != nil {
		return im, err
	}
	im.Planned = planned
	if err := q.QueryRowContext(ctx, `SELECT count(*),
			COALESCE(SUM(CASE WHEN (SELECT count(*) FROM recipe_courses o WHERE o.recipe_id = rc.recipe_id) = 1 THEN 1 ELSE 0 END), 0)
		FROM recipe_courses rc WHERE rc.course_id = ?`, id).Scan(&im.Recipes, &im.RecipesOnlyThis); err != nil {
		return im, err
	}
	if err := q.QueryRowContext(ctx, `SELECT count(*),
			COALESCE(SUM(CASE WHEN (SELECT count(*) FROM meal_slot_courses o WHERE o.meal_slot_id = mc.meal_slot_id) = 1 THEN 1 ELSE 0 END), 0)
		FROM meal_slot_courses mc WHERE mc.course_id = ?`, id).Scan(&im.MealSlots, &im.MealSlotsOnlyThis); err != nil {
		return im, err
	}
	rows, err := q.QueryContext(ctx, `SELECT pm.date, pm.meal_slot_id, ms.name, pm.recipe_id, r.name, pm.pinned
		FROM planned_meals pm
		JOIN meal_slots ms ON ms.id = pm.meal_slot_id
		JOIN recipes r ON r.id = pm.recipe_id
		WHERE pm.course_id = ? AND pm.state = 'planned' AND pm.date >= ?
		ORDER BY pm.date, pm.meal_slot_id`, id, today)
	if err != nil {
		return im, err
	}
	for rows.Next() {
		var m course.ImpactMeal
		var pinned int
		if err := rows.Scan(&m.Date, &m.MealSlotID, &m.MealSlotName, &m.RecipeID, &m.RecipeName, &pinned); err != nil {
			rows.Close()
			return im, err
		}
		m.Pinned = pinned == 1
		im.PlannedMeals = append(im.PlannedMeals, m)
	}
	if err := rows.Close(); err != nil {
		return im, err
	}
	if err := rows.Err(); err != nil {
		return im, err
	}
	rows, err = q.QueryContext(ctx, `SELECT id, meal_slot_id, COALESCE(recipe_id, 0), COALESCE(tag, '')
		FROM slot_rules WHERE course_id = ? ORDER BY id`, id)
	if err != nil {
		return im, err
	}
	for rows.Next() {
		var r course.ImpactRule
		if err := rows.Scan(&r.ID, &r.MealSlotID, &r.RecipeID, &r.Tag); err != nil {
			rows.Close()
			return im, err
		}
		im.SlotRules = append(im.SlotRules, r)
	}
	if err := rows.Close(); err != nil {
		return im, err
	}
	return im, rows.Err()
}

// isPlanned: a Planned Meal (any state, either Course column) or a Leftover refers to the Course.
func isPlanned(ctx context.Context, q dbtx, id int64) (bool, error) {
	return exists(ctx, q, `SELECT 1 WHERE EXISTS (SELECT 1 FROM planned_meals WHERE course_id = ? OR from_course_id = ?)
		OR EXISTS (SELECT 1 FROM leftovers WHERE from_course_id = ?)`, id, id, id)
}

// owners maps each owner id (Recipe or Meal Slot) to its Course ids, in the query's order.
func owners(ctx context.Context, q dbtx, query string) (map[int64][]int64, error) {
	rows, err := q.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64][]int64{}
	for rows.Next() {
		var owner, c int64
		if err := rows.Scan(&owner, &c); err != nil {
			return nil, err
		}
		out[owner] = append(out[owner], c)
	}
	return out, rows.Err()
}

// leftWithNone: some owner has the removed Course and no other.
func leftWithNone(owners map[int64][]int64, id int64) bool {
	for _, ids := range owners {
		if len(ids) == 1 && ids[0] == id {
			return true
		}
	}
	return false
}

// checkRoom refuses a twenty-first active Course (archived ones do not count).
func checkRoom(ctx context.Context, q dbtx) error {
	var n int
	if err := q.QueryRowContext(ctx, `SELECT count(*) FROM courses WHERE archived = 0`).Scan(&n); err != nil {
		return err
	}
	if n >= course.MaxCourses {
		return course.ErrTooMany
	}
	return nil
}

func activeCourses(ctx context.Context, q dbtx) ([]course.Course, error) {
	rows, err := q.QueryContext(ctx, `SELECT id, name, position, is_main, archived FROM courses WHERE archived = 0 ORDER BY position, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []course.Course
	for rows.Next() {
		c, err := scanCourse(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func getCourse(ctx context.Context, q dbtx, id int64) (course.Course, error) {
	row := q.QueryRowContext(ctx, `SELECT id, name, position, is_main, archived FROM courses WHERE id = ?`, id)
	c, err := scanCourse(row)
	if errors.Is(err, sql.ErrNoRows) {
		return course.Course{}, course.ErrNotFound
	}
	return c, err
}

type scanner interface{ Scan(dest ...any) error }

func scanCourse(r scanner) (course.Course, error) {
	var c course.Course
	var main, archived int
	if err := r.Scan(&c.ID, &c.Name, &c.Position, &main, &archived); err != nil {
		return course.Course{}, err
	}
	c.Main, c.Archived = main == 1, archived == 1
	return c, nil
}

func ids2(ctx context.Context, q dbtx, query string) ([]int64, error) {
	rows, err := q.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []int64
	for rows.Next() {
		var id int64
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		out = append(out, id)
	}
	return out, rows.Err()
}

func exists(ctx context.Context, q dbtx, query string, args ...any) (bool, error) {
	var one int
	err := q.QueryRowContext(ctx, `SELECT EXISTS (`+query+`)`, args...).Scan(&one)
	return one == 1, err
}

// today is the date (YYYY-MM-DD) of the clock's now in the Household's time zone.
func (s *Store) today(ctx context.Context, q dbtx) (string, error) {
	loc := time.UTC
	var tz string
	err := q.QueryRowContext(ctx, `SELECT time_zone FROM household_settings WHERE id = 1`).Scan(&tz)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	if err == nil {
		if l, lerr := time.LoadLocation(tz); lerr == nil {
			loc = l
		}
	}
	return s.clk.Now().In(loc).Format("2006-01-02"), nil
}

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
