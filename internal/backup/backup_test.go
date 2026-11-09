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

func openDB(t *testing.T) *sql.DB {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	return d
}

func TestSnapshotCopiesTheDatabaseAndTheCopyOpens(t *testing.T) {
	d := openDB(t)
	ctx := context.Background()
	if _, err := d.Exec(`INSERT INTO users(email, display_name, is_admin, created_at) VALUES ('anna@example.test','Anna',1,'2026-11-09T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(t.TempDir(), "backups") // does not exist yet
	info, err := backup.Snapshot(ctx, d, dir, "2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	if info.Name != "feeder-2026-11-09.db" || info.Day != "2026-11-09" || info.Size <= 0 {
		t.Errorf("info %+v", info)
	}
	snap, err := db.Open(filepath.Join(dir, info.Name))
	if err != nil {
		t.Fatalf("snapshot does not open: %v", err)
	}
	defer snap.Close()
	var email string
	if err := snap.QueryRow(`SELECT email FROM users`).Scan(&email); err != nil || email != "anna@example.test" {
		t.Errorf("snapshot has %q, %v", email, err)
	}
	var res string
	if err := snap.QueryRow(`PRAGMA integrity_check`).Scan(&res); err != nil || res != "ok" {
		t.Errorf("integrity_check = %q, %v", res, err)
	}
}

func TestSnapshotLeavesNoTemporaryFilesAndReplacesTheSameDay(t *testing.T) {
	d := openDB(t)
	dir := t.TempDir()
	ctx := context.Background()
	if _, err := backup.Snapshot(ctx, d, dir, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec(`INSERT INTO users(email, display_name, is_admin, created_at) VALUES ('ben@example.test','Ben',0,'2026-11-09T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if _, err := backup.Snapshot(ctx, d, dir, "2026-11-09"); err != nil {
		t.Fatalf("second snapshot of the same day: %v", err)
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 1 || entries[0].Name() != "feeder-2026-11-09.db" {
		var names []string
		for _, e := range entries {
			names = append(names, e.Name())
		}
		t.Fatalf("dir has %v, want only feeder-2026-11-09.db", names)
	}
	snap, _ := db.Open(filepath.Join(dir, entries[0].Name()))
	defer snap.Close()
	var n int
	snap.QueryRow(`SELECT COUNT(*) FROM users`).Scan(&n)
	if n != 1 {
		t.Errorf("the second snapshot should hold Ben (1 user), has %d", n)
	}
}

func TestSnapshotRejectsABadDay(t *testing.T) {
	d := openDB(t)
	for _, day := range []string{"", "2026-13-01", "../etc/passwd", "today"} {
		if _, err := backup.Snapshot(context.Background(), d, t.TempDir(), day); err == nil {
			t.Errorf("day %q accepted", day)
		}
	}
}

func TestSnapshotFailureLeavesNoPartialFile(t *testing.T) {
	d := openDB(t)
	dir := t.TempDir()
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, err := backup.Snapshot(ctx, d, dir, "2026-11-09"); err == nil {
		t.Fatal("want an error from a cancelled context")
	}
	if entries, _ := os.ReadDir(dir); len(entries) != 0 {
		t.Errorf("left %d files behind", len(entries))
	}
}

func TestParseName(t *testing.T) {
	if day, ok := backup.ParseName("feeder-2026-11-09.db"); !ok || day != "2026-11-09" {
		t.Errorf("ParseName = %q, %v", day, ok)
	}
	for _, n := range []string{"feeder.db", "feeder-2026-11-09.db-wal", "feeder-2026-13-40.db", "notes.txt", "feeder-2026-11-09.db.tmp", ".feeder-2026-11-09.db.tmp"} {
		if _, ok := backup.ParseName(n); ok {
			t.Errorf("ParseName(%q) accepted", n)
		}
	}
}

func TestListReturnsSnapshotsNewestFirstAndIgnoresOtherFiles(t *testing.T) {
	dir := t.TempDir()
	for _, n := range []string{"feeder-2026-11-07.db", "feeder-2026-11-09.db", "feeder-2026-11-08.db", "README.txt"} {
		os.WriteFile(filepath.Join(dir, n), []byte("x"), 0o600)
	}
	got, err := backup.List(dir)
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for _, i := range got {
		names = append(names, i.Name)
	}
	if strings.Join(names, ",") != "feeder-2026-11-09.db,feeder-2026-11-08.db,feeder-2026-11-07.db" {
		t.Errorf("List = %v", names)
	}
	if got[0].Size != 1 {
		t.Errorf("size %d", got[0].Size)
	}
}

func TestListOfAMissingDirIsEmpty(t *testing.T) {
	got, err := backup.List(filepath.Join(t.TempDir(), "nope"))
	if err != nil || len(got) != 0 {
		t.Errorf("List = %v, %v", got, err)
	}
}

func TestJobSnapshotsTheDayAndPrunes(t *testing.T) {
	d := openDB(t)
	dir := t.TempDir()
	for i := 1; i <= 9; i++ { // 9 old daily files, 2026-10-01..09
		os.WriteFile(filepath.Join(dir, backup.FileName("2026-10-0"+string(rune('0'+i)))), []byte("x"), 0o600)
	}
	if err := backup.Job(d, dir)(context.Background(), "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	got, _ := backup.List(dir)
	if len(got) == 0 || got[0].Name != "feeder-2026-11-09.db" {
		t.Fatalf("List = %+v", got)
	}
	if len(got) > 11 {
		t.Errorf("%d files kept, policy allows at most 7 + 4", len(got))
	}
}

func TestNightlyJobRunsBeforePlanning(t *testing.T) {
	if backup.NightlyAt != "02:30" {
		t.Errorf("NightlyAt = %q; planning runs at 03:00 and the backup must precede it", backup.NightlyAt)
	}
	if backup.DefaultPolicy != (backup.Policy{Daily: 7, Weekly: 4}) {
		t.Errorf("DefaultPolicy = %+v", backup.DefaultPolicy)
	}
}
