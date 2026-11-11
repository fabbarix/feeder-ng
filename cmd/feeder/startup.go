package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
)

// prepareDatabase is what run calls between db.Open and the app: when db.NeedsPre1400Snapshot, take the
// verified snapshot <dataDir>/backups/feeder-pre-1400.db with backup.SnapshotNamed (a failure stops
// start-up, with the migration not applied and a clear log line), then db.MigrateEmbedded
// (docs/dev/design/crs-plan.md §1.3). A fresh install, or a database that already has 1400, takes no snapshot.
//
// Stub of team A's design step (docs/dev/design/crs-a.md): run still calls db.MigrateEmbedded itself
// until the developer step wires this in.
func prepareDatabase(ctx context.Context, d *sql.DB, dataDir string, logger *slog.Logger) error {
	return errors.New("prepareDatabase: not implemented")
}
