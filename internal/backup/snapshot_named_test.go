package backup_test

import (
	"context"
	"database/sql"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/backup"
	"github.com/fabbarix/feeder-ng/internal/db"
)

// backup.SnapshotNamed writes feeder-pre-1400.db before migration 1400 (docs/dev/design/crs-plan.md §1.3, team A).

const pre1400 = "feeder-pre-1400.db"

func addUser(t *testing.T, d *sql.DB, email string) {
	t.Helper()
	if _, err := d.Exec(`INSERT INTO users(email, display_name, is_admin, created_at) VALUES (?, 'A', 1, '2026-11-09T00:00:00Z')`, email); err != nil {
		t.Fatal(err)
	}
}

func TestSnapshotNamedWritesAVerifiedPrivateCopy(t *testing.T) {
	d := openDB(t)
	addUser(t, d, "anna@example.test")
	dir := filepath.Join(t.TempDir(), "backups") // does not exist yet
	info, err := backup.SnapshotNamed(context.Background(), d, dir, pre1400)
	if err != nil {
		t.Fatal(err)
	}
	if info.Name != pre1400 || info.Size <= 0 {
		t.Errorf("info = %+v", info)
	}
	st, err := os.Stat(filepath.Join(dir, pre1400))
	if err != nil {
		t.Fatal(err)
	}
	if st.Mode().Perm() != 0o600 {
		t.Errorf("snapshot mode = %v, want 0600", st.Mode().Perm())
	}
	if dst, _ := os.Stat(dir); dst.Mode().Perm() != 0o700 {
		t.Errorf("folder mode = %v, want 0700", dst.Mode().Perm())
	}
	snap, err := db.Open(filepath.Join(dir, pre1400))
	if err != nil {
		t.Fatal(err)
	}
	defer snap.Close()
	var email, res string
	if err := snap.QueryRow(`SELECT email FROM users`).Scan(&email); err != nil || email != "anna@example.test" {
		t.Errorf("snapshot has %q, %v", email, err)
	}
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil || res != "ok" {
		t.Errorf("integrity_check = %q, %v", res, err)
	}
	entries, _ := os.ReadDir(dir)
	for _, e := range entries {
		if e.Name() != pre1400 {
			t.Errorf("stray file %q left in the folder (temporary files must go)", e.Name())
		}
	}
}

func TestSnapshotNamedRefusesEveryNameOutsideThePattern(t *testing.T) {
	d := openDB(t)
	dir := t.TempDir()
	for _, name := range []string{
		"", "feeder-2026-11-11.db", "feeder-pre-14.db", "feeder-pre-14000.db", "feeder-pre-abcd.db", "feeder-pre-1400.db.bak",
		"Feeder-pre-1400.db", "feeder-pre-1400.DB", "feeder-pre-1400.db ", " feeder-pre-1400.db", "../feeder-pre-1400.db",
		"sub/feeder-pre-1400.db", "feeder-pre-1400.db\n", "feeder.db", "feeder-pre-.db",
	} {
		if _, err := backup.SnapshotNamed(context.Background(), d, dir, name); err == nil {
			t.Errorf("SnapshotNamed accepted %q", name)
		}
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("a refused name wrote %d files", len(entries))
	}
	// Other four-digit names fit the pattern: the pattern is the contract, not the number 1400.
	if _, err := backup.SnapshotNamed(context.Background(), d, dir, "feeder-pre-1500.db"); err != nil {
		t.Errorf("feeder-pre-1500.db: %v", err)
	}
}

func TestSnapshotNamedReplacesAnExistingFileOfItsName(t *testing.T) {
	d := openDB(t)
	dir := t.TempDir()
	ctx := context.Background()
	if err := os.WriteFile(filepath.Join(dir, pre1400), []byte("an older copy"), 0o600); err != nil {
		t.Fatal(err)
	}
	addUser(t, d, "newer@example.test")
	if _, err := backup.SnapshotNamed(ctx, d, dir, pre1400); err != nil {
		t.Fatal(err)
	}
	snap, err := db.Open(filepath.Join(dir, pre1400))
	if err != nil {
		t.Fatal(err)
	}
	defer snap.Close()
	var n int
	if err := snap.QueryRow(`SELECT count(*) FROM users WHERE email = 'newer@example.test'`).Scan(&n); err != nil || n != 1 {
		t.Errorf("the file was not replaced by the newer copy: %d, %v", n, err)
	}
}

func TestSnapshotNamedFailureKeepsTheOldFileAndLeavesNoPartialOne(t *testing.T) {
	d := openDB(t)
	dir := t.TempDir()
	if err := os.WriteFile(filepath.Join(dir, pre1400), []byte("the older copy"), 0o600); err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := backup.SnapshotNamed(ctx, d, dir, pre1400); err == nil {
		t.Fatal("a cancelled context must fail")
	}
	got, _ := os.ReadFile(filepath.Join(dir, pre1400))
	if string(got) != "the older copy" {
		t.Errorf("a failed snapshot changed the existing file: %q", got)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 {
		t.Errorf("%d files in the folder after a failed snapshot, want just the old one", len(entries))
	}
}

func TestPre1400SnapshotIsNotListedAndNeverPruned(t *testing.T) {
	d := openDB(t)
	dir := t.TempDir()
	ctx := context.Background()
	for _, day := range []string{"2026-11-01", "2026-11-02", "2026-11-03"} {
		if _, err := backup.Snapshot(ctx, d, dir, day); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := backup.SnapshotNamed(ctx, d, dir, pre1400); err != nil {
		t.Fatal(err)
	}
	infos, err := backup.List(dir)
	if err != nil {
		t.Fatal(err)
	}
	if len(infos) != 3 {
		t.Fatalf("List = %d entries, want the 3 daily snapshots only", len(infos))
	}
	for _, i := range infos {
		if strings.Contains(i.Name, "pre") {
			t.Errorf("List shows %s", i.Name)
		}
	}
	if _, ok := backup.ParseName(pre1400); ok {
		t.Error("ParseName must not recognise feeder-pre-1400.db")
	}
	// Prune with a policy that keeps one daily snapshot removes the older dailies and leaves the pre-1400 file alone.
	removed, err := backup.Prune(dir, "2026-11-03", backup.Policy{Daily: 1, Weekly: 0})
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != 2 {
		t.Errorf("Prune removed %v, want the two older dailies", removed)
	}
	if _, err := os.Stat(filepath.Join(dir, pre1400)); err != nil {
		t.Errorf("Prune removed the pre-1400 snapshot: %v", err)
	}
	// The nightly job prunes too and must leave it.
	if err := backup.Job(d, dir)(ctx, "2026-11-20"); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(dir, pre1400)); err != nil {
		t.Errorf("the nightly job removed the pre-1400 snapshot: %v", err)
	}
}

func TestSnapshotNamedAndSnapshotShareTheFolderLock(t *testing.T) {
	d := openDB(t)
	dir := t.TempDir()
	ctx := context.Background()
	errs := make(chan error, 8)
	for i := 0; i < 4; i++ {
		go func() { _, err := backup.SnapshotNamed(ctx, d, dir, pre1400); errs <- err }()
		go func() { _, err := backup.Snapshot(ctx, d, dir, "2026-11-09"); errs <- err }()
	}
	for i := 0; i < 8; i++ {
		if err := <-errs; err != nil {
			t.Errorf("concurrent snapshot: %v", err)
		}
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 2 {
		t.Errorf("%d files after concurrent snapshots, want the two final ones (no temporary files)", len(entries))
	}
}
