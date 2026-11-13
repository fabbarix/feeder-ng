package service

import (
	"context"
	"database/sql"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// SQLContexts is the Contexts port over the Shops and the household settings: the Context a read of a Shop is matched
// against. The Events port is the scan service's own loader (scan/service.SessionEvents), which the apply uses too.
type SQLContexts struct {
	db  *sql.DB
	clk clock.Clock
}

// NewSQLContexts returns the SQL adapter of the Contexts port.
func NewSQLContexts(db *sql.DB, clk clock.Clock) *SQLContexts { return &SQLContexts{db: db, clk: clk} }

// zeroDigitCurrencies are the ISO 4217 currencies with no minor unit; every other currency has two.
var zeroDigitCurrencies = map[string]bool{"JPY": true, "KRW": true, "VND": true, "CLP": true, "ISK": true,
	"XAF": true, "XOF": true, "UGX": true, "PYG": true}

// MinorDigits is the number of minor digits of a currency.
func MinorDigits(currency string) int {
	if zeroDigitCurrencies[strings.ToUpper(currency)] {
		return 0
	}
	return 2
}

// household is the household's settings, its time zone and today's household date.
func (e *SQLContexts) household(ctx context.Context) (householdSettings, error) {
	hs, err := householdstore.New(e.db, e.clk).Settings(ctx)
	if err != nil {
		return householdSettings{}, err
	}
	loc := time.UTC
	if hs.TimeZone != "" {
		if l, err := time.LoadLocation(hs.TimeZone); err == nil {
			loc = l
		}
	}
	return householdSettings{currency: hs.Currency, loc: loc, today: e.clk.Now().In(loc).Format("2006-01-02")}, nil
}

type householdSettings struct {
	currency string
	loc      *time.Location
	today    string
}

// Context is what a read of the Shop is matched against: today (also the session's date), the Shop, the saved Shops
// and the currency.
func (e *SQLContexts) Context(ctx context.Context, shopID int64) (receipt.Context, error) {
	h, err := e.household(ctx)
	if err != nil {
		return receipt.Context{}, err
	}
	out := receipt.Context{Today: h.today, SessionDate: h.today, Currency: h.currency, MinorDigits: MinorDigits(h.currency)}
	if out.Shops, err = e.shops(ctx); err != nil {
		return receipt.Context{}, err
	}
	for _, s := range out.Shops {
		if s.ID == shopID {
			out.SessionShop = s
		}
	}
	return out, nil
}

// shops lists the saved Shops.
func (e *SQLContexts) shops(ctx context.Context) ([]receipt.Shop, error) {
	rows, err := e.db.QueryContext(ctx, `SELECT id, name FROM shops ORDER BY id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []receipt.Shop
	for rows.Next() {
		var s receipt.Shop
		if err := rows.Scan(&s.ID, &s.Name); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

var _ Contexts = (*SQLContexts)(nil)
