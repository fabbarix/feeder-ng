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

// db.NeedsSnapshotFor and db.NeedsPre1500Snapshot decide whether start-up takes feeder-pre-1500.db before the
// beta.5 migrations 1500, 1510, 1520 and 1530 (docs/dev/design/b5-snap.md; reconcile Q28 A).

// withBeta5 is the real migrations up to 1500 plus synthetic 1500 and 1510 files.
func withBeta5(t *testing.T, names ...string) fs.FS {
	t.Helper()
	out := upTo(t, "1500_").(fstest.MapFS)
	for _, n := range names {
		out[n] = &fstest.MapFile{Data: []byte("CREATE TABLE t_" + strings.TrimSuffix(n, ".sql") + " (id INTEGER PRIMARY KEY);")}
	}
	return out
}

func TestPre1500PrefixesCoverTheFourBeta5Migrations(t *testing.T) {
	want := []string{"1500_", "1510_", "1520_", "1530_"}
	if !reflect.DeepEqual(db.Pre1500Prefixes, want) {
		t.Fatalf("Pre1500Prefixes = %v, want %v", db.Pre1500Prefixes, want)
	}
}

func TestNeedsSnapshotFor(t *testing.T) {
	ctx := context.Background()
	two := withBeta5(t, "1500_a.sql", "1510_b.sql")
	cases := []struct {
		name  string
		want  bool
		setup func(*testing.T, *sql.DB)
	}{
		{"a brand-new file takes none", false, func(t *testing.T, d *sql.DB) {}},
		{"an upgrade with 1500 and 1510 pending takes one", true, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, upTo(t, "1500_")); err != nil {
				t.Fatal(err)
			}
		}},
		{"an upgrade with only 1510 pending (1500 applied) takes one", true, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, withBeta5(t, "1500_a.sql")); err != nil {
				t.Fatal(err)
			}
		}},
		{"everything applied takes none", false, func(t *testing.T, d *sql.DB) {
			if err := db.Migrate(ctx, d, two); err != nil {
				t.Fatal(err)
			}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d, _ := openTemp(t)
			c.setup(t, d)
			got, err := db.NeedsSnapshotFor(ctx, d, two, []string{"1500_", "1510_"})
			if err != nil || got != c.want {
				t.Fatalf("NeedsSnapshotFor = %v, %v; want %v, nil", got, err, c.want)
			}
		})
	}
}

func TestNeedsSnapshotForIgnoresMigrationsOutsideThePrefixes(t *testing.T) {
	ctx := context.Background()
	d, _ := openTemp(t)
	if err := db.Migrate(ctx, d, upTo(t, "1400_")); err != nil {
		t.Fatal(err)
	}
	// 1400 and later are pending, but none starts with a 15NN prefix.
	got, err := db.NeedsSnapshotFor(ctx, d, upTo(t, "1500_"), db.Pre1500Prefixes)
	if err != nil || got {
		t.Fatalf("NeedsSnapshotFor = %v, %v; want false, nil", got, err)
	}
}

func TestNeedsSnapshotForTriggersOnAnyOneOfTheFourPrefixes(t *testing.T) {
	ctx := context.Background()
	for _, p := range []string{"1500_", "1510_", "1520_", "1530_"} {
		t.Run(p, func(t *testing.T) {
			d, _ := openTemp(t)
			if err := db.Migrate(ctx, d, upTo(t, "1500_")); err != nil {
				t.Fatal(err)
			}
			got, err := db.NeedsSnapshotFor(ctx, d, withBeta5(t, p+"x.sql"), db.Pre1500Prefixes)
			if err != nil || !got {
				t.Fatalf("NeedsSnapshotFor with only %sx.sql pending = %v, %v; want true", p, got, err)
			}
		})
	}
}

func TestNeedsPre1500SnapshotFollowsTheEmbeddedMigrations(t *testing.T) {
	ctx := context.Background()
	embedded := false
	entries, err := fs.ReadDir(db.Migrations(), ".")
	if err != nil {
		t.Fatal(err)
	}
	for _, e := range entries {
		for _, p := range []string{"1500_", "1510_", "1520_", "1530_"} {
			if strings.HasPrefix(e.Name(), p) {
				embedded = true
			}
		}
	}
	d, _ := openTemp(t)
	if got, err := db.NeedsPre1500Snapshot(ctx, d); err != nil || got {
		t.Fatalf("on a brand-new file = %v, %v; want false", got, err)
	}
	if err := db.Migrate(ctx, d, upTo(t, "1500_")); err != nil {
		t.Fatal(err)
	}
	got, err := db.NeedsPre1500Snapshot(ctx, d)
	if err != nil || got != embedded {
		t.Fatalf("upgrading from beta.4.1 = %v, %v; want %v (a 15NN migration is embedded: %v)", got, err, embedded, embedded)
	}
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1500Snapshot(ctx, d); err != nil || got {
		t.Fatalf("once everything is applied = %v, %v; want false", got, err)
	}
}

func TestNeedsPre1400SnapshotStillWorks(t *testing.T) {
	// The 1400 behaviour is kept as it was (TestNeedsPre1400Snapshot covers the table); one spot check here.
	ctx := context.Background()
	d, _ := openTemp(t)
	if err := db.Migrate(ctx, d, upTo(t, "1400_")); err != nil {
		t.Fatal(err)
	}
	seedPre1400(t, d)
	if got, err := db.NeedsPre1400Snapshot(ctx, d); err != nil || !got {
		t.Fatalf("NeedsPre1400Snapshot = %v, %v; want true", got, err)
	}
}
