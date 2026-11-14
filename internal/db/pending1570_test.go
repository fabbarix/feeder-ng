package db_test

import (
	"context"
	"io/fs"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/db"
)

// db.Pre1570Prefixes and db.NeedsPre1570Snapshot decide whether start-up takes feeder-pre-1570.db before the beta.9
// migrations 1570 to 1578 (docs/dev/design/b9-snap.md, plan section 7). They reuse withBeta6 (pending1550_test.go).
// One snapshot covers all nine files (1578 is B9-58, added by the user after the plan), so no later beta.9 package ever touches db.go.

var beta9Prefixes = []string{"1570_", "1571_", "1572_", "1573_", "1574_", "1575_", "1576_", "1577_", "1578_"}

func TestPre1570PrefixesListAllNineBeta9Migrations(t *testing.T) {
	if !reflect.DeepEqual(db.Pre1570Prefixes, beta9Prefixes) {
		t.Fatalf("Pre1570Prefixes = %v, want %v", db.Pre1570Prefixes, beta9Prefixes)
	}
}

func TestPre1570DoesNotOverlapThePreviousSets(t *testing.T) {
	var previous []string
	previous = append(previous, db.Pre1500Prefixes...)
	previous = append(previous, db.Pre1540Prefixes...)
	previous = append(previous, db.Pre1550Prefixes...)
	previous = append(previous, db.Pre1560Prefixes...)
	if len(db.Pre1570Prefixes) == 0 {
		t.Fatal("Pre1570Prefixes is empty")
	}
	for _, p := range db.Pre1570Prefixes {
		for _, q := range previous {
			if strings.HasPrefix(p, q) || strings.HasPrefix(q, p) {
				t.Errorf("prefix %q overlaps %q: a migration would trigger two snapshots", p, q)
			}
		}
	}
	if want := []string{"1560_"}; !reflect.DeepEqual(db.Pre1560Prefixes, want) {
		t.Errorf("Pre1560Prefixes = %v: the beta.8 set must not change", db.Pre1560Prefixes)
	}
}

func TestNeedsSnapshotForPre1570Prefixes(t *testing.T) {
	ctx := context.Background()
	beta8 := []string{"1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_d.sql"}
	set := withBeta6(t, append(append([]string{}, beta8...), "1570_x.sql", "1571_y.sql", "1578_z.sql")...)
	cases := []struct {
		name  string
		want  bool
		apply []string // nil = a brand-new file
	}{
		{"a brand-new file takes none", false, nil},
		{"an upgrade from beta.8 (1570 to 1578 pending) takes one", true, beta8},
		{"an upgrade from beta.7 (1560 and 1570 pending) takes one", true, beta8[:3]},
		{"an upgrade from beta.4.2 (everything pending) takes one", true, []string{}},
		{"1571 alone pending takes one", true, append(append([]string{}, beta8...), "1570_x.sql")},
		{"everything applied takes none", false, append(append([]string{}, beta8...), "1570_x.sql", "1571_y.sql", "1578_z.sql")},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			d, _ := openTemp(t)
			if c.apply != nil {
				if err := db.Migrate(ctx, d, withBeta6(t, c.apply...)); err != nil {
					t.Fatal(err)
				}
			}
			got, err := db.NeedsSnapshotFor(ctx, d, set, db.Pre1570Prefixes)
			if err != nil || got != c.want {
				t.Fatalf("NeedsSnapshotFor = %v, %v; want %v, nil", got, err, c.want)
			}
		})
	}
}

// A later 157x file (here 1573) is covered by the same snapshot with no change to db.go.
func TestPre1570CoversEveryFileOf1570To1578(t *testing.T) {
	ctx := context.Background()
	beta8 := []string{"1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_d.sql"}
	for _, n := range []string{"1570_a.sql", "1571_a.sql", "1572_a.sql", "1573_a.sql", "1574_a.sql", "1575_a.sql", "1576_a.sql", "1577_a.sql", "1578_a.sql"} {
		d, _ := openTemp(t)
		if err := db.Migrate(ctx, d, withBeta6(t, beta8...)); err != nil {
			t.Fatal(err)
		}
		if got, err := db.NeedsSnapshotFor(ctx, d, withBeta6(t, append(append([]string{}, beta8...), n)...), db.Pre1570Prefixes); err != nil || !got {
			t.Errorf("%s pending = %v, %v; want true", n, got, err)
		}
	}
	d, _ := openTemp(t)
	if err := db.Migrate(ctx, d, withBeta6(t, beta8...)); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsSnapshotFor(ctx, d, withBeta6(t, append(append([]string{}, beta8...), "1579_a.sql")...), db.Pre1570Prefixes); err != nil || got {
		t.Errorf("1579 is outside the beta.9 table: NeedsSnapshotFor = %v, %v; want false (the main session extends the table, not a package)", got, err)
	}
}

// Only 157x pending (a beta.8 database): no earlier snapshot is due.
func TestPre1570IsTheOnlySnapshotDueOnABeta8Database(t *testing.T) {
	ctx := context.Background()
	d, _ := openTemp(t)
	beta8 := withBeta6(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_d.sql")
	if err := db.Migrate(ctx, d, beta8); err != nil {
		t.Fatal(err)
	}
	beta9 := withBeta6(t, "1500_a.sql", "1540_b.sql", "1550_c.sql", "1560_d.sql", "1570_e.sql")
	for name, prefixes := range map[string][]string{"pre-1500": db.Pre1500Prefixes, "pre-1540": db.Pre1540Prefixes, "pre-1550": db.Pre1550Prefixes, "pre-1560": db.Pre1560Prefixes} {
		if got, err := db.NeedsSnapshotFor(ctx, d, beta9, prefixes); err != nil || got {
			t.Fatalf("%s with only 1570 pending = %v, %v; want false", name, got, err)
		}
	}
	if got, err := db.NeedsSnapshotFor(ctx, d, beta9, db.Pre1570Prefixes); err != nil || !got {
		t.Fatalf("pre-1570 with 1570 pending = %v, %v; want true", got, err)
	}
}

func TestNeedsPre1570SnapshotFollowsTheEmbeddedMigrations(t *testing.T) {
	ctx := context.Background()
	for _, n := range []string{"1570_meal_slot_removed.sql", "1571_member_removals.sql"} {
		if _, err := fs.Stat(db.Migrations(), n); err != nil {
			t.Fatalf("%s must be embedded: %v", n, err)
		}
	}
	d, _ := openTemp(t)
	if got, err := db.NeedsPre1570Snapshot(ctx, d); err != nil || got {
		t.Fatalf("on a brand-new file = %v, %v; want false", got, err)
	}
	if err := db.Migrate(ctx, d, upTo(t, "1570_")); err != nil { // a beta.8 database
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1570Snapshot(ctx, d); err != nil || !got {
		t.Fatalf("upgrading from beta.8 = %v, %v; want true", got, err)
	}
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	if got, err := db.NeedsPre1570Snapshot(ctx, d); err != nil || got {
		t.Fatalf("once everything is applied = %v, %v; want false", got, err)
	}
}
