package db_test

import (
	"context"
	"database/sql"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// db.Pending and db.NeedsPre1400Snapshot decide whether start-up takes feeder-pre-1400.db
// (docs/dev/design/crs-plan.md §1.3, team A).

func TestPendingIsTrueUntilTheMigrationIsRecorded(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	// A brand-new file has no schema_migrations table at all: everything is pending.
	got, err := db.Pending(ctx, d, db.Migration1400)
	if err != nil || !got {
		t.Fatalf("Pending on a new file = %v, %v; want true, nil", got, err)
	}
	if err := db.Migrate(ctx, d, upTo(t, "1400_")); err != nil {
		t.Fatal(err)
	}
	if got, err := db.Pending(ctx, d, db.Migration1400); err != nil || !got {
		t.Errorf("Pending before 1400 = %v, %v; want true", got, err)
	}
	if got, err := db.Pending(ctx, d, "1330_storage_places.sql"); err != nil || got {
		t.Errorf("Pending for an applied migration = %v, %v; want false", got, err)
	}
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if got, err := db.Pending(ctx, d, db.Migration1400); err != nil || got {
		t.Errorf("Pending after 1400 = %v, %v; want false", got, err)
	}
	if got, err := db.Pending(ctx, d, "9999_nope.sql"); err != nil || !got {
		t.Errorf("Pending for a name never recorded = %v, %v; want true", got, err)
	}
}

func TestMigration1400IsNamedLikeItsFile(t *testing.T) {
	if db.Migration1400 != "1400_courses.sql" {
		t.Fatalf("Migration1400 = %q", db.Migration1400)
	}
}

func TestNeedsPre1400Snapshot(t *testing.T) {
	ctx := context.Background()
	needs := func(t *testing.T, name string, want bool, setup func(*testing.T, *sql.DB)) {
		t.Helper()
		t.Run(name, func(t *testing.T) {
			d, _ := openTemp(t)
			setup(t, d)
			got, err := db.NeedsPre1400Snapshot(ctx, d)
			if err != nil || got != want {
				t.Fatalf("NeedsPre1400Snapshot = %v, %v; want %v, nil", got, err, want)
			}
		})
	}
	needs(t, "a brand-new file takes none", false, func(t *testing.T, d *sql.DB) {})
	needs(t, "a fresh install (everything migrated, nothing planned) takes none", false, func(t *testing.T, d *sql.DB) {
		if err := db.MigrateEmbedded(ctx, d); err != nil {
			t.Fatal(err)
		}
	})
	needs(t, "an empty planned_meals before 1400 takes none", false, func(t *testing.T, d *sql.DB) {
		if err := db.Migrate(ctx, d, upTo(t, "1400_")); err != nil {
			t.Fatal(err)
		}
	})
	needs(t, "planned_meals with rows before 1400 takes one", true, func(t *testing.T, d *sql.DB) {
		if err := db.Migrate(ctx, d, upTo(t, "1400_")); err != nil {
			t.Fatal(err)
		}
		seedPre1400(t, d)
	})
	needs(t, "once 1400 is recorded it takes none, rows or not", false, func(t *testing.T, d *sql.DB) {
		if err := db.Migrate(ctx, d, upTo(t, "1400_")); err != nil {
			t.Fatal(err)
		}
		seedPre1400(t, d)
		if err := db.MigrateEmbedded(ctx, d); err != nil {
			t.Fatal(err)
		}
	})
	needs(t, "an older schema without a planned_meals table takes none", false, func(t *testing.T, d *sql.DB) {
		if err := db.Migrate(ctx, d, upTo(t, "0600_")); err != nil {
			t.Fatal(err)
		}
	})
}
