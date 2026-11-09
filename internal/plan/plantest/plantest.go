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

// SeedMealSlot inserts a Meal Slot (weekday 1 Monday .. 7 Sunday, time "HH:MM").
func SeedMealSlot(t testing.TB, d *sql.DB, weekday int, name, hhmm string) int64 {
	t.Helper()
	return insert(t, d, `INSERT INTO meal_slots (weekday, name, time) VALUES (?, ?, ?)`, weekday, name, hhmm)
}

// SeedRecipe inserts a minimal Recipe with the given Yield and returns its id.
func SeedRecipe(t testing.TB, d *sql.DB, name string, yield float64) int64 {
	t.Helper()
	return insert(t, d, `INSERT INTO recipes (name, yield, created_at, updated_at) VALUES (?, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
		name, yield)
}

// SeedMember inserts a Member with Portion Factor 1.
func SeedMember(t testing.TB, d *sql.DB, name string) int64 {
	t.Helper()
	return insert(t, d, `INSERT INTO members (name, colour, portion_factor, created_at) VALUES (?, '#336699', 1, '2026-11-01T00:00:00Z')`, name)
}
