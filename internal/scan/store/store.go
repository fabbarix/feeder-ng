// Package store is the scan ledger over `scan_events` (migrations 0800, 0801): idempotency by client UUID, Undo
// state and the totals behind the "Shopping list complete" celebration.
package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

var (
	// ErrDuplicate is returned by Insert for a client UUID that is already recorded.
	ErrDuplicate = errors.New("scan store: duplicate client uuid")
	// ErrNotFound is returned for an unknown client UUID.
	ErrNotFound = errors.New("scan store: not found")
)

// Event is one applied operation. Seq and AppliedAt are set by Insert.
type Event struct {
	ClientUUID     string
	Kind           string
	ScannedAt      string
	AppliedAt      string
	Seq            int64
	ShopID         *int64
	ProductID      *int64
	IngredientID   *int64
	Quantity       float64
	PriceCents     *int
	RangeTo        stock.Date
	OnList         bool
	Ticked         bool
	LotID          *int64
	PurchaseID     *int64
	SoldAtAdded    bool
	PriceID        *int64
	PrevPriceJSON  string // the same-day Price this event replaced, "" if none
	ProductCreated bool
	MergedInto     *int64
	ExtraID        *int64 // the manual extra the scan counted against
	ResultJSON     string
	UndoneAt       string // "" while not undone
	// UndoSteps are the Undo steps that already ran (UndoStep* constants, in the order they ran), kept so a retried
	// Undo skips them. Empty before Undo starts; UndoneAt is set after the last one.
	UndoSteps []string
}

// The steps of an Undo, in the order the service runs them.
const (
	UndoStepList     = "list"     // the Shopping List line or extra gets the quantity back
	UndoStepLot      = "lot"      // the Stock Lot is removed
	UndoStepPurchase = "purchase" // the purchase is deleted
	UndoStepPrice    = "price"    // the Price is deleted or the replaced one restored
	UndoStepSoldAt   = "sold_at"  // the Product is un-sold at the Shop (only if this scan linked it)
)

// Store is the ledger.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store.
func New(db *sql.DB, clk clock.Clock) *Store { return &Store{db: db, clk: clk} }

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

const eventColumns = `client_uuid, kind, scanned_at, applied_at, seq, shop_id, product_id, ingredient_id, quantity,
	price_cents, range_to, on_list, ticked, lot_id, purchase_id, sold_at_added, price_id, prev_price_json,
	product_created, merged_into, extra_id, result_json, undone_at, undo_steps`

// Insert records an applied operation (ErrDuplicate when the client UUID exists). It sets AppliedAt (now) and Seq (1, 2, ... in insert order).
func (s *Store) Insert(ctx context.Context, e Event) (Event, error) {
	e.AppliedAt = s.now()
	args := []any{
		e.ClientUUID, e.Kind, e.ScannedAt, e.AppliedAt, nullInt(e.ShopID), nullInt(e.ProductID), nullInt(e.IngredientID),
		e.Quantity, nullIntPtr(e.PriceCents), nullDate(e.RangeTo), e.OnList, e.Ticked, nullInt(e.LotID), nullInt(e.PurchaseID),
		e.SoldAtAdded, nullInt(e.PriceID), nullString(e.PrevPriceJSON), e.ProductCreated, nullInt(e.MergedInto), nullInt(e.ExtraID),
		e.ResultJSON,
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO scan_events (client_uuid, kind, scanned_at, applied_at, seq, shop_id, product_id,
		ingredient_id, quantity, price_cents, range_to, on_list, ticked, lot_id, purchase_id, sold_at_added, price_id,
		prev_price_json, product_created, merged_into, extra_id, result_json)
		VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM scan_events), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args...)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			return Event{}, ErrDuplicate
		}
		return Event{}, err
	}
	got, ok, err := s.Get(ctx, e.ClientUUID)
	if err != nil {
		return Event{}, err
	}
	if !ok {
		return Event{}, ErrNotFound
	}
	return got, nil
}

