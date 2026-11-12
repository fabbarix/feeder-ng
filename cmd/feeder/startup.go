package main

import (
	"context"
	"database/sql"
	"fmt"
	"io/fs"
	"log/slog"
	"path/filepath"

	"github.com/fabbarix/feeder-ng/internal/backup"
	"github.com/fabbarix/feeder-ng/internal/db"
)

// prepareDatabase is what run calls between db.Open and the app: when db.NeedsPre1400Snapshot, it takes the
// verified snapshot <dataDir>/backups/feeder-pre-1400.db with backup.SnapshotNamed (a failure stops start-up
// before any migration runs, and logs one line), then db.MigrateEmbedded (docs/dev/design/crs-plan.md §1.3).
// A fresh install, or a database that already has 1400, takes no snapshot.
func prepareDatabase(ctx context.Context, d *sql.DB, dataDir string, logger *slog.Logger) error {
	return prepareDatabaseWith(ctx, d, dataDir, logger, db.Migrations())
}

// prepareDatabaseWith is prepareDatabase over the migration set fsys (tests pass a synthetic 1500 and 1510).
// STUB (b5-snap test author): still only the pre-1400 snapshot; the developer adds feeder-pre-1500.db.
func prepareDatabaseWith(ctx context.Context, d *sql.DB, dataDir string, logger *slog.Logger, fsys fs.FS) error {
	need, err := db.NeedsPre1400Snapshot(ctx, d)
	if err != nil {
		return err
	}
	if need {
		dir := filepath.Join(dataDir, backup.DirName)
		if _, err := backup.SnapshotNamed(ctx, d, dir, backup.PreSnapshotFile); err != nil {
			logger.Error("snapshot before migration 1400 failed, start-up stopped", "file", backup.PreSnapshotFile, "error", err)
			return fmt.Errorf("snapshot %s before migration 1400: %w", backup.PreSnapshotFile, err)
		}
		logger.Info("took the snapshot before migration 1400", "file", filepath.Join(dir, backup.PreSnapshotFile))
	}
	return db.Migrate(ctx, d, fsys)
}
