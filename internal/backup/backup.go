// Package backup takes nightly SQLite snapshots of the Feeder database into
// <data>/backups with VACUUM INTO and prunes old ones (spec §1, ADR 0004).
package backup

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"sync"
	"time"

	_ "modernc.org/sqlite" // the "sqlite" driver used to verify a copy
)

// NightlyAt is the household-local time of the nightly job (before planning's 03:00).
const NightlyAt = "02:30"

// DirName is the folder under the data directory.
const DirName = "backups"

// Policy says how many snapshots to keep.
type Policy struct {
	Daily  int // the newest N snapshots
	Weekly int // of the older ones, the newest of each of the N most recent ISO weeks
}

// DefaultPolicy keeps 7 daily snapshots plus 4 weekly ones.
var DefaultPolicy = Policy{Daily: 7, Weekly: 4}

// Info describes one snapshot file.
type Info struct {
	Name      string // feeder-YYYY-MM-DD.db
	Day       string // YYYY-MM-DD
	Size      int64
	CreatedAt time.Time // file modification time
}

const dayLayout = "2006-01-02"

// FileName returns the snapshot file name for a household day.
func FileName(day string) string { return "feeder-" + day + ".db" }

var nameRE = regexp.MustCompile(`^feeder-(\d{4}-\d{2}-\d{2})\.db$`)

// ParseName returns the day in a snapshot file name, or false for any other name.
func ParseName(name string) (day string, ok bool) {
	m := nameRE.FindStringSubmatch(name)
	if m == nil {
		return "", false
	}
	if _, err := time.Parse(dayLayout, m[1]); err != nil {
		return "", false
	}
	return m[1], true
}

// folderLocks serialises the jobs that write to one backup folder: the nightly
// job and an Admin's "back up now" can overlap, and must queue rather than
// collide on the temporary file or prune each other's snapshot. Keyed by the
// cleaned folder name, so every caller for the same folder shares one lock.
var (
	folderLocksMu sync.Mutex
	folderLocks   = map[string]*sync.Mutex{}
)

func lockFolder(dir string) (unlock func()) {
	key := filepath.Clean(dir)
	folderLocksMu.Lock()
	m, ok := folderLocks[key]
	if !ok {
		m = &sync.Mutex{}
		folderLocks[key] = m
	}
	folderLocksMu.Unlock()
	m.Lock()
	return m.Unlock
}

// Snapshot writes a consistent copy of db to <dir>/feeder-<day>.db: VACUUM INTO
// a temporary file in dir, check it with PRAGMA integrity_check, then rename
// into place (replacing a same-day snapshot). dir is created when missing. A
// failed snapshot leaves no partial file behind. The folder is 0700 and the
// snapshot 0600: it holds every password hash and session.
func Snapshot(ctx context.Context, db *sql.DB, dir, day string) (Info, error) {
	unlock := lockFolder(dir)
	defer unlock()
	return snapshot(ctx, db, dir, day)
}

// snapshot is Snapshot without the folder lock (the caller holds it).
func snapshot(ctx context.Context, db *sql.DB, dir, day string) (Info, error) {
	if !validDay(day) {
		return Info{}, fmt.Errorf("backup: day %q is not a YYYY-MM-DD date", day)
	}
	return writeFile(ctx, db, dir, FileName(day), day)
}

// writeFile is the copy-verify-rename of a snapshot into <dir>/<name> (the caller holds the folder lock).
func writeFile(ctx context.Context, db *sql.DB, dir, name, day string) (Info, error) {
	if err := ctx.Err(); err != nil {
		return Info{}, err
	}
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return Info{}, fmt.Errorf("backup: create %s: %w", dir, err)
	}
	tmp := filepath.Join(dir, "."+name+".tmp")
	final := filepath.Join(dir, name)
	_ = os.Remove(tmp)
	if _, err := db.ExecContext(ctx, `VACUUM INTO ?`, tmp); err != nil {
		_ = os.Remove(tmp)
		return Info{}, fmt.Errorf("backup: copy: %w", err)
	}
	if err := os.Chmod(tmp, 0o600); err != nil {
		_ = os.Remove(tmp)
		return Info{}, fmt.Errorf("backup: protect copy: %w", err)
	}
	if err := verify(ctx, tmp); err != nil {
		_ = os.Remove(tmp)
		return Info{}, err
	}
	if err := os.Rename(tmp, final); err != nil {
		_ = os.Remove(tmp)
		return Info{}, fmt.Errorf("backup: place %s: %w", final, err)
	}
	st, err := os.Stat(final)
	if err != nil {
		return Info{}, err
	}
	return Info{Name: name, Day: day, Size: st.Size(), CreatedAt: st.ModTime()}, nil
}

var preSnapshotRE = regexp.MustCompile(`^feeder-pre-\d{4}\.db$`)