// Get returns an event by client UUID.
func (s *Store) Get(ctx context.Context, clientUUID string) (Event, bool, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+eventColumns+` FROM scan_events WHERE client_uuid = ?`, clientUUID)
	var (
		e                                                                     Event
		shop, product, ingredient, lot, purchase, price, merged, extra, cents sql.NullInt64
		rangeTo, prevPrice, undone, steps                                     sql.NullString
		onList, ticked, soldAt, created                                       bool
		quantity                                                              sql.NullFloat64
	)
	err := row.Scan(&e.ClientUUID, &e.Kind, &e.ScannedAt, &e.AppliedAt, &e.Seq, &shop, &product, &ingredient, &quantity,
		&cents, &rangeTo, &onList, &ticked, &lot, &purchase, &soldAt, &price, &prevPrice, &created, &merged, &extra,
		&e.ResultJSON, &undone, &steps)
	if errors.Is(err, sql.ErrNoRows) {
		return Event{}, false, nil
	}
	if err != nil {
		return Event{}, false, err
	}
	e.ShopID, e.ProductID, e.IngredientID = optInt(shop), optInt(product), optInt(ingredient)
	e.LotID, e.PurchaseID, e.PriceID = optInt(lot), optInt(purchase), optInt(price)
	e.MergedInto, e.ExtraID = optInt(merged), optInt(extra)
	if cents.Valid {
		c := int(cents.Int64)
		e.PriceCents = &c
	}
	e.Quantity = quantity.Float64
	e.RangeTo = stock.Date(rangeTo.String)
	e.OnList, e.Ticked, e.SoldAtAdded, e.ProductCreated = onList, ticked, soldAt, created
	e.PrevPriceJSON = prevPrice.String
	e.UndoneAt = undone.String
	if steps.String != "" {
		e.UndoSteps = strings.Split(steps.String, ",")
	}
	return e, true, nil
}

// MarkUndone sets UndoneAt (now) and reports whether it changed (false when it was already undone; ErrNotFound if unknown).
func (s *Store) MarkUndone(ctx context.Context, clientUUID string) (bool, error) {
	res, err := s.db.ExecContext(ctx, `UPDATE scan_events SET undone_at = ? WHERE client_uuid = ? AND undone_at IS NULL`,
		s.now(), clientUUID)
	if err != nil {
		return false, err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return true, nil
	}
	_, ok, err := s.Get(ctx, clientUUID)
	if err != nil {
		return false, err
	}
	if !ok {
		return false, ErrNotFound
	}
	return false, nil
}

// ReleaseIngredient clears ingredient_id on the undone events among clientUUIDs that reference ingredientID, and returns
// how many it cleared. A live (or half undone) event is never touched: its Undo still needs the Ingredient. It serves the
// put-back of a failed receipt apply (b8-rxgo): the scans the run wrote and put back stay in the ledger as undone (their
// uuids stay taken, receipt-reading §7.2), but no longer hold on to the Ingredient the run created, so it can be removed.
func (s *Store) ReleaseIngredient(ctx context.Context, clientUUIDs []string, ingredientID int64) (int, error) {
	n := 0
	for _, u := range clientUUIDs {
		res, err := s.db.ExecContext(ctx, `UPDATE scan_events SET ingredient_id = NULL
			WHERE client_uuid = ? AND ingredient_id = ? AND undone_at IS NOT NULL`, u, ingredientID)
		if err != nil {
			return n, err
		}
		k, _ := res.RowsAffected()
		n += int(k)
	}
	return n, nil
}

// MarkUndoStep records that an Undo step ran. Idempotent: a step already recorded keeps its one entry, so a
// retried Undo never repeats it. ErrNotFound for an unknown client UUID.
func (s *Store) MarkUndoStep(ctx context.Context, clientUUID, step string) error {
	res, err := s.db.ExecContext(ctx, `UPDATE scan_events
		SET undo_steps = CASE WHEN undo_steps IS NULL OR undo_steps = '' THEN ? ELSE undo_steps || ',' || ? END
		WHERE client_uuid = ? AND (undo_steps IS NULL OR undo_steps = ''
			OR instr(',' || undo_steps || ',', ',' || ? || ',') = 0)`,
		step, step, clientUUID, step)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n > 0 {
		return nil
	}
	_, ok, err := s.Get(ctx, clientUUID)
	if err != nil {
		return err
	}
	if !ok {
		return ErrNotFound
	}
	return nil
}

