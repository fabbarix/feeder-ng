package service

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"sort"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	householdstore "github.com/fabbarix/feeder-ng/internal/household/store"
	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// SQLEvents is the Events port over the scan ledger (scan_events), the Products, the Ingredients and the Shops. It
// returns the applied scans that are not undone among the given uuids, with the household date each was made on (a
// scan stamped after today counts as today, as the scan service stores it), and the Context of the session.
type SQLEvents struct {
	db  *sql.DB
	clk clock.Clock
}

// NewSQLEvents returns the SQL adapter of the Events port.
func NewSQLEvents(db *sql.DB, clk clock.Clock) *SQLEvents { return &SQLEvents{db: db, clk: clk} }

// uuidChunk bounds the placeholders of one query (SQLite's variable limit is far above it).
const uuidChunk = 500

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

// Session loads the session of a Shop by the phone's client UUIDs.
func (e *SQLEvents) Session(ctx context.Context, shopID int64, uuids []string) (Session, error) {
	hs, err := householdstore.New(e.db, e.clk).Settings(ctx)
	if err != nil {
		return Session{}, err
	}
	loc := time.UTC
	if hs.TimeZone != "" {
		if l, err := time.LoadLocation(hs.TimeZone); err == nil {
			loc = l
		}
	}
	today := e.clk.Now().In(loc).Format("2006-01-02")
	out := Session{Context: receipt.Context{Today: today, SessionDate: today, Currency: hs.Currency, MinorDigits: MinorDigits(hs.Currency)}}
	if out.Context.Shops, err = e.shops(ctx); err != nil {
		return Session{}, err
	}
	for _, s := range out.Context.Shops {
		if s.ID == shopID {
			out.Context.SessionShop = s
		}
	}

	type stamped struct {
		seq int64
		ev  receipt.ScanEvent
	}
	var found []stamped
	for start := 0; start < len(uuids); start += uuidChunk {
		part := uuids[start:min(start+uuidChunk, len(uuids))]
		rows, err := e.query(ctx, part)
		if err != nil {
			return Session{}, err
		}
		for _, r := range rows {
			ev := r.ev
			ev.Date = dateOf(r.scannedAt, loc, today)
			if err := e.weigh(ctx, &ev); err != nil {
				return Session{}, err
			}
			found = append(found, stamped{seq: r.seq, ev: ev})
		}
	}
	sort.Slice(found, func(i, j int) bool { return found[i].seq < found[j].seq })
	out.Events = make([]receipt.ScanEvent, 0, len(found))
	for _, f := range found {
		out.Events = append(out.Events, f.ev)
	}
	return out, nil
}

type ledgerRow struct {
	seq       int64
	scannedAt string
	ev        receipt.ScanEvent
}

// query reads the applied, not undone scans among uuids, joined with their Product and Ingredient. A scan's weighed
// flag comes from its day's Price row (see weigh), not from the ledger.
func (e *SQLEvents) query(ctx context.Context, uuids []string) ([]ledgerRow, error) {
	if len(uuids) == 0 {
		return nil, nil
	}
	args := make([]any, len(uuids))
	marks := make([]string, len(uuids))
	for i, u := range uuids {
		args[i], marks[i] = u, "?"
	}
	rows, err := e.db.QueryContext(ctx, `SELECT e.seq, e.client_uuid, e.scanned_at, e.shop_id, e.product_id, e.quantity,
		e.price_cents, p.name, p.pack_size, i.base_unit,
		COALESCE((SELECT MIN(b.code) FROM product_barcodes b WHERE b.product_id = p.id), '')
		FROM scan_events e
		JOIN products p ON p.id = e.product_id
		JOIN ingredients i ON i.id = p.ingredient_id
		WHERE e.client_uuid IN (`+strings.Join(marks, ",")+`)
		  AND e.kind IN ('shop_scan', 'shop_unknown') AND e.undone_at IS NULL`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ledgerRow
	for rows.Next() {
		var (
			r                       ledgerRow
			shop, product, price    sql.NullInt64
			quantity, packSize      float64
			name, baseUnit, barcode string
		)
		if err := rows.Scan(&r.seq, &r.ev.UUID, &r.scannedAt, &shop, &product, &quantity, &price, &name, &packSize, &baseUnit, &barcode); err != nil {
			return nil, err
		}
		r.ev.ProductID, r.ev.Product, r.ev.Barcode, r.ev.BaseUnit = product.Int64, name, barcode, baseUnit
		r.ev.PackSize, r.ev.Quantity, r.ev.ShopID = int(math.Round(packSize)), quantity, shop.Int64
		r.ev.PriceCents, r.ev.PerKgCents = -1, -1
		if price.Valid {
			r.ev.PriceCents = int(price.Int64)
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// weigh marks a scan weighed when the Price of its Product at its Shop on its date has a price per kg (the rule the
// scan service writes it with). The per kg is then the scan's PerKgCents; the Price per scan stays as stored.
func (e *SQLEvents) weigh(ctx context.Context, ev *receipt.ScanEvent) error {
	var perKg sql.NullInt64
	err := e.db.QueryRowContext(ctx, `SELECT price_per_kg_cents FROM prices
		WHERE product_id = ? AND shop_id = ? AND date = ?`, ev.ProductID, ev.ShopID, ev.Date).Scan(&perKg)
	if errors.Is(err, sql.ErrNoRows) {
		return nil
	}
	if err != nil {
		return err
	}
	if perKg.Valid {
		ev.Weighed, ev.PerKgCents = true, int(perKg.Int64)
	}
	return nil
}

// shops lists the saved Shops.
func (e *SQLEvents) shops(ctx context.Context) ([]receipt.Shop, error) {
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

// dateOf is the household date a scan was made on, never later than today (the scan service's rule).
func dateOf(scannedAt string, loc *time.Location, today string) string {
	t, err := time.Parse(time.RFC3339, scannedAt)
	if err != nil {
		return today
	}
	d := t.In(loc).Format("2006-01-02")
	if d > today {
		return today
	}
	return d
}
