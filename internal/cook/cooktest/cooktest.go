// Package cooktest holds test helpers for the cook store, service and API tests.
package cooktest

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
		t.Fatalf("open: %v", err)
	}
	t.Cleanup(func() { _ = d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return d
}
