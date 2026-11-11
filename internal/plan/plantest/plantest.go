// Package plantest gives planning tests a migrated temp database with raw-SQL
// seeds for the rows planning refers to (Meal Slots, Recipes, Members).
package plantest

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// NewDB opens a temp SQLite database with every embedded migration applied.
func NewDB(t testing.TB) *sql.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatalf("plantest: open: %v", err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("plantest: migrate: %v", err)
	}
	return d
}

func insert(t testing.TB, d *sql.DB, query string, args ...any) int64 {
	t.Helper()
	res, err := d.Exec(query, args...)
	if err != nil {
		t.Fatalf("plantest: %s: %v", query, err)
	}
	id, _ := res.LastInsertId()
	return id
}

// SeedMealSlot inserts a Meal Slot (weekday 1 Monday .. 7 Sunday, time "HH:MM") that serves the main Course
// (required, position 0), like a slot created through the household store (ADR 0008, migration 1400).
func SeedMealSlot(t testing.TB, d *sql.DB, weekday int, name, hhmm string) int64 {
	t.Helper()
	id := insert(t, d, `INSERT INTO meal_slots (weekday, name, time) VALUES (?, ?, ?)`, weekday, name, hhmm)
	insert(t, d, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional)
		VALUES (?, `+mainCourse+`, 0, 0)`, id)
	return id
}

// SeedRecipe inserts a minimal Recipe with the given Yield and returns its id. The Recipe is marked with the
// main Course and is not a Whole meal, like a Recipe created without Courses.
func SeedRecipe(t testing.TB, d *sql.DB, name string, yield float64) int64 {
	t.Helper()
	id := insert(t, d, `INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
		name, yield)
	insert(t, d, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, `+mainCourse+`)`, id)
	return id
}

const mainCourse = `(SELECT id FROM courses WHERE is_main = 1)`

// CourseID returns the id of the Course with that name (Main, Side, Starter and Dessert are seeded by 1400).
func CourseID(t testing.TB, d *sql.DB, name string) int64 {
	t.Helper()
	var id int64
	if err := d.QueryRow(`SELECT id FROM courses WHERE name = ?`, name).Scan(&id); err != nil {
		t.Fatalf("plantest: no Course %q: %v", name, err)
	}
	return id
}

// SetRecipeCourses replaces the Courses a Recipe is served as.
func SetRecipeCourses(t testing.TB, d *sql.DB, recipeID int64, courseIDs ...int64) {
	t.Helper()
	insert(t, d, `DELETE FROM recipe_courses WHERE recipe_id = ?`, recipeID)
	for _, c := range courseIDs {
		insert(t, d, `INSERT INTO recipe_courses (recipe_id, course_id) VALUES (?, ?)`, recipeID, c)
	}
}

// SetWholeMeal sets the Whole meal flag of a Recipe.
func SetWholeMeal(t testing.TB, d *sql.DB, recipeID int64, whole bool) {
	t.Helper()
	v := 0
	if whole {
		v = 1
	}
	insert(t, d, `UPDATE recipes SET whole_meal = ? WHERE id = ?`, v, recipeID)
}

// SlotCourseSeed is one Course of a Meal Slot for SetSlotCourses.
type SlotCourseSeed struct {
	CourseID int64
	Optional bool
}

// SetSlotCourses replaces the Courses a Meal Slot serves, in the given order.
func SetSlotCourses(t testing.TB, d *sql.DB, slotID int64, courses ...SlotCourseSeed) {
	t.Helper()
	insert(t, d, `DELETE FROM meal_slot_courses WHERE meal_slot_id = ?`, slotID)
	for i, c := range courses {
		opt := 0
		if c.Optional {
			opt = 1
		}
		insert(t, d, `INSERT INTO meal_slot_courses (meal_slot_id, course_id, position, optional) VALUES (?, ?, ?, ?)`,
			slotID, c.CourseID, i, opt)
	}
}

// SeedCourseOptOut records that a Member usually does not eat the Course at the Meal Slot.
func SeedCourseOptOut(t testing.TB, d *sql.DB, slotID, courseID, memberID int64) {
	t.Helper()
	insert(t, d, `INSERT INTO meal_slot_course_opt_outs (meal_slot_id, course_id, member_id) VALUES (?, ?, ?)`,
		slotID, courseID, memberID)
}

// SeedMember inserts a Member with Portion Factor 1.
func SeedMember(t testing.TB, d *sql.DB, name string) int64 {
	t.Helper()
	return insert(t, d, `INSERT INTO members (name, colour, portion_factor, created_at) VALUES (?, '#336699', 1, '2026-11-01T00:00:00Z')`, name)
}
