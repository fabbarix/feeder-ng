// Package store is the SQL repository for Stock Lots and waste records. The
// rules (deduction order, Stock-take, spoiled) live in the pure stock package;
// the store only loads lots, hands them to a pure function and saves the result.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Source says how a Stock Lot came into Stock.
type Source string

const (
	SourceScan      Source = "scan"
	SourceStockTake Source = "stock_take"
	SourceManual    Source = "manual"
)

// Reason says why waste was recorded.
type Reason string

const (
	ReasonSpoiled           Reason = "spoiled"
	ReasonLeftoverDiscarded Reason = "leftover_discarded"
)

var (
	// ErrNotFound is returned for an unknown Stock Lot.
	ErrNotFound = errors.New("stock lot not found")
	// ErrDuplicateUUID is returned if a client UUID is reused for a different Ingredient.
	ErrDuplicateUUID = errors.New("client uuid already used for another Stock Lot")
)

// StoredLot is a Stock Lot as persisted.
type StoredLot struct {
	stock.Lot
	Source     Source
	ProductID  *int64
	ShopID     *int64
	ClientUUID string // "" when none
	CreatedAt  time.Time
}

// NewLot is a Stock Lot to insert. GoesOff is computed by the caller (stock.NewLot).
type NewLot struct {
	IngredientID int64
	Quantity     float64
	Purchased    stock.Date
	GoesOff      stock.Date
	Source       Source
	ProductID    *int64
	ShopID       *int64
	ClientUUID   string
}

// WasteRecord is one wasted quantity. IngredientID is nil only for discarded
// Leftovers that have no single Ingredient.
type WasteRecord struct {
	ID           int64
	IngredientID *int64
	Quantity     float64
	WastedOn     stock.Date
	Reason       Reason
	LotID        *int64
	// LotGoesOff is the thrown-out Lot's go-off date when it had already gone off
	// and was not forgiven by a Keep (R11c); None otherwise. The streak counts
	// such waste on LotGoesOff+1, the day the Lot went off, not on WastedOn.
	LotGoesOff stock.Date
}

// Mutation is what Update persists: the Ingredient's resulting lots (same ID =
// update, ID missing = delete, ID 0 = insert with NewSource) and waste to record,
// all in one transaction.
//
// Today (R11c) is the household date. When set, every deleted Lot that had already gone off
// unforgiven on that date (GoesOff+1 <= Today and GoesOff+1 > KeptOn) and is not the LotID of a
// Waste record of this Mutation gets a go-off record (see GoOffs), however it was removed. Left
// None, no go-off is recorded.
type Mutation struct {
	Lots      []stock.Lot
	NewSource Source
	Waste     []WasteRecord
	Today     stock.Date
}

// GoOffRecord is the persisted go-off of a Lot that was removed from Stock without a Throw out
// (used up by Cooked or counted away by a Stock-take) after it had gone off unforgiven (R11c).
// The zero-waste streak counts it on GoesOff+1. It is not waste: it has no quantity and never
// appears in Waste.
type GoOffRecord struct {
	LotID      int64
	GoesOff    stock.Date // the Lot's go-off date when it was removed
	RecordedOn stock.Date // household date it was recorded (Mutation.Today)
}

// GoOffs lists the go-off records, oldest go-off first (R11c).
func (s *Store) GoOffs(ctx context.Context) ([]GoOffRecord, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT lot_id, goes_off, recorded_on FROM stock_go_offs ORDER BY goes_off, lot_id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []GoOffRecord
	for rows.Next() {
		var r GoOffRecord
		var g, on string
		if err := rows.Scan(&r.LotID, &g, &on); err != nil {
			return nil, err
		}
		r.GoesOff, r.RecordedOn = stock.Date(g), stock.Date(on)
		out = append(out, r)
	}
	return out, rows.Err()
}

// Store is the Stock repository.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store.
func New(db *sql.DB, clk clock.Clock) *Store { return &Store{db: db, clk: clk} }

