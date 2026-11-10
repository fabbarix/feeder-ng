package backup_test

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/backup"
)

// days returns snapshot names for the n days ending at last (inclusive).
func days(last string, n int) []string {
	end, _ := time.Parse("2006-01-02", last)
	var out []string
	for i := n - 1; i >= 0; i-- {
		out = append(out, backup.FileName(end.AddDate(0, 0, -i).Format("2006-01-02")))
	}
	return out
}

func joined(names []string) string { return strings.Join(names, " ") }

// 2026-11-09 is a Monday. 40 daily snapshots: 2026-10-01 .. 2026-11-09.
func TestSelectKeepsSevenDailyAndFourWeekly(t *testing.T) {
	names := days("2026-11-09", 40)
	keep, remove := backup.Select(names, "2026-11-09", backup.DefaultPolicy)

	wantKeep := []string{
		// 7 daily
		"2026-11-09", "2026-11-08", "2026-11-07", "2026-11-06", "2026-11-05", "2026-11-04", "2026-11-03",
		// newest of each of the 4 most recent ISO weeks among the older ones:
		// W45 (Mon 11-02), W44 (ends Sun 11-01), W43 (10-25), W42 (10-18)
		"2026-11-02", "2026-11-01", "2026-10-25", "2026-10-18",
	}
	var want []string
	for _, d := range wantKeep {
		want = append(want, backup.FileName(d))
	}
	if joined(keep) != joined(want) {
		t.Errorf("keep =\n %s\nwant\n %s", joined(keep), joined(want))
	}
	if len(keep)+len(remove) != 40 {
		t.Errorf("keep %d + remove %d != 40", len(keep), len(remove))
	}
	if len(remove) != 29 {
		t.Errorf("remove %d, want 29", len(remove))
	}
}

func TestSelectKeepsEverythingWhenThereAreFewSnapshots(t *testing.T) {
	names := days("2026-11-09", 5)
	keep, remove := backup.Select(names, "2026-11-09", backup.DefaultPolicy)
	if len(keep) != 5 || len(remove) != 0 {
		t.Errorf("keep %d remove %d", len(keep), len(remove))
	}
}

func TestSelectKeepsOneSnapshotPerOlderWeekEvenWithGaps(t *testing.T) {
	// The Feeder was off for a while: snapshots on 5 days of the last 7, then sparse ones.
	names := []string{
		"feeder-2026-11-09.db", "feeder-2026-11-08.db", "feeder-2026-11-06.db", "feeder-2026-11-05.db",
		"feeder-2026-11-04.db", "feeder-2026-11-03.db", "feeder-2026-11-02.db", // 7 newest = daily
		"feeder-2026-10-29.db", "feeder-2026-10-28.db", // W44: keep 10-29
		"feeder-2026-10-14.db", // W42: keep
		"feeder-2026-09-01.db", // W36: keep (3rd weekly)
		"feeder-2026-08-01.db", // W31: keep (4th weekly)
		"feeder-2026-07-01.db", // a 5th week: removed
	}
	keep, remove := backup.Select(names, "2026-11-09", backup.DefaultPolicy)
	if len(remove) != 2 || !strings.Contains(joined(remove), "feeder-2026-10-28.db") || !strings.Contains(joined(remove), "feeder-2026-07-01.db") {
		t.Errorf("remove = %v, want 10-28 (not its week's newest) and 07-01 (a fifth week)", remove)
	}
	if len(keep) != 11 {
		t.Errorf("keep %d, want 11: %v", len(keep), keep)
	}
	for _, n := range []string{"feeder-2026-10-29.db", "feeder-2026-10-14.db", "feeder-2026-09-01.db", "feeder-2026-08-01.db"} {
		if !strings.Contains(joined(keep), n) {
			t.Errorf("%s should be kept (newest of its week)", n)
		}
	}
	if strings.Contains(joined(keep), "feeder-2026-10-28.db") {
		t.Error("10-28 is not the newest of its week")
	}
}

func TestSelectIgnoresNamesThatAreNotSnapshots(t *testing.T) {
	names := append(days("2026-11-09", 10), "feeder.db", "notes.txt", "feeder-2026-11-09.db-wal")
	keep, remove := backup.Select(names, "2026-11-09", backup.Policy{Daily: 2, Weekly: 0})
	for _, n := range append(keep, remove...) {
		if !strings.HasPrefix(n, "feeder-2026-") || strings.HasSuffix(n, "-wal") {
			t.Errorf("foreign name in result: %s", n)
		}
	}
	if len(keep) != 2 || len(remove) != 8 {
		t.Errorf("keep %d remove %d", len(keep), len(remove))
	}
}

func TestSelectNeverRemovesTodaysSnapshot(t *testing.T) {
	names := []string{"feeder-2026-11-09.db"}
	if _, remove := backup.Select(names, "2026-11-09", backup.Policy{Daily: 0, Weekly: 0}); len(remove) != 0 {
		t.Errorf("today's snapshot selected for removal: %v", remove)
	}
}

func TestPruneDeletesOnlyTheSelectedSnapshotFiles(t *testing.T) {
	dir := t.TempDir()
	for _, n := range days("2026-11-09", 40) {
		os.WriteFile(filepath.Join(dir, n), []byte("x"), 0o600)
	}
	for _, n := range []string{"notes.txt", "feeder.db"} {
		os.WriteFile(filepath.Join(dir, n), []byte("keep me"), 0o600)
	}
	removed, err := backup.Prune(dir, "2026-11-09", backup.DefaultPolicy)
	if err != nil {
		t.Fatal(err)
	}
	if len(removed) != 29 {
		t.Errorf("removed %d, want 29", len(removed))
	}
	entries, _ := os.ReadDir(dir)
	if len(entries) != 11+2 {
		var got []string
		for _, e := range entries {
			got = append(got, e.Name())
		}
		t.Errorf("%d files left: %s", len(entries), fmt.Sprint(got))
	}
	for _, n := range []string{"notes.txt", "feeder.db"} {
		if _, err := os.Stat(filepath.Join(dir, n)); err != nil {
			t.Errorf("%s was deleted", n)
		}
	}
}

func TestPruneOfAMissingDirIsNotAnError(t *testing.T) {
	if _, err := backup.Prune(filepath.Join(t.TempDir(), "nope"), "2026-11-09", backup.DefaultPolicy); err != nil {
		t.Errorf("err = %v", err)
	}
}
