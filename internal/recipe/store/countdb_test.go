package store_test

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	ingstore "github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/recipe/store"

	_ "modernc.org/sqlite" // the driver the counting connector wraps
)

// BR-B round 3: a Base recipe fixture whose database handle counts the statements matching a test, so a read can be
// pinned to "one catalog load". It is the shape of internal/testkit's QueryCounter (BR-F), over a plain store
// database instead of the app Env.

type queryCounter struct{ n atomic.Int64 }

func (c *queryCounter) Count() int { return int(c.n.Load()) }
func (c *queryCounter) Reset()     { c.n.Store(0) }

// catalogLoad matches the one statement only a catalog load runs: every Unit Conversion, with no WHERE.
func catalogLoad(q string) bool {
	return strings.Contains(q, "FROM ingredient_conversions") && !strings.Contains(q, "WHERE")
}

// newCountingBaseFixture is newBaseFixture on a handle that counts the statements for which match is true.
func newCountingBaseFixture(t *testing.T, match func(string) bool) (*bf, *queryCounter) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "feeder.db")
	d, err := db.Open(path)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	dsn := "file:" + path + "?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_txlock=immediate"
	probe, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	inner := probe.Driver()
	probe.Close()
	c := &queryCounter{}
	cd := sql.OpenDB(countConnector{dsn: dsn, inner: inner, match: match, c: c})
	t.Cleanup(func() { cd.Close() })
	clk := clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC))
	f := &fixture{db: cd, clk: clk}
	ings := ingstore.New(cd, clk, ingstore.WithBaseRecipes(store.NewBaseRecipePort(cd)))
	f.s = store.New(cd, clk, ingredients{cd}).WithIngredients(ings).WithReadyMeal(readyAdapter{ings})
	return &bf{fixture: f, ings: ings}, c
}

type countConnector struct {
	dsn   string
	inner driver.Driver
	match func(string) bool
	c     *queryCounter
}

func (k countConnector) Connect(context.Context) (driver.Conn, error) {
	conn, err := k.inner.Open(k.dsn)
	if err != nil {
		return nil, err
	}
	return &countConn{Conn: conn, k: k}, nil
}

func (k countConnector) Driver() driver.Driver { return k.inner }

type countConn struct {
	driver.Conn
	k countConnector
}

func (c *countConn) note(q string) {
	if c.k.match(strings.TrimSpace(q)) {
		c.k.c.n.Add(1)
	}
}

func (c *countConn) Prepare(q string) (driver.Stmt, error) {
	c.note(q)
	return c.Conn.Prepare(q)
}

func (c *countConn) PrepareContext(ctx context.Context, q string) (driver.Stmt, error) {
	c.note(q)
	if p, ok := c.Conn.(driver.ConnPrepareContext); ok {
		return p.PrepareContext(ctx, q)
	}
	return c.Conn.Prepare(q)
}

func (c *countConn) QueryContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Rows, error) {
	qc, ok := c.Conn.(driver.QueryerContext)
	if !ok {
		return nil, driver.ErrSkip // database/sql falls back to PrepareContext, which counts
	}
	c.note(q)
	return qc.QueryContext(ctx, q, args)
}

func (c *countConn) ExecContext(ctx context.Context, q string, args []driver.NamedValue) (driver.Result, error) {
	if ec, ok := c.Conn.(driver.ExecerContext); ok {
		return ec.ExecContext(ctx, q, args)
	}
	return nil, driver.ErrSkip
}

func (c *countConn) BeginTx(ctx context.Context, o driver.TxOptions) (driver.Tx, error) {
	if b, ok := c.Conn.(driver.ConnBeginTx); ok {
		return b.BeginTx(ctx, o)
	}
	return c.Conn.Begin()
}

func (c *countConn) Ping(ctx context.Context) error {
	if p, ok := c.Conn.(driver.Pinger); ok {
		return p.Ping(ctx)
	}
	return nil
}

func (c *countConn) ResetSession(ctx context.Context) error {
	if r, ok := c.Conn.(driver.SessionResetter); ok {
		return r.ResetSession(ctx)
	}
	return nil
}
