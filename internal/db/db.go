// Package db opens the SQLite database and applies embedded migrations.
package db

import (
	"context"
	"database/sql"
	"embed"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"

	_ "modernc.org/sqlite" // pure-Go SQLite driver ("sqlite")
)

//go:embed migrations/*.sql
var migrationFiles embed.FS

// Open opens (creating if needed) the SQLite database at path. WAL mode,
// foreign keys and a busy timeout are set on every pooled connection.
func Open(path string) (*sql.DB, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return nil, fmt.Errorf("db: create data dir: %w", err)
	}
	dsn := "file:" + path +
		"?_pragma=journal_mode(WAL)" +
		"&_pragma=foreign_keys(1)" +
		"&_pragma=busy_timeout(5000)" +
		"&_txlock=immediate" // BEGIN IMMEDIATE: a transaction takes the write lock up front and waits for it, instead of failing with SQLITE_BUSY_SNAPSHOT when another one committed after its first read
	d, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("db: open %s: %w", path, err)
	}
	if err := d.Ping(); err != nil {
		d.Close()
		return nil, fmt.Errorf("db: open %s: %w", path, err)
	}
	return d, nil
}

// MigrateEmbedded applies the migrations compiled into the binary.
func MigrateEmbedded(ctx context.Context, d *sql.DB) error {
	sub, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		return err
	}
	return Migrate(ctx, d, sub)
}

// Migrate applies every *.sql file at the root of fsys, in filename order, each
// in its own transaction, recording it in schema_migrations. Applied files are
// skipped, so it is idempotent. A failure rolls back that file and is reported
// with its name.
func Migrate(ctx context.Context, d *sql.DB, fsys fs.FS) error {
	if _, err := d.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		name       TEXT PRIMARY KEY,
		applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
	)`); err != nil {
		return fmt.Errorf("db: create schema_migrations: %w", err)
	}
	entries, err := fs.ReadDir(fsys, ".")
	if err != nil {
		return fmt.Errorf("db: read migrations: %w", err)
	}
	var names []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	for _, name := range names {
		var n int
		if err := d.QueryRowContext(ctx, `SELECT count(*) FROM schema_migrations WHERE name = ?`, name).Scan(&n); err != nil {
			return fmt.Errorf("db: check %s: %w", name, err)
		}
		if n > 0 {
			continue
		}
		body, err := fs.ReadFile(fsys, name)
		if err != nil {
			return fmt.Errorf("db: read %s: %w", name, err)
		}
		if err := applyOne(ctx, d, name, string(body)); err != nil {
			return fmt.Errorf("db: migration %s failed: %w", name, err)
		}
	}
	return nil
}

// foreignKeysOffDirective, as the first line of a migration, runs it with foreign keys OFF (a table
// rebuild must not cascade into its children). PRAGMA foreign_keys is a no-op inside a transaction, so
// that migration gets one dedicated connection: pragma first, then the transaction.
const foreignKeysOffDirective = "-- feeder:foreign-keys=off"

func applyOne(ctx context.Context, d *sql.DB, name, body string) error {
	if first, _, _ := strings.Cut(body, "\n"); strings.TrimSpace(first) == foreignKeysOffDirective {
		return applyForeignKeysOff(ctx, d, name, body)
	}
	tx, err := d.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, body); err != nil {
		tx.Rollback()
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(name) VALUES (?)`, name); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}

