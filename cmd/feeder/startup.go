package main

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log/slog"
	"os"
	"path/filepath"

	"github.com/fabbarix/feeder-ng/internal/backup"
	"github.com/fabbarix/feeder-ng/internal/db"
)

// preSnapshot is one verified snapshot taken before a group of migrations. need reports whether it is
// due for the database and the migration set fsys; take is then written with backup.SnapshotNamed.
type preSnapshot struct {
	file      string // name under <data>/backups
	migration string // the migrations it precedes, for the log and errors
	keep      bool   // an existing file is never replaced (a snapshot holds the true database from before its migrations)
	need      func(ctx context.Context, d *sql.DB, fsys fs.FS) (bool, error)
}

// preSnapshots is the ordered table run before any migration (docs/dev/design/crs-plan.md §1.3,
// docs/dev/design/b5-snap.md, docs/dev/design/b6-snap.md, docs/dev/design/b7-snap.md). 1400 first, then 1500, then 1540, then 1550.
var preSnapshots = []preSnapshot{
	{
		file:      backup.PreSnapshotFile,
		migration: "1400",
		need: func(ctx context.Context, d *sql.DB, _ fs.FS) (bool, error) {
			return db.NeedsPre1400Snapshot(ctx, d)
		},
	},
	{
		file:      backup.PreSnapshot1500File,
		migration: "1500",
		keep:      true,
		need: func(ctx context.Context, d *sql.DB, fsys fs.FS) (bool, error) {
			return db.NeedsSnapshotFor(ctx, d, fsys, db.Pre1500Prefixes)
		},
	},
	{
		file:      backup.PreSnapshot1540File,
		migration: "1540",
		keep:      true,
		need: func(ctx context.Context, d *sql.DB, fsys fs.FS) (bool, error) {
			return db.NeedsSnapshotFor(ctx, d, fsys, db.Pre1540Prefixes)
		},
	},
	{
		file:      backup.PreSnapshot1550File,
		migration: "1550",
		keep:      true,
		need: func(ctx context.Context, d *sql.DB, fsys fs.FS) (bool, error) {
			return db.NeedsSnapshotFor(ctx, d, fsys, db.Pre1550Prefixes)
		},
	},
}

// prepareDatabase is what run calls between db.Open and the app: for each pre-migration snapshot that is due
// (see preSnapshots), it takes the verified copy <dataDir>/backups/<file> with backup.SnapshotNamed before any
// migration runs, and logs one line. A failure stops start-up and migrates nothing. Then db.Migrate applies the
// embedded set (docs/dev/design/crs-plan.md §1.3). A fresh install takes no snapshot.
func prepareDatabase(ctx context.Context, d *sql.DB, dataDir string, logger *slog.Logger) error {
	return prepareDatabaseWith(ctx, d, dataDir, logger, db.Migrations())
}

// prepareDatabaseWith is prepareDatabase over the migration set fsys (tests pass synthetic migration files).
// A 1500 or 1540 snapshot that already exists is never replaced (keep): it is the true database from before its migrations.
// The 1400 one is taken again while 1400 is pending.
func prepareDatabaseWith(ctx context.Context, d *sql.DB, dataDir string, logger *slog.Logger, fsys fs.FS) error {
	dir := filepath.Join(dataDir, backup.DirName)
	for _, s := range preSnapshots {
		if _, err := os.Stat(filepath.Join(dir, s.file)); s.keep && err == nil {
			continue // already taken: keep it
		}
		need, err := s.need(ctx, d, fsys)
		if err != nil {
			return err
		}
		if !need {
			continue
		}
		if _, err := backup.SnapshotNamed(ctx, d, dir, s.file); err != nil {
			logger.Error("snapshot before migration "+s.migration+" failed, start-up stopped", "file", s.file, "error", err)
			return fmt.Errorf("snapshot %s before migration %s: %w", s.file, s.migration, err)
		}
		logger.Info("took the snapshot before migration "+s.migration, "file", filepath.Join(dir, s.file))
	}
	return db.Migrate(ctx, d, fsys)
}