const lotColumns = `id, ingredient_id, quantity, purchased, goes_off, source, product_id, shop_id, client_uuid, created_at, kept_on`

// AddLot inserts a lot. If ClientUUID is set and a lot with it exists, that lot
// is returned with created=false and nothing is inserted (idempotent offline scans).
func (s *Store) AddLot(ctx context.Context, n NewLot) (lot StoredLot, created bool, err error) {
	if n.ClientUUID != "" {
		existing, found, err := s.lotByUUID(ctx, s.db, n.ClientUUID)
		if err != nil {
			return StoredLot{}, false, err
		}
		if found {
			if existing.IngredientID != n.IngredientID {
				return StoredLot{}, false, ErrDuplicateUUID
			}
			return existing, false, nil
		}
	}
	src := n.Source
	if src == "" {
		src = SourceManual
	}
	res, err := s.db.ExecContext(ctx, `INSERT INTO stock_lots
		(ingredient_id, quantity, purchased, goes_off, source, product_id, shop_id, client_uuid, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		n.IngredientID, n.Quantity, string(n.Purchased), nullDate(n.GoesOff), string(src),
		nullInt(n.ProductID), nullInt(n.ShopID), nullString(n.ClientUUID), s.now())
	if err != nil {
		if n.ClientUUID != "" && isUnique(err) {
			// A concurrent scan with the same UUID won the race: return its lot.
			existing, found, lerr := s.lotByUUID(ctx, s.db, n.ClientUUID)
			if lerr == nil && found {
				return existing, false, nil
			}
		}
		return StoredLot{}, false, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return StoredLot{}, false, err
	}
	lot, err = s.Lot(ctx, id)
	return lot, err == nil, err
}

// Lot returns one lot, or ErrNotFound.
func (s *Store) Lot(ctx context.Context, id int64) (StoredLot, error) {
	row := s.db.QueryRowContext(ctx, `SELECT `+lotColumns+` FROM stock_lots WHERE id = ?`, id)
	l, err := scanLot(row)
	if errors.Is(err, sql.ErrNoRows) {
		return StoredLot{}, ErrNotFound
	}
	return l, err
}

// Lots lists lots of one Ingredient (0 = every Ingredient), ordered by go-off
// date (none last), then purchase date, then ID.
func (s *Store) Lots(ctx context.Context, ingredientID int64) ([]StoredLot, error) {
	return queryLots(ctx, s.db, ingredientID)
}

// LotsTx lists every Stock Lot (all Ingredients) inside tx, in the order Lots uses. Planning reads the projection
// inside its own transaction, after it has deducted Stock in it.
func (s *Store) LotsTx(ctx context.Context, tx *sql.Tx) ([]StoredLot, error) {
	return queryLots(ctx, tx, 0)
}

// Begin starts a transaction for callers that group several store calls
// (UpdateTx) into one all-or-nothing change.
func (s *Store) Begin(ctx context.Context) (*sql.Tx, error) {
	return s.db.BeginTx(ctx, nil)
}

// Update runs fn on the Ingredient's current lots inside one transaction and
// persists the Mutation it returns. If fn returns an error nothing changes and
// the error is returned as is. The saved lots are returned (new lots with IDs).
func (s *Store) Update(ctx context.Context, ingredientID int64, fn func([]stock.Lot) (Mutation, error)) ([]StoredLot, error) {
	tx, err := s.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()

	saved, err := s.UpdateTx(ctx, tx, ingredientID, fn)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return saved, nil
}

// UpdateTx is Update inside the caller's transaction: it never begins, commits
// or rolls back, so the changes commit or roll back with tx. Used by Planning
// to deduct Stock in the same transaction as the Planned Meal's Cooked change.
// If fn returns an error, or any statement fails, the error is returned and the
// caller is expected to roll tx back.
func (s *Store) UpdateTx(ctx context.Context, tx *sql.Tx, ingredientID int64, fn func([]stock.Lot) (Mutation, error)) ([]StoredLot, error) {
	current, err := queryLots(ctx, tx, ingredientID)
	if err != nil {
		return nil, err
	}
	plain := make([]stock.Lot, len(current))
	for i, l := range current {
		plain[i] = l.Lot
	}
	m, err := fn(plain)
	if err != nil {
		return nil, err
	}

	kept := map[int64]bool{}
	for _, l := range m.Lots {
		if l.ID != 0 {
			kept[l.ID] = true
		}
	}
	thrown := map[int64]bool{}
	for _, w := range m.Waste {
		if w.LotID != nil {
			thrown[*w.LotID] = true
		}
	}
	for _, l := range current {
		if !kept[l.ID] {
			// A Lot that had gone off unforgiven keeps its go-off for the streak (R11c); a Throw
			// out counts through its waste record instead.
			if e := l.GoesOff.AddDays(1); !m.Today.IsNone() && !l.GoesOff.IsNone() && !thrown[l.ID] &&
				e <= m.Today && e > l.KeptOn {
				if _, err := tx.ExecContext(ctx, `INSERT OR IGNORE INTO stock_go_offs (lot_id, goes_off, recorded_on) VALUES (?, ?, ?)`,
					l.ID, string(l.GoesOff), string(m.Today)); err != nil {
					return nil, err
				}
			}
			if _, err := tx.ExecContext(ctx, `DELETE FROM stock_lots WHERE id = ? AND ingredient_id = ?`, l.ID, ingredientID); err != nil {
				return nil, err
			}
		}
	}
	src := m.NewSource
	if src == "" {
		src = SourceManual
	}
	for _, l := range m.Lots {
		if l.ID == 0 {
			if _, err := tx.ExecContext(ctx, `INSERT INTO stock_lots
				(ingredient_id, quantity, purchased, goes_off, source, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
				ingredientID, l.Quantity, string(l.Purchased), nullDate(l.GoesOff), string(src), s.now()); err != nil {
				return nil, err
			}
			continue
		}
		res, err := tx.ExecContext(ctx, `UPDATE stock_lots SET quantity = ?, purchased = ?, goes_off = ?, kept_on = ?
			WHERE id = ? AND ingredient_id = ?`,
			l.Quantity, string(l.Purchased), nullDate(l.GoesOff), nullDate(l.KeptOn), l.ID, ingredientID)
		if err != nil {
			return nil, err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return nil, ErrNotFound
		}
	}
	for _, w := range m.Waste {
		if _, err := insertWaste(ctx, tx, w, s.now()); err != nil {
			return nil, err
		}
	}
	return queryLots(ctx, tx, ingredientID)
}

