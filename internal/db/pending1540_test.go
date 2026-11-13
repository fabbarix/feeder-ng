package db_test

import (
	"context"
	"database/sql"
	"io/fs"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// db.Pre1540Prefixes and db.NeedsPre1540Snapshot decide whether start-up takes feeder-pre-1540.db before the
// beta.6 migration 1540 Base recipes (docs/dev/design/b6-snap.md; ADR 0015). withBeta5 builds the migration sets.

func TestPre1540PrefixesCoverTheBeta6Migration(t *testing.T) {
	want := []string{"1540_"}
	if !reflect.DeepEqual(db.Pre1540Prefixes, want) {
		t.Fatalf("Pre1540Prefixes = %v, want %v", db.Pre1540Prefixes, want)
	}
}

func TestPre1540DoesNotOverlapPre1500(t *testing.T) {
	for _, p := range db.Pre1540Prefixes {
		for _, q := range db.Pre1500Prefixes {
			if strings.HasPrefix(p, q) || strings.HasPrefix(q, p) {
				t.Errorf("prefix %q overlaps %q: a migration would trigger both snapshots", p, q)
			}
		}
	}
	if want := []string{"1500_", "1510_", "1520_", "1530_"}; !reflect.DeepEqual(db.Pre1500Prefixes, want) {
		t.Errorf("Pre1500Prefixes = %v: the beta.5 set must not change", db.Pre1500Prefixes)
	}
}

func TestNeedsSnapshotForPre1540Prefixes(t *testing.T) {
	ctx := context.Background()
	set := withBeta5(t, "1500_a.sql", "1540_x.sql")
	cases := []struct {
		name  string
		want  bool
		setup func(*testing.T, *sql.DB)
	}{
		{"a brand-new file takes none", false, func(t *testing.T, d *sql.DB) {}},
		{"an upgrade from beta.4.2 (1500 and 1540 pending) takes one", true, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, upTo(t, "1500_")); err != nil {
				t.Fatal(err)
			}
		}},
		{"an upgrade from beta.5 (only 1540 pending) takes one", true, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, withBeta5(t, "1500_a.sql")); err != nil {
				t.Fatal(err)
			}
		}},
		{"everything applied takes none", false, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, set); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d, _ := openTemp(t)
			c.setup(t, d)
			got, err := db.NeedsSnapshotFor(ctx, d, set, db.Pre1540Prefixes)
			if err != nil || got != c.want {
				t.Fatalf("NeedsSnapshotFor = %v, %v; want %v, nil", got, err, c.want)
			}
		})
	}
}

func TestPre1540IgnoresBeta5MigrationsAndPre1500IgnoresBeta6(t *testing.T) {
	ctx := context.Background()
	d, _ := openTemp(t)
	if err := db.Migrate(ctx, d, upTo(t, "1500_")); err != nil {
		t.Fatal(err)
	}
	// Only 1500 and 1510 pending: the pre-1540 snapshot is not due.
	beta5Only := withBeta5(t, "1500_a.sql", "1510_b.sql")
	if got, err := db.NeedsSnapshotFor(ctx, d, beta5Only, db.Pre1540Prefixes); err != nil || got {
		t.Fatalf("pre-1540 with only beta.5 files pending = %v, %v; want false", got, err)
	}
	// Only 1540 pending beyond what is applied: the pre-1500 snapshot is not due.
	if err := db.Migrate(ctx, d, withBeta5(t, "1500_a.sql", "1510_b.sql")); err != nil {
		t.Fatal(err)
	}
	withBeta6 := withBeta5(t, "1500_a.sql", "1510_b.sql", "1540_x.sql")
	if got, err := db.NeedsSnapshotFor(ctx, d, withBeta6, db.Pre1500Prefixes); err != nil || got {
		t.Fatalf("pre-1500 with only 1540 pending = %v, %v; want false", got, err)
	}
	if got, err := db.NeedsSnapshotFor(ctx, d, withBeta6, db.Pre1540Prefixes); err != nil || !got {
		t.Fatalf("pre-1540 with 1540 pending = %v, %v; want true", got, err)
	}
}

func TestNeedsPre1540SnapshotFollowsTheEmbeddedMigrations(t *testing.T) {
	ctx := context.Background()
	embedded := false
	entries, err := fs.ReadDir(db.Migrations(), ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if strings.HasPrefix(e.Name(), "1540_") {
			embedded = true
		}
	}
	if !embedded {
		t.Fatal("1540_base_recipes.sql must be embedded")
	}
	d, _ := openTemp(t)
	if got, err := db.NeedsPre1540Snapshot(ctx, d); err != nil || got {
		t.Fatalf("on a brand-new file = %v, %v; want false", got, err)
	}
	// A beta.5 database: everything below 1540 applied.
	if err := db.Migrate(ctx, d, upTo(t, "1540_")); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1540Snapshot(ctx, d); err != nil || !got {
		t.Fatalf("upgrading from beta.5 = %v, %v; want true", got, err)
	}
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1540Snapshot(ctx, d); err != nil || got {
		t.Fatalf("once everything is applied = %v, %v; want false", got, err)
	}
}
