package backup_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/backup"
)

// feeder-pre-1500.db is written like feeder-pre-1400.db (docs/dev/design/b5-snap.md).

func TestPreSnapshot1500FileIsNamedLikeItsMigrations(t *testing.T) {
	if backup.PreSnapshot1500File != "feeder-pre-1500.db" {
		t.Fatalf("PreSnapshot1500File = %q", backup.PreSnapshot1500File)
	}
	if backup.PreSnapshotFile != "feeder-pre-1400.db" {
		t.Fatalf("PreSnapshotFile = %q: the 1400 name must not change", backup.PreSnapshotFile)
	}
}

func TestPre1500SnapshotIsWrittenNotListedAndNeverPruned(t *testing.T) {
	d := openDB(t)
	addUser(t, d, "anna@example.test")
	dir := t.TempDir()
	ctx := context.Background()
	for _, day := range []string{"2026-11-01", "2026-11-02", "2026-11-03"} {
		if _, err := backup.Snapshot(ctx, d, dir, day); err != nil {
			t.Fatal(err)
		}
	}
	info, err := backup.SnapshotNamed(ctx, d, dir, backup.PreSnapshot1500File)
	if err != nil {
		t.Fatalf("SnapshotNamed: %v", err)
	}
	if info.Name != "feeder-pre-1500.db" || info.Size <= 0 {
		t.Errorf("info = %+v", info)
	}
	if st, err := os.Stat(filepath.Join(dir, "feeder-pre-1500.db")); err != nil || st.Mode().Perm() != 0o600 {
		t.Errorf("stat = %v, %v; want a 0600 file", st, err)
	}
	if infos, _ := backup.List(dir); len(infos) != 3 {
		t.Errorf("List = %d entries, want the 3 daily snapshots only", len(infos))
	}
	if _, ok := backup.ParseName("feeder-pre-1500.db"); ok {
		t.Error("ParseName must not recognise feeder-pre-1500.db")
	}
	if _, err := backup.Prune(dir, "2026-11-03", backup.Policy{Daily: 1}); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, "feeder-pre-1500.db")); err != nil {
		t.Errorf("Prune removed the pre-1500 snapshot: %v", err)
	}
	if _, err := os.Stat(filepath.Join(dir, "feeder-pre-1400.db")); !os.IsNotExist(err) {
		t.Errorf("writing the 1500 snapshot must not create the 1400 one (stat err = %v)", err)
	}
}
