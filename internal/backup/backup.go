// Package backup takes nightly SQLite snapshots of the Feeder database into
// <data>/backups with VACUUM INTO and prunes old ones (spec §1, ADR 0004).
package backup

import (
	"context"
	"database/sql"
	"errors"
	"time"
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

// FileName returns the snapshot file name for a household day.
func FileName(day string) string { return "feeder-" + day + ".db" }

// ParseName returns the day in a snapshot file name, or false for any other name.
// Not implemented yet.
func ParseName(name string) (day string, ok bool) { return "", false }

// Snapshot writes a consistent copy of db to <dir>/feeder-<day>.db: VACUUM INTO
// a temporary file in dir, check it with PRAGMA integrity_check, then rename
// into place (replacing a same-day snapshot). dir is created when missing. A
// failed snapshot leaves no partial file behind. Not implemented yet.
func Snapshot(ctx context.Context, db *sql.DB, dir, day string) (Info, error) {
	return Info{}, errors.New("backup.Snapshot: not implemented")
}

// Select splits snapshot file names into those to keep and those to remove
// under policy, as of day today. Names that are not snapshot names are in
// neither list. Both lists are sorted newest first. Pure. Not implemented yet.
func Select(names []string, today string, p Policy) (keep, remove []string) { return nil, nil }

// Prune deletes the snapshots in dir that Select says to remove and returns
// their names. It never touches other files. Not implemented yet.
func Prune(dir, today string, p Policy) (removed []string, err error) {
	return nil, errors.New("backup.Prune: not implemented")
}

// List returns the snapshots in dir, newest first. A missing dir is an empty list.
// Not implemented yet.
func List(dir string) ([]Info, error) { return nil, errors.New("backup.List: not implemented") }

// Job returns the scheduler job body: Snapshot for the household day, then
// Prune with DefaultPolicy. Not implemented yet.
func Job(db *sql.DB, dir string) func(ctx context.Context, day string) error {
	return func(context.Context, string) error { return errors.New("backup.Job: not implemented") }
}
