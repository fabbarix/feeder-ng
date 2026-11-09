package db_test

import (
	"context"
	"database/sql"
	"path/filepath"
	"strings"
	"testing"
	"testing/fstest"

	"github.com/fabbarix/feeder-ng/internal/db"
)

func openTemp(t *testing.T) (*sql.DB, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "sub", "feeder.db")
	d, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	return d, path
}

func TestOpenSetsWALAndForeignKeysOnEveryConnection(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	// Hold several connections open at once so the pool must create more than one.
	for i := 0; i < 4; i++ {
		c, err := d.Conn(ctx)
		if err != nil {
			t.Fatal(err)
		}
		defer c.Close()
		var mode string
		if err := c.QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&mode); err != nil || mode != "wal" {
			t.Fatalf("conn %d journal_mode = %q (%v), want wal", i, mode, err)
		}
		var fk int
		if err := c.QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&fk); err != nil || fk != 1 {
			t.Fatalf("conn %d foreign_keys = %d (%v), want 1", i, fk, err)
		}
	}
}

func TestMigrateAppliesInFilenameOrderAndIsIdempotent(t *testing.T) {
	d, _ := openTemp(t)
	fsys := fstest.MapFS{
		// Deliberately listed out of order: filename order must win.
		"0002_b.sql":    {Data: []byte("INSERT INTO t(v) VALUES ('second');")},
		"0001_a.sql":    {Data: []byte("CREATE TABLE t(id INTEGER PRIMARY KEY, v TEXT); INSERT INTO t(v) VALUES ('first');")},
		"0100_c.sql":    {Data: []byte("INSERT INTO t(v) VALUES ('third');")},
		"README.md":     {Data: []byte("ignored")},
		"notes.sql.bak": {Data: []byte("THIS IS NOT SQL")},
	}
	ctx := context.Background()
	for run := 1; run <= 2; run++ {
		if err := db.Migrate(ctx, d, fsys); err != nil {
			t.Fatalf("run %d: %v", run, err)
		}
	}
	rows, err := d.Query("SELECT v FROM t ORDER BY id")
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var got []string
	for rows.Next() {
		var v string
		rows.Scan(&v)
		got = append(got, v)
	}
	if strings.Join(got, ",") != "first,second,third" {
		t.Fatalf("rows = %v, want each migration applied exactly once in order", got)
	}
	var n int
	d.QueryRow("SELECT count(*) FROM schema_migrations").Scan(&n)
	if n != 3 {
		t.Fatalf("schema_migrations rows = %d, want 3", n)
	}
	var name string
	if err := d.QueryRow("SELECT name FROM schema_migrations ORDER BY name LIMIT 1").Scan(&name); err != nil || name != "0001_a.sql" {
		t.Fatalf("first recorded = %q (%v), want 0001_a.sql", name, err)
	}
}

func TestMigrateAppliesOnlyNewFilesOnLaterRuns(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	fsys := fstest.MapFS{"0001_a.sql": {Data: []byte("CREATE TABLE t(v TEXT); INSERT INTO t VALUES ('a');")}}
	if err := db.Migrate(ctx, d, fsys); err != nil {
		t.Fatal(err)
	}
	fsys["0002_b.sql"] = &fstest.MapFile{Data: []byte("INSERT INTO t VALUES ('b');")}
	if err := db.Migrate(ctx, d, fsys); err != nil {
		t.Fatal(err)
	}
	var n int
	d.QueryRow("SELECT count(*) FROM t").Scan(&n)
	if n != 2 {
		t.Fatalf("t has %d rows, want 2 (0001 must not run again)", n)
	}
}

func TestMigrateFailureRollsBackThatFileAndNamesIt(t *testing.T) {
	d, _ := openTemp(t)
	fsys := fstest.MapFS{
		"0001_ok.sql":    {Data: []byte("CREATE TABLE ok(id INTEGER);")},
		"0002_bad.sql":   {Data: []byte("CREATE TABLE half(id INTEGER); INSERT INTO nope VALUES (1);")},
		"0003_never.sql": {Data: []byte("CREATE TABLE never(id INTEGER);")},
	}
	err := db.Migrate(context.Background(), d, fsys)
	if err == nil || !strings.Contains(err.Error(), "0002_bad.sql") {
		t.Fatalf("err = %v, want error naming 0002_bad.sql", err)
	}
	tableExists := func(name string) bool {
		var n int
		d.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", name).Scan(&n)
		return n == 1
	}
	if !tableExists("ok") {
		t.Error("0001 must stay applied")
	}
	if tableExists("half") {
		t.Error("the failing migration must be rolled back entirely")
	}
	if tableExists("never") {
		t.Error("migrations after the failing one must not run")
	}
	var n int
	d.QueryRow("SELECT count(*) FROM schema_migrations WHERE name='0002_bad.sql'").Scan(&n)
	if n != 0 {
		t.Error("a failed migration must not be recorded")
	}
}

func TestMigrateEmbeddedCreatesAuthTables(t *testing.T) {
	d, _ := openTemp(t)
	ctx := context.Background()
	for run := 0; run < 2; run++ {
		if err := db.MigrateEmbedded(ctx, d); err != nil {
			t.Fatal(err)
		}
	}
	for _, table := range []string{"users", "sessions", "schema_migrations"} {
		var n int
		d.QueryRow("SELECT count(*) FROM sqlite_master WHERE type='table' AND name=?", table).Scan(&n)
		if n != 1 {
			t.Errorf("table %s missing after MigrateEmbedded", table)
		}
	}
	// users.email is unique, case-insensitively.
	if _, err := d.Exec("INSERT INTO users(email, display_name, is_admin, created_at) VALUES ('A@x.test','A',0,'2026-11-09T12:00:00Z')"); err != nil {
		t.Fatal(err)
	}
	if _, err := d.Exec("INSERT INTO users(email, display_name, is_admin, created_at) VALUES ('a@x.test','A2',0,'2026-11-09T12:00:00Z')"); err == nil {
		t.Error("duplicate email (different case) must be rejected")
	}
}
