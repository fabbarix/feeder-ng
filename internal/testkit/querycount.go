package testkit

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"strings"
	"sync/atomic"

	_ "modernc.org/sqlite" // the driver the counting connector wraps
)

// QueryCounter counts the statements of a database that match a substring test. It is the seam for "this read loads the
// catalog once" tests (BR-F round 2): OpenCounting gives a second handle on the Env's database whose queries are counted.
type QueryCounter struct{ n atomic.Int64 }

// Count is the number of matching statements run so far.
func (c *QueryCounter) Count() int { return int(c.n.Load()) }

// Reset sets the count back to zero.
func (c *QueryCounter) Reset() { c.n.Store(0) }

// OpenCounting opens the Env's database file again, through a connector that counts every statement for which match
// returns true (queries and prepares). The handle is closed with the test.
func (e *Env) OpenCounting(t TB, match func(query string) bool) (*sql.DB, *QueryCounter) {
	t.Helper()
	dsn := "file:" + e.Config.DBPath() + "?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)&_pragma=busy_timeout(5000)&_txlock=immediate"
	probe, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatalf("open the counting handle: %v", err)
	}
	inner := probe.Driver()
	probe.Close()
	c := &QueryCounter{}
	d := sql.OpenDB(countConnector{dsn: dsn, inner: inner, match: match, c: c})
	t.Cleanup(func() { d.Close() })
	return d, c
}

type countConnector struct {
	dsn   string
	inner driver.Driver
	match func(string) bool
	c     *QueryCounter
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
