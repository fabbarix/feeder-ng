// Package stocktest holds test helpers for the stock store, service and API
// tests: a migrated temp SQLite and a way to insert Ingredients without the
// Ingredient module.
package stocktest

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// NewDB opens a temp SQLite database with every embedded migration applied
// (needs the Ingredients migration, 0200, from team T2).
func NewDB(t testing.TB) *sql.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return d
}

// SeedIngredient inserts an Ingredient row (T2's `ingredients` table) and returns its id.
func SeedIngredient(t testing.TB, d *sql.DB, name, baseUnit string, shelfLifeDays *int) int64 {
	t.Helper()
	res, err := d.Exec(`INSERT INTO ingredients (name, name_key, base_unit, shelf_life_days, created_at, updated_at)
		VALUES (?, ?, ?, ?, '2026-11-09T12:00:00Z', '2026-11-09T12:00:00Z')`,
		name, strings.ToLower(name), baseUnit, shelfLifeDays)
	if err != nil {
		t.Fatalf("seed ingredient %q: %v", name, err)
	}
	id, _ := res.LastInsertId()
	return id
}
