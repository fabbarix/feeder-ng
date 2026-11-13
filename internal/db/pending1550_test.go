package db_test

import (
	"context"
	"database/sql"
	"io/fs"
	"reflect"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// db.Pre1550Prefixes and db.NeedsPre1550Snapshot decide whether start-up takes feeder-pre-1550.db before the
// beta.7 migration 1550 Supplies (docs/dev/design/b7-snap.md; ADR 0017). Red until db.go declares them.

// withBeta6 is the real migrations below 1500 plus synthetic files (so the tests do not depend on what 15NN files
// are embedded).
func withBeta6(t *testing.T, names ...string) fs.FS {
	t.Helper()
	out := upTo(t, "1500_").(fstest.MapFS)
	for _, n := range names {
		out[n] = &fstest.MapFile{Data: []byte("CREATE TABLE t_" + strings.TrimSuffix(n, ".sql") + " (id INTEGER PRIMARY KEY);")}
	}
	return out
}

func TestPre1550PrefixesCoverTheBeta7Migration(t *testing.T) {
	want := []string{"1550_"}
	if !reflect.DeepEqual(db.Pre1550Prefixes, want) {
		t.Fatalf("Pre1550Prefixes = %v, want %v", db.Pre1550Prefixes, want)
	}
}

func TestPre1550DoesNotOverlapThePreviousSets(t *testing.T) {
	for _, p := range db.Pre1550Prefixes {
		for _, q := range append(append([]string{}, db.Pre1500Prefixes...), db.Pre1540Prefixes...) {
			if strings.HasPrefix(p, q) || strings.HasPrefix(q, p) {
				t.Errorf("prefix %q overlaps %q: a migration would trigger two snapshots", p, q)
			}
		}
	}
	if want := []string{"1500_", "1510_", "1520_", "1530_"}; !reflect.DeepEqual(db.Pre1500Prefixes, want) {
		t.Errorf("Pre1500Prefixes = %v: the beta.5 set must not change", db.Pre1500Prefixes)
	}
	if want := []string{"1540_"}; !reflect.DeepEqual(db.Pre1540Prefixes, want) {
		t.Errorf("Pre1540Prefixes = %v: the beta.6 set must not change", db.Pre1540Prefixes)
	}
}

func TestNeedsSnapshotForPre1550Prefixes(t *testing.T) {
	ctx := context.Background()
	set := withBeta6(t, "1500_a.sql", "1540_b.sql", "1550_x.sql")
	cases := []struct {
		name  string
		want  bool
		setup func(*testing.T, *sql.DB)
	}{
		{"a brand-new file takes none", false, func(t *testing.T, d *sql.DB) {}},
		{"an upgrade from beta.6 (only 1550 pending) takes one", true, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, withBeta6(t, "1500_a.sql", "1540_b.sql")); err != nil {
				t.Fatal(err)
			}
		}},
		{"an upgrade from beta.5 (1540 and 1550 pending) takes one", true, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, withBeta6(t, "1500_a.sql")); err != nil {
				t.Fatal(err)
			}
		}},
		{"an upgrade from beta.4.2 (1500, 1540 and 1550 pending) takes one", true, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, withBeta6(t)); err != nil {
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
			got, err := db.NeedsSnapshotFor(ctx, d, set, db.Pre1550Prefixes)
			if err != nil || got != c.want {
				t.Fatalf("NeedsSnapshotFor = %v, %v; want %v, nil", got, err, c.want)
			}
		})
	}
}

// A skip upgrade from 1.0.0-beta.5.x to 1.0.0-beta.7: 1540 and 1550 are both pending, so each snapshot's own
// prefix set says yes, and neither set is triggered by the other's file alone.
func TestSkipUpgradeFromBeta5MakesPre1540AndPre1550BothDue(t *testing.T) {
	ctx := context.Background()
	d, _ := openTemp(t)
	if err := db.Migrate(ctx, d, withBeta6(t, "1500_a.sql", "1510_b.sql", "1520_c.sql", "1530_d.sql")); err != nil { // a beta.5 database
		t.Fatal(err)
	}
	set := withBeta6(t, "1500_a.sql", "1510_b.sql", "1520_c.sql", "1530_d.sql", "1540_e.sql", "1550_f.sql")
	for name, prefixes := range map[string][]string{"pre-1540": db.Pre1540Prefixes, "pre-1550": db.Pre1550Prefixes} {
		if got, err := db.NeedsSnapshotFor(ctx, d, set, prefixes); err != nil || !got {
			t.Errorf("%s due = %v, %v; want true", name, got, err)
		}
	}
	if got, err := db.NeedsSnapshotFor(ctx, d, set, db.Pre1500Prefixes); err != nil || got {
		t.Errorf("pre-1500 due = %v, %v; want false (a beta.5 database has 1500 to 1530)", got, err)
	}
}

func TestPre1550IgnoresBeta5AndBeta6MigrationsAndTheOthersIgnore1550(t *testing.T) {
	ctx := context.Background()
	d, _ := openTemp(t)
	if err := db.Migrate(ctx, d, withBeta6(t)); err != nil {
		t.Fatal(err)
	}
	// Only 1500 and 1540 pending: the pre-1550 snapshot is not due.
	older := withBeta6(t, "1500_a.sql", "1540_b.sql")
	if got, err := db.NeedsSnapshotFor(ctx, d, older, db.Pre1550Prefixes); err != nil || got {
		t.Fatalf("pre-1550 with only 1500 and 1540 pending = %v, %v; want false", got, err)
	}
	// Everything but 1550 applied: only the pre-1550 snapshot is due.
	if err := db.Migrate(ctx, d, older); err != nil {
		t.Fatal(err)
	}
	withBeta7 := withBeta6(t, "1500_a.sql", "1540_b.sql", "1550_c.sql")
	for name, prefixes := range map[string][]string{"pre-1500": db.Pre1500Prefixes, "pre-1540": db.Pre1540Prefixes} {
		if got, err := db.NeedsSnapshotFor(ctx, d, withBeta7, prefixes); err != nil || got {
			t.Fatalf("%s with only 1550 pending = %v, %v; want false", name, got, err)
		}
	}
	if got, err := db.NeedsSnapshotFor(ctx, d, withBeta7, db.Pre1550Prefixes); err != nil || !got {
		t.Fatalf("pre-1550 with 1550 pending = %v, %v; want true", got, err)
	}
}

func TestNeedsPre1550SnapshotFollowsTheEmbeddedMigrations(t *testing.T) {
	ctx := context.Background()
	embedded := false
	entries, err := fs.ReadDir(db.Migrations(), ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		if e.Name() == "1550_supplies.sql" {
			embedded = true
		}
	}
	if !embedded {
		t.Fatal("1550_supplies.sql must be embedded")
	}
	d, _ := openTemp(t)
	if got, err := db.NeedsPre1550Snapshot(ctx, d); err != nil || got {
		t.Fatalf("on a brand-new file = %v, %v; want false", got, err)
	}
	// A beta.6.5 database: everything below 1550 applied.
	if err := db.Migrate(ctx, d, upTo(t, "1550_")); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1550Snapshot(ctx, d); err != nil || !got {
		t.Fatalf("upgrading from beta.6 = %v, %v; want true", got, err)
	}
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1550Snapshot(ctx, d); err != nil || got {
		t.Fatalf("once everything is applied = %v, %v; want false", got, err)
	}
}
