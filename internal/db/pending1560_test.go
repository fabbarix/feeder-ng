package db_test

import (
	"context"
	"io/fs"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// db.Pre1560Prefixes and db.NeedsPre1560Snapshot decide whether start-up takes feeder-pre-1560.db before the beta.8
// migration 1560 (Undo of a tick, ADR 0019; docs/dev/design/b8-snap.md). They reuse withBeta6 (pending1550_test.go).

func TestPre1560PrefixesCoverTheBeta8Migration(t *testing.T) {
	if want := []string{"1560_"}; !reflect.DeepEqual(db.Pre1560Prefixes, want) {
		t.Fatalf("Pre1560Prefixes = %v, want %v", db.Pre1560Prefixes, want)
	}
}

func TestPre1560DoesNotOverlapThePreviousSets(t *testing.T) {
	var previous []string
	previous = append(previous, db.Pre1500Prefixes...)
	previous = append(previous, db.Pre1540Prefixes...)
	previous = append(previous, db.Pre1550Prefixes...)
	for _, p := range db.Pre1560Prefixes {
		for _, q := range previous {
			if strings.HasPrefix(p, q) || strings.HasPrefix(q, p) {
				t.Errorf("prefix %q overlaps %q: a migration would trigger two snapshots", p, q)
			}
		}
	}
	if want := []string{"1550_"}; !reflect.DeepEqual(db.Pre1550Prefixes, want) {
		t.Errorf("Pre1550Prefixes = %v: the beta.7 set must not change", db.Pre1550Prefixes)
	}
}

func TestNeedsSnapshotForPre1560Prefixes(t *testing.T) {
	ctx := context.Background()
	set := withBeta6(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_x.sql")
	cases := []struct {
		name  string
		want  bool
		apply []string // nil = a brand-new file
	}{
		{"a brand-new file takes none", false, nil},
		{"an upgrade from beta.7 (only 1560 pending) takes one", true, []string{"1500_a.sql", "1540_b.sql", "1550_c.sql"}},
		{"an upgrade from beta.6 (1550 and 1560 pending) takes one", true, []string{"1500_a.sql", "1540_b.sql"}},
		{"an upgrade from beta.4.2 (1500 to 1560 pending) takes one", true, []string{}},
		{"everything applied takes none", false, []string{"1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_x.sql"}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d, _ := openTemp(t)
			if c.apply != nil {
				if err := db.Migrate(ctx, d, withBeta6(t, c.apply...)); err != nil {
					t.Fatal(err)
				}
			}
			got, err := db.NeedsSnapshotFor(ctx, d, set, db.Pre1560Prefixes)
			if err != nil || got != c.want {
				t.Fatalf("NeedsSnapshotFor = %v, %v; want %v, nil", got, err, c.want)
			}
		})
	}
}

// Only 1560 pending (a beta.7 database): no earlier snapshot is due; 1550 pending alone does not trigger pre-1560.
func TestPre1560IsTheOnlySnapshotDueOnABeta7Database(t *testing.T) {
	ctx := context.Background()
	d, _ := openTemp(t)
	beta7 := withBeta6(t, "1500_a.sql", "1540_b.sql", "1550_c.sql")
	if got, err := db.NeedsSnapshotFor(ctx, d, beta7, db.Pre1560Prefixes); err != nil || got {
		t.Fatalf("pre-1560 on a brand-new file without 1560 = %v, %v; want false", got, err)
	}
	if err := db.Migrate(ctx, d, withBeta6(t, "1500_a.sql", "1540_b.sql")); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsSnapshotFor(ctx, d, beta7, db.Pre1560Prefixes); err != nil || got {
		t.Fatalf("pre-1560 with only 1550 pending = %v, %v; want false", got, err)
	}
	if err := db.Migrate(ctx, d, beta7); err != nil {
		t.Fatal(err)
	}
	beta8 := withBeta6(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_d.sql")
	for name, prefixes := range map[string][]string{"pre-1500": db.Pre1500Prefixes, "pre-1540": db.Pre1540Prefixes, "pre-1550": db.Pre1550Prefixes} {
		if got, err := db.NeedsSnapshotFor(ctx, d, beta8, prefixes); err != nil || got {
			t.Fatalf("%s with only 1560 pending = %v, %v; want false", name, got, err)
		}
	}
	if got, err := db.NeedsSnapshotFor(ctx, d, beta8, db.Pre1560Prefixes); err != nil || !got {
		t.Fatalf("pre-1560 with 1560 pending = %v, %v; want true", got, err)
	}
}

func TestNeedsPre1560SnapshotFollowsTheEmbeddedMigrations(t *testing.T) {
	ctx := context.Background()
	if _, err := fs.Stat(db.Migrations(), "1560_tick_lot_quantity.sql"); err != nil {
		t.Fatalf("1560_tick_lot_quantity.sql must be embedded: %v", err)
	}
	d, _ := openTemp(t)
	if got, err := db.NeedsPre1560Snapshot(ctx, d); err != nil || got {
		t.Fatalf("on a brand-new file = %v, %v; want false", got, err)
	}
	if err := db.Migrate(ctx, d, upTo(t, "1560_")); err != nil { // a beta.7 database
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1560Snapshot(ctx, d); err != nil || !got {
		t.Fatalf("upgrading from beta.7 = %v, %v; want true", got, err)
	}
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1560Snapshot(ctx, d); err != nil || got {
		t.Fatalf("once everything is applied = %v, %v; want false", got, err)
	}
}