// DeleteLot removes one Stock Lot whole (Undo of a scan); ErrNotFound for an unknown lot.
func (s *Store) DeleteLot(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM stock_lots WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// AddWaste records waste.
func (s *Store) AddWaste(ctx context.Context, w WasteRecord) (WasteRecord, error) {
	return insertWaste(ctx, s.db, w, s.now())
}

// AddWasteTx records a waste row inside the caller's transaction.
func (s *Store) AddWasteTx(ctx context.Context, tx *sql.Tx, w WasteRecord) (WasteRecord, error) {
	return insertWaste(ctx, tx, w, s.now())
}

// Waste lists waste records with WastedOn in [from, to] (an empty bound is
// open), ordered by date then ID.
func (s *Store) Waste(ctx context.Context, from, to stock.Date) ([]WasteRecord, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, ingredient_id, quantity, wasted_on, reason, lot_id, lot_goes_off
		FROM stock_waste
		WHERE (? = '' OR wasted_on >= ?) AND (? = '' OR wasted_on <= ?)
		ORDER BY wasted_on, id`, string(from), string(from), string(to), string(to))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []WasteRecord{}
	for rows.Next() {
		var (
			w      WasteRecord
			ing    sql.NullInt64
			lot    sql.NullInt64
			goes   sql.NullString
			on     string
			reason string
		)
		if err := rows.Scan(&w.ID, &ing, &w.Quantity, &on, &reason, &lot, &goes); err != nil {
			return nil, err
		}
		w.WastedOn = stock.Date(on)
		w.Reason = Reason(reason)
		w.IngredientID = optInt(ing)
		w.LotID = optInt(lot)
		w.LotGoesOff = stock.Date(goes.String)
		out = append(out, w)
	}
	return out, rows.Err()
}

// queryer is satisfied by *sql.DB and *sql.Tx.
type queryer interface {
	QueryContext(ctx context.Context, query string, args ...any) (*sql.Rows, error)
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func queryLots(ctx context.Context, q queryer, ingredientID int64) ([]StoredLot, error) {
	rows, err := q.QueryContext(ctx, `SELECT `+lotColumns+` FROM stock_lots
		WHERE (? = 0 OR ingredient_id = ?)
		ORDER BY (goes_off IS NULL), goes_off, purchased, id`, ingredientID, ingredientID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StoredLot{}
	for rows.Next() {
		l, err := scanLot(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, l)
	}
	return out, rows.Err()
}

func (s *Store) lotByUUID(ctx context.Context, q queryer, uuid string) (StoredLot, bool, error) {
	row := q.QueryRowContext(ctx, `SELECT `+lotColumns+` FROM stock_lots WHERE client_uuid = ?`, uuid)
	l, err := scanLot(row)
	if errors.Is(err, sql.ErrNoRows) {
		return StoredLot{}, false, nil
	}
	if err != nil {
		return StoredLot{}, false, err
	}
	return l, true, nil
}

func insertWaste(ctx context.Context, q queryer, w WasteRecord, createdAt string) (WasteRecord, error) {
	switch w.Reason {
	case ReasonSpoiled, ReasonLeftoverDiscarded:
	default:
		return WasteRecord{}, fmt.Errorf("stock: unknown waste reason %q", w.Reason)
	}
	res, err := q.ExecContext(ctx, `INSERT INTO stock_waste
		(ingredient_id, quantity, wasted_on, reason, lot_id, lot_goes_off, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		nullInt(w.IngredientID), w.Quantity, string(w.WastedOn), string(w.Reason), nullInt(w.LotID), nullDate(w.LotGoesOff), createdAt)
	if err != nil {
		return WasteRecord{}, err
	}
	w.ID, err = res.LastInsertId()
	return w, err
}

type scanner interface{ Scan(dest ...any) error }

func scanLot(r scanner) (StoredLot, error) {
	var (
		l                     StoredLot
		goesOff, client, kept sql.NullString
		product, shop         sql.NullInt64
		purchased, src, stamp string
	)
	if err := r.Scan(&l.ID, &l.IngredientID, &l.Quantity, &purchased, &goesOff, &src,
		&product, &shop, &client, &stamp, &kept); err != nil {
		return StoredLot{}, err
	}
	l.Purchased = stock.Date(purchased)
	l.GoesOff = stock.Date(goesOff.String)
	l.KeptOn = stock.Date(kept.String)
	l.Source = Source(src)
	l.ProductID = optInt(product)
	l.ShopID = optInt(shop)
	l.ClientUUID = client.String
	created, err := time.Parse(time.RFC3339, stamp)
	if err != nil {
		return StoredLot{}, fmt.Errorf("stock: bad created_at %q: %w", stamp, err)
	}
	l.CreatedAt = created
	return l, nil
}

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

func nullDate(d stock.Date) sql.NullString {
	return sql.NullString{String: string(d), Valid: !d.IsNone()}
}

func nullInt(p *int64) sql.NullInt64 {
	if p == nil {
		return sql.NullInt64{}
	}
	return sql.NullInt64{Int64: *p, Valid: true}
}

func nullString(s string) sql.NullString {
	return sql.NullString{String: s, Valid: s != ""}
}

func optInt(n sql.NullInt64) *int64 {
	if !n.Valid {
		return nil
	}
	v := n.Int64
	return &v
}

func isUnique(err error) bool {
	return err != nil && strings.Contains(err.Error(), "UNIQUE constraint failed")
}