// UpdatePrice sets the event's price (and the Price row it refers to; priceID nil keeps the one it has).
func (s *Store) UpdatePrice(ctx context.Context, clientUUID string, cents int, priceID *int64) error {
	res, err := s.db.ExecContext(ctx, `UPDATE scan_events SET price_cents = ?, price_id = COALESCE(?, price_id),
		result_json = json_set(result_json, '$.scan.priceCents', ?) WHERE client_uuid = ?`,
		cents, nullInt(priceID), cents, clientUUID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// ErrUndone is returned by UpdatePrices for an event that was undone: the store re-checks it in the transaction.
var ErrUndone = errors.New("scan store: undone")

// PriceUpdate sets the Price of one scan event. PriceID nil keeps the one the event has; PrevPriceJSON nil keeps the
// event's own, and a value replaces it ("" clears it).
type PriceUpdate struct {
	ClientUUID    string
	Cents         int
	PriceID       *int64
	PrevPriceJSON *string
}

// UpdatePrices applies the updates in one transaction: all of them or none (ErrNotFound for an unknown client UUID,
// ErrUndone for one undone in the meantime). json_patch merges the price into result_json's scan object, so the stored
// Result answers the new price too.
func (s *Store) UpdatePrices(ctx context.Context, updates []PriceUpdate) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, u := range updates {
		var prev any = nil
		keepPrev := u.PrevPriceJSON == nil
		if !keepPrev {
			prev = nullString(*u.PrevPriceJSON)
		}
		res, err := tx.ExecContext(ctx, `UPDATE scan_events SET price_cents = ?, price_id = COALESCE(?, price_id),
			prev_price_json = CASE WHEN ? THEN prev_price_json ELSE ? END,
			result_json = json_patch(result_json, json_object('scan', json_object('priceCents', ?)))
			WHERE client_uuid = ? AND undone_at IS NULL`,
			u.Cents, nullInt(u.PriceID), keepPrev, prev, u.Cents, u.ClientUUID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return missingOrUndone(ctx, tx, u.ClientUUID)
		}
	}
	return tx.Commit()
}

// EventPrice is the price state of one scan event, as RestorePrices puts it back: Cents nil is no price.
type EventPrice struct {
	ClientUUID    string
	Cents         *int
	PriceID       *int64
	PrevPriceJSON string
}

// PriceState is the price state of an event (for RestorePrices).
func (e Event) PriceState() EventPrice {
	return EventPrice{ClientUUID: e.ClientUUID, Cents: e.PriceCents, PriceID: e.PriceID, PrevPriceJSON: e.PrevPriceJSON}
}

// RestorePrices puts back the price state of the events exactly (price, Price row, the Price it replaced and the stored
// Result's priceCents), in one transaction. It is the inverse of UpdatePrices; an undone event is restored too, so a
// compensation never stops half way. ErrNotFound for an unknown client UUID.
func (s *Store) RestorePrices(ctx context.Context, states []EventPrice) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, st := range states {
		res, err := tx.ExecContext(ctx, `UPDATE scan_events SET price_cents = ?, price_id = ?, prev_price_json = ?,
			result_json = json_patch(result_json, json_object('scan', json_object('priceCents', ?))) WHERE client_uuid = ?`,
			nullIntPtr(st.Cents), nullInt(st.PriceID), nullString(st.PrevPriceJSON), nullIntPtr(st.Cents), st.ClientUUID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
	}
	return tx.Commit()
}

// SharedPrice reports whether a live (not undone) event other than exceptUUID refers to the Price row priceID, and
// returns the same-day Price the earliest of them replaced (its prev_price_json): the Price of the day before any of
// the live events that share the row wrote it.
func (s *Store) SharedPrice(ctx context.Context, priceID int64, exceptUUID string) (prevJSON string, shared bool, err error) {
	var prev sql.NullString
	err = s.db.QueryRowContext(ctx, `SELECT prev_price_json FROM scan_events
		WHERE price_id = ? AND client_uuid <> ? AND undone_at IS NULL ORDER BY seq LIMIT 1`, priceID, exceptUUID).Scan(&prev)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, err
	}
	return prev.String, true, nil
}

func missingOrUndone(ctx context.Context, tx *sql.Tx, clientUUID string) error {
	var undone sql.NullString
	err := tx.QueryRowContext(ctx, `SELECT undone_at FROM scan_events WHERE client_uuid = ?`, clientUUID).Scan(&undone)
	switch {
	case errors.Is(err, sql.ErrNoRows):
		return ErrNotFound
	case err != nil:
		return err
	case undone.Valid:
		return ErrUndone
	}
	return ErrNotFound
}

// Totals sums the range's Shop-mode events that are not undone: price_cents and the number of Stock Lots added.
func (s *Store) Totals(ctx context.Context, rangeTo stock.Date) (spentCents, lots int, err error) {
	err = s.db.QueryRowContext(ctx, `SELECT COALESCE(SUM(price_cents), 0), COUNT(lot_id) FROM scan_events
		WHERE range_to = ? AND kind IN ('shop_scan', 'shop_unknown') AND undone_at IS NULL`, string(rangeTo)).Scan(&spentCents, &lots)
	return spentCents, lots, err
}

func nullInt(v *int64) sql.NullInt64 {
	if v == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *v, Valid: true}
}

func nullIntPtr(v *int) any {
	if v == nil {
		return nil
	}
	return *v
}

func nullDate(d stock.Date) sql.NullString {
	return sql.NullString{String: string(d), Valid: d != ""}
}

func nullString(s string) sql.NullString { return sql.NullString{String: s, Valid: s != ""} }

func optInt(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}
