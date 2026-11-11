package clock

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// RowQuerier is satisfied by *sql.DB and *sql.Tx.
type RowQuerier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
}

// HouseholdToday is the date (YYYY-MM-DD) of clk's now in the Household's time zone, read through q (so a
// caller's transaction is honoured). With no settings row, or a zone that does not load, the zone is UTC.
func HouseholdToday(ctx context.Context, q RowQuerier, clk Clock) (string, error) {
	loc := time.UTC
	var tz string
	err := q.QueryRowContext(ctx, `SELECT time_zone FROM household_settings WHERE id = 1`).Scan(&tz)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return "", err
	}
	if err == nil {
		if l, lerr := time.LoadLocation(tz); lerr == nil {
			loc = l
		}
	}
	return clk.Now().In(loc).Format("2006-01-02"), nil
}