// SnapshotNamed writes a consistent copy of db to <dir>/<name> exactly like Snapshot (VACUUM INTO a
// temporary file in dir, integrity_check, 0600, rename, the same folder lock), for a name matching
// ^feeder-pre-\d{4}\.db$ only; anything else is an error, so it can never overwrite a daily snapshot. An
// existing file of that name is replaced. The result has Name set, Day empty. The file is not listed by
// List and never pruned (nameRE does not match it).
func SnapshotNamed(ctx context.Context, db *sql.DB, dir, name string) (Info, error) {
	if !preSnapshotRE.MatchString(name) {
		return Info{}, fmt.Errorf("backup: %q is not a pre-migration snapshot name", name)
	}
	unlock := lockFolder(dir)
	defer unlock()
	return writeFile(ctx, db, dir, name, "")
}

// verify opens the copy read-only in spirit (its own connection) and runs the
// integrity check. The connection is closed before the file is renamed.
func verify(ctx context.Context, path string) error {
	d, err := sql.Open("sqlite", "file:"+path+"?mode=ro")
	if err != nil {
		return fmt.Errorf("backup: open copy: %w", err)
	}
	defer d.Close()
	var res string
	if err := d.QueryRowContext(ctx, `PRAGMA integrity_check`).Scan(&res); err != nil {
		return fmt.Errorf("backup: check copy: %w", err)
	}
	if res != "ok" {
		return fmt.Errorf("backup: copy failed the integrity check: %s", res)
	}
	return nil
}

func validDay(day string) bool {
	t, err := time.Parse(dayLayout, day)
	return err == nil && t.Format(dayLayout) == day
}

// Select splits snapshot file names into those to keep and those to remove
// under policy, as of day today. Names that are not snapshot names are in
// neither list. Both lists are sorted newest first. Today's snapshot is never
// removed. Pure.
func Select(names []string, today string, p Policy) (keep, remove []string) {
	type snap struct{ name, day string }
	var snaps []snap
	for _, n := range names {
		if day, ok := ParseName(n); ok {
			snaps = append(snaps, snap{n, day})
		}
	}
	sort.Slice(snaps, func(i, j int) bool { return snaps[i].day > snaps[j].day })

	var older []snap
	for i, s := range snaps {
		if i < p.Daily || s.day == today {
			keep = append(keep, s.name)
			continue
		}
		older = append(older, s)
	}
	// Of the older snapshots, the newest of each ISO week, for the newest Weekly weeks.
	kept := map[string]bool{}
	weeks := map[string]bool{}
	for _, s := range older { // newest first: the first of each week is its newest
		t, _ := time.Parse(dayLayout, s.day)
		y, w := t.ISOWeek()
		key := fmt.Sprintf("%d-%02d", y, w)
		if weeks[key] {
			continue
		}
		if len(weeks) >= p.Weekly {
			break
		}
		weeks[key] = true
		kept[s.name] = true
	}
	for _, s := range older {
		if kept[s.name] {
			keep = append(keep, s.name)
		} else {
			remove = append(remove, s.name)
		}
	}
	sort.SliceStable(keep, func(i, j int) bool { return keep[i] > keep[j] })
	sort.SliceStable(remove, func(i, j int) bool { return remove[i] > remove[j] })
	return keep, remove
}

// Prune deletes the snapshots in dir that Select says to remove and returns
// their names. It never touches other files.
func Prune(dir, today string, p Policy) (removed []string, err error) {
	infos, err := List(dir)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(infos))
	for _, i := range infos {
		names = append(names, i.Name)
	}
	_, remove := Select(names, today, p)
	for _, n := range remove {
		if err := os.Remove(filepath.Join(dir, n)); err != nil && !errors.Is(err, os.ErrNotExist) {
			return removed, fmt.Errorf("backup: remove %s: %w", n, err)
		}
		removed = append(removed, n)
	}
	return removed, nil
}

// List returns the snapshots in dir, newest first. A missing dir is an empty list.
func List(dir string) ([]Info, error) {
	entries, err := os.ReadDir(dir)
	if errors.Is(err, os.ErrNotExist) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	var out []Info
	for _, e := range entries {
		day, ok := ParseName(e.Name())
		if !ok || e.IsDir() {
			continue
		}
		fi, err := e.Info()
		if err != nil {
			return nil, err
		}
		out = append(out, Info{Name: e.Name(), Day: day, Size: fi.Size(), CreatedAt: fi.ModTime()})
	}
	sort.Slice(out, func(i, j int) bool { return out[i].Day > out[j].Day })
	return out, nil
}

// Job returns the scheduler job body: Snapshot for the household day, then
// Prune with DefaultPolicy.
func Job(db *sql.DB, dir string) func(ctx context.Context, day string) error {
	return func(ctx context.Context, day string) error {
		unlock := lockFolder(dir)
		defer unlock()
		if _, err := snapshot(ctx, db, dir, day); err != nil {
			return err
		}
		_, err := Prune(dir, day, DefaultPolicy)
		return err
	}
}

// PreSnapshotFile is the name of the snapshot taken before migration 1400 (docs/dev/design/crs-plan.md §1.3).
const PreSnapshotFile = "feeder-pre-1400.db"

// PreSnapshot1500File is the name of the snapshot taken before the beta.5 migrations 1500 to 1530
// (docs/dev/design/b5-snap.md). SnapshotNamed already accepts it; List and Prune never see it.
const PreSnapshot1500File = "" // STUB (b5-snap test author): the developer sets "feeder-pre-1500.db"