// applyForeignKeysOff runs one migration on a dedicated connection with foreign_keys OFF. Before the commit it
// checks foreign_key_check and rolls back (naming the offending table) on any violation. foreign_keys is set
// back ON by a defer, so the connection returns to the pool with the pool-wide setting, also on failure.
func applyForeignKeysOff(ctx context.Context, d *sql.DB, name, body string) (err error) {
	conn, err := d.Conn(ctx)
	if err != nil {
		return err
	}
	defer conn.Close() // returns the connection to the pool; runs after the foreign_keys reset below

	if _, err := conn.ExecContext(ctx, `PRAGMA foreign_keys=OFF`); err != nil {
		return err
	}
	defer func() {
		if _, e := conn.ExecContext(context.Background(), `PRAGMA foreign_keys=ON`); e != nil && err == nil {
			err = e
		}
	}()

	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	committed := false
	defer func() {
		if !committed {
			tx.Rollback()
		}
	}()
	if _, err := tx.ExecContext(ctx, body); err != nil {
		return err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO schema_migrations(name) VALUES (?)`, name); err != nil {
		return err
	}
	if err := checkForeignKeys(ctx, tx); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return err
	}
	committed = true
	return nil
}

// checkForeignKeys fails with the first violation foreign_key_check reports (table and row id).
func checkForeignKeys(ctx context.Context, tx *sql.Tx) error {
	rows, err := tx.QueryContext(ctx, `PRAGMA foreign_key_check`)
	if err != nil {
		return err
	}
	defer rows.Close()
	if rows.Next() {
		var table, parent string
		var rowid sql.NullInt64
		var fkid int
		if err := rows.Scan(&table, &rowid, &parent, &fkid); err != nil {
			return err
		}
		return fmt.Errorf("foreign key violation in %s (row %d, parent %s)", table, rowid.Int64, parent)
	}
	return rows.Err()
}

// Migration1400 is the Courses migration (docs/dev/design/crs-plan.md §1.1).
const Migration1400 = "1400_courses.sql"

// Pending reports whether schema_migrations does not record the migration called name yet. A missing
// schema_migrations table (a brand-new file) counts as pending.
func Pending(ctx context.Context, d *sql.DB, name string) (bool, error) {
	var tables int
	if err := d.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'`).Scan(&tables); err != nil {
		return false, fmt.Errorf("db: look for schema_migrations: %w", err)
	}
	if tables == 0 {
		return true, nil
	}
	var recorded int
	if err := d.QueryRowContext(ctx, `SELECT count(*) FROM schema_migrations WHERE name = ?`, name).Scan(&recorded); err != nil {
		return false, fmt.Errorf("db: check %s: %w", name, err)
	}
	return recorded == 0, nil
}

// NeedsPre1400Snapshot reports whether 1400 is pending and a planned_meals table exists with at least
// one row: the only case in which start-up takes the verified snapshot feeder-pre-1400.db first.
func NeedsPre1400Snapshot(ctx context.Context, d *sql.DB) (bool, error) {
	pending, err := Pending(ctx, d, Migration1400)
	if err != nil || !pending {
		return false, err
	}
	var tables int
	if err := d.QueryRowContext(ctx, `SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = 'planned_meals'`).Scan(&tables); err != nil {
		return false, fmt.Errorf("db: look for planned_meals: %w", err)
	}
	if tables == 0 {
		return false, nil
	}
	var rows int
	if err := d.QueryRowContext(ctx, `SELECT count(*) FROM (SELECT 1 FROM planned_meals LIMIT 1)`).Scan(&rows); err != nil {
		return false, fmt.Errorf("db: count planned_meals: %w", err)
	}
	return rows > 0, nil
}

// Pre1500Prefixes are the file-name prefixes of the beta.5 migrations (1500 Slot dates and Guests, 1510 Leftovers,
// 1520 Bought, 1530 Not needed). Any of them pending triggers the snapshot feeder-pre-1500.db
// (docs/dev/design/b5-snap.md).
var Pre1500Prefixes []string // STUB (b5-snap test author): the developer fills it in

// Migrations is the embedded migration set, the same files MigrateEmbedded applies.
func Migrations() fs.FS {
	sub, err := fs.Sub(migrationFiles, "migrations")
	if err != nil {
		panic(err) // the embed pattern guarantees the folder
	}
	return sub
}

// NeedsSnapshotFor reports whether the database already holds applied migrations (a schema_migrations table
// with at least one row: not a brand-new file) while fsys has a *.sql file whose name starts with one of
// prefixes that schema_migrations does not record yet. A fresh install takes no snapshot.
func NeedsSnapshotFor(ctx context.Context, d *sql.DB, fsys fs.FS, prefixes []string) (bool, error) {
	return false, nil // STUB (b5-snap test author)
}

// NeedsPre1500Snapshot is NeedsSnapshotFor over the embedded migrations and Pre1500Prefixes.
func NeedsPre1500Snapshot(ctx context.Context, d *sql.DB) (bool, error) {
	return false, nil // STUB (b5-snap test author)
}
