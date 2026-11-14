package backup_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/backup"
)

// feeder-pre-1560.db is written like feeder-pre-1550.db (docs/dev/design/b8-snap.md). Red until backup.go names it.

func TestPreSnapshot1560FileIsNamedLikeItsMigration(t *testing.T) {
	if backup.PreSnapshot1560File != "feeder-pre-1560.db" {
		t.Fatalf("PreSnapshot1560File = %q", backup.PreSnapshot1560File)
	}
	if backup.PreSnapshot1550File != "feeder-pre-1550.db" || backup.PreSnapshot1540File != "feeder-pre-1540.db" || backup.PreSnapshot1500File != "feeder-pre-1500.db" || backup.PreSnapshotFile != "feeder-pre-1400.db" {
		t.Fatalf("the 1400, 1500, 1540 and 1550 names must not change: %q, %q, %q, %q", backup.PreSnapshotFile, backup.PreSnapshot1500File, backup.PreSnapshot1540File, backup.PreSnapshot1550File)
	}
}

func TestPre1560SnapshotIsWrittenNotListedAndNeverPruned(t *testing.T) {
	d := openDB(t)
	addUser(t, d, "anna@example.test")
	dir := t.TempDir()
	ctx := context.Background()
	for _, day := range []string{"2026-11-01", "2026-11-02", "2026-11-03"} {
		if _, err := backup.Snapshot(ctx, d, dir, day); err != nil {
			t.Fatal(err)
		}
	}
	info, err := backup.SnapshotNamed(ctx, d, dir, backup.PreSnapshot1560File)
	if err != nil {
		t.Fatalf("SnapshotNamed: %v", err)
	}
	if info.Name != "feeder-pre-1560.db" || info.Size <= 0 {
		t.Errorf("info = %+v", info)
	}
	if st, err := os.Stat(filepath.Join(dir, "feeder-pre-1560.db")); err != nil || st.Mode().Perm() != 0o600 {
		t.Errorf("stat = %v, %v; want a 0600 file", st, err)
	}
	if infos, _ := backup.List(dir); len(infos) != 3 {
		t.Errorf("List = %d entries, want the 3 daily snapshots only", len(infos))
	}
	if _, ok := backup.ParseName("feeder-pre-1560.db"); ok {
		t.Error("ParseName must not recognise feeder-pre-1560.db")
	}
	if _, err := backup.Prune(dir, "2026-11-03", backup.Policy{Daily: 1}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "feeder-pre-1560.db")); err != nil {
		t.Errorf("Prune removed the pre-1560 snapshot: %v", err)
	}
	for _, other := range []string{"feeder-pre-1400.db", "feeder-pre-1500.db", "feeder-pre-1540.db", "feeder-pre-1550.db"} {
		if _, err := os.Stat(filepath.Join(dir, other)); !os.IsNotExist(err) {
			t.Errorf("writing the 1560 snapshot must not create %s (stat err = %v)", other, err)
		}
	}
}
