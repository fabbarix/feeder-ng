// Package store is the SQL repository for Shopping List extras, ticks and Not needed marks (migrations 0800, 1530).
package store

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

var (
	// ErrNotFound is returned for an unknown extra.
	ErrNotFound = errors.New("shopping store: not found")
	// ErrInvalid is returned for blank text or a quantity <= 0.
	ErrInvalid = errors.New("shopping store: invalid")
)

// Store keeps manual extras and the ticked state per range.
type Store struct {
	db  *sql.DB
	clk clock.Clock
}

// New returns a Store.
func New(db *sql.DB, clk clock.Clock) *Store { return &Store{db: db, clk: clk} }

func (s *Store) now() string { return s.clk.Now().UTC().Format(time.RFC3339) }

// AddTextExtra adds a free-text extra (text trimmed and whitespace-collapsed; blank is ErrInvalid).
func (s *Store) AddTextExtra(ctx context.Context, text string) (shopping.Extra, error) {
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return shopping.Extra{}, ErrInvalid
	}
	res, err := s.db.ExecContext(ctx, `INSERT INTO shopping_extras (text, created_at) VALUES (?, ?)`, text, s.now())
	if err != nil {
		return shopping.Extra{}, err
	}
	id, err := res.LastInsertId()
	return shopping.Extra{ID: id, Text: text}, err
}

// AddIngredientExtra adds an Ingredient with a quantity in Base Units (> 0, else ErrInvalid).
func (s *Store) AddIngredientExtra(ctx context.Context, ingredientID int64, quantity float64) (shopping.Extra, error) {
	if !(quantity > 0) {
		return shopping.Extra{}, ErrInvalid
	}
	res, err := s.db.ExecContext(ctx, `INSERT INTO shopping_extras (ingredient_id, quantity, got, created_at) VALUES (?, ?, 0, ?)`,
		ingredientID, quantity, s.now())
	if err != nil {
		return shopping.Extra{}, err
	}
	id, err := res.LastInsertId()
	return shopping.Extra{ID: id, IngredientID: ingredientID, Quantity: quantity}, err
}

const extraColumns = `id, text, ingredient_id, quantity, got, ticked_on`

// Extras returns the open extras and those ticked on today, ordered by id.
func (s *Store) Extras(ctx context.Context, today stock.Date) ([]shopping.Extra, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+extraColumns+` FROM shopping_extras
		WHERE ticked_on IS NULL OR ticked_on = ? ORDER BY id`, string(today))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []shopping.Extra{}
	for rows.Next() {
		var (
			e        shopping.Extra
			text     sql.NullString
			ingr     sql.NullInt64
			quantity sql.NullFloat64
			tickedOn sql.NullString
		)
		if err := rows.Scan(&e.ID, &text, &ingr, &quantity, &e.Got, &tickedOn); err != nil {
			return nil, err
		}
		e.Text = text.String
		e.IngredientID = ingr.Int64
		e.Quantity = quantity.Float64
		e.Ticked = tickedOn.Valid
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) exec(ctx context.Context, query string, args ...any) error {
	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// DeleteExtra removes an extra (ErrNotFound).
func (s *Store) DeleteExtra(ctx context.Context, id int64) error {
	return s.exec(ctx, `DELETE FROM shopping_extras WHERE id = ?`, id)
}

// TickExtra marks an extra ticked on today (ErrNotFound) and records no Stock Lot.
func (s *Store) TickExtra(ctx context.Context, id int64, today stock.Date) error {
	return s.exec(ctx, `UPDATE shopping_extras SET ticked_on = ?, tick_lot_id = NULL, tick_lot_quantity = NULL WHERE id = ?`,
		string(today), id)
}

// TickExtraLot marks an extra ticked on today (ErrNotFound) and records the Stock Lot its tick added and the quantity
// it added (beta.8, undo).
func (s *Store) TickExtraLot(ctx context.Context, id int64, today stock.Date, lotID int64, quantity float64) error {
	return s.exec(ctx, `UPDATE shopping_extras SET ticked_on = ?, tick_lot_id = ?, tick_lot_quantity = ? WHERE id = ?`,
		string(today), lotID, quantity, id)
}

// UntickExtra clears the tick and the Stock Lot it recorded (ErrNotFound).
func (s *Store) UntickExtra(ctx context.Context, id int64) error {
	return s.exec(ctx, `UPDATE shopping_extras SET ticked_on = NULL, tick_lot_id = NULL, tick_lot_quantity = NULL WHERE id = ?`, id)
}

// UntickExtraTakenBack clears an Ingredient extra's tick and the Stock Lot it recorded, and takes taken (what Stock took
// back) off its got (floor 0), in one statement, so a retried Undo never takes it off twice (beta.8, undo; ErrNotFound).
func (s *Store) UntickExtraTakenBack(ctx context.Context, id int64, taken float64) error {
	return s.exec(ctx, `UPDATE shopping_extras SET got = MAX(0, got - ?), ticked_on = NULL, tick_lot_id = NULL,
		tick_lot_quantity = NULL WHERE id = ?`, taken, id)
}

// ExtraTickLot returns the Stock Lot an Ingredient extra's tick added and the quantity it added (beta.8, undo). ok is
// false when the tick added no Lot (a text extra, a tick of 0, or a tick from before migration 1560). ErrNotFound for
// an unknown extra.
func (s *Store) ExtraTickLot(ctx context.Context, id int64) (lotID int64, quantity float64, ok bool, err error) {
	var lot sql.NullInt64
	var qty sql.NullFloat64
	err = s.db.QueryRowContext(ctx, `SELECT tick_lot_id, tick_lot_quantity FROM shopping_extras WHERE id = ?`, id).Scan(&lot, &qty)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, 0, false, ErrNotFound
	}
	if err != nil {
		return 0, 0, false, err
	}
	if !lot.Valid {
		return 0, 0, false, nil
	}
	return lot.Int64, lotQuantity(qty), true, nil
}

// AddGot adds delta (may be negative, floor 0) to an Ingredient extra's `got` and returns the extra.
func (s *Store) AddGot(ctx context.Context, id int64, delta float64) (shopping.Extra, error) {
	if err := s.exec(ctx, `UPDATE shopping_extras SET got = MAX(0, got + ?) WHERE id = ?`, delta, id); err != nil {
		return shopping.Extra{}, err
	}
	var e shopping.Extra
	var (
		text     sql.NullString
		ingr     sql.NullInt64
		quantity sql.NullFloat64
		tickedOn sql.NullString
	)
	err := s.db.QueryRowContext(ctx, `SELECT `+extraColumns+` FROM shopping_extras WHERE id = ?`, id).
		Scan(&e.ID, &text, &ingr, &quantity, &e.Got, &tickedOn)
	if errors.Is(err, sql.ErrNoRows) {
		return shopping.Extra{}, ErrNotFound
	}
	if err != nil {
		return shopping.Extra{}, err
	}
	e.Text, e.IngredientID, e.Quantity, e.Ticked = text.String, ingr.Int64, quantity.Float64, tickedOn.Valid
	return e, nil
}

// SetTick ticks an Ingredient for a range (upsert) and records no quantity. lotID is the Stock Lot a tick by hand
// added, if any: with no quantity recorded, Undo takes that Lot back whole. The service uses SetTickLot for a tick by
// hand; a Scan's tick passes nil.
func (s *Store) SetTick(ctx context.Context, rangeTo stock.Date, t shopping.Tick, lotID *int64) error {
	var lot sql.NullInt64
	if lotID != nil {
		lot = sql.NullInt64{Int64: *lotID, Valid: true}
	}
	return s.setTick(ctx, rangeTo, t, lot, sql.NullFloat64{})
}

// SetTickLot ticks an Ingredient by hand for a range and records the Stock Lot it added and the quantity it added
// (beta.8, undo).
func (s *Store) SetTickLot(ctx context.Context, rangeTo stock.Date, t shopping.Tick, lotID int64, quantity float64) error {
	return s.setTick(ctx, rangeTo, t, sql.NullInt64{Int64: lotID, Valid: true}, sql.NullFloat64{Float64: quantity, Valid: true})
}

func (s *Store) setTick(ctx context.Context, rangeTo stock.Date, t shopping.Tick, lot sql.NullInt64, qty sql.NullFloat64) error {
	_, err := s.db.ExecContext(ctx, `INSERT INTO shopping_ticks (range_to, ingredient_id, needed, by, lot_id, lot_quantity, ticked_at)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(range_to, ingredient_id) DO UPDATE SET needed = excluded.needed, by = excluded.by,
			lot_id = excluded.lot_id, lot_quantity = excluded.lot_quantity, ticked_at = excluded.ticked_at`,
		string(rangeTo), t.IngredientID, t.Needed, t.By, lot, qty, s.now())
	return err
}

// DeleteTick unticks an Ingredient for a range (no error when it was not ticked).
func (s *Store) DeleteTick(ctx context.Context, rangeTo stock.Date, ingredientID int64) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM shopping_ticks WHERE range_to = ? AND ingredient_id = ?`, string(rangeTo), ingredientID)
	return err
}

// TickLot returns the Stock Lot a tick by hand added for the range and the quantity it added (beta.8, undo; its records
// go when the Lot is gone). ok is false when there is no tick, or the tick added no Lot (a scan's tick, or a tick with
// 0). A tick from before migration 1560 has no quantity: it reports the Lot's whole quantity as +Inf.
func (s *Store) TickLot(ctx context.Context, rangeTo stock.Date, ingredientID int64) (lotID int64, quantity float64, ok bool, err error) {
	var lot sql.NullInt64
	var qty sql.NullFloat64
	err = s.db.QueryRowContext(ctx, `SELECT lot_id, lot_quantity FROM shopping_ticks WHERE range_to = ? AND ingredient_id = ?`,
		string(rangeTo), ingredientID).Scan(&lot, &qty)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, 0, false, nil
	}
	if err != nil {
		return 0, 0, false, err
	}
	if !lot.Valid {
		return 0, 0, false, nil
	}
	return lot.Int64, lotQuantity(qty), true, nil
}

// lotQuantity is the quantity a tick added to its Lot; NULL (a tick from before migration 1560) means the Lot's whole
// current quantity, which Stock expresses as +Inf.
func lotQuantity(q sql.NullFloat64) float64 {
	if !q.Valid {
		return math.Inf(1)
	}
	return q.Float64
}

// Ticks returns the ticks of one range by Ingredient.
func (s *Store) Ticks(ctx context.Context, rangeTo stock.Date) (map[int64]shopping.Tick, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT ingredient_id, needed, by FROM shopping_ticks WHERE range_to = ?`, string(rangeTo))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]shopping.Tick{}
	for rows.Next() {
		var t shopping.Tick
		if err := rows.Scan(&t.IngredientID, &t.Needed, &t.By); err != nil {
			return nil, err
		}
		out[t.IngredientID] = t
	}
	return out, rows.Err()
}

// PurgeBefore deletes ticks and Not needed marks whose range ended before today.
func (s *Store) PurgeBefore(ctx context.Context, today stock.Date) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM shopping_ticks WHERE range_to < ?`, string(today)); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM shopping_not_needed WHERE range_to < ?`, string(today))
	return err
}

// LotsAdded counts the ticks of a range that added a Stock Lot.
func (s *Store) LotsAdded(ctx context.Context, rangeTo stock.Date) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM shopping_ticks WHERE range_to = ? AND lot_id IS NOT NULL`,
		string(rangeTo)).Scan(&n)
	return n, err
}

// SetNotNeeded marks an Ingredient Not needed for a range (upsert). userID 0 stores no User.
func (s *Store) SetNotNeeded(ctx context.Context, rangeTo stock.Date, n shopping.NotNeeded, userID int64) error {
	var user sql.NullInt64
	if userID != 0 {
		user = sql.NullInt64{Int64: userID, Valid: true}
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO shopping_not_needed (range_to, ingredient_id, needed, user_id, created_at)
		VALUES (?, ?, ?, ?, ?)
		ON CONFLICT(range_to, ingredient_id) DO UPDATE SET needed = excluded.needed, user_id = excluded.user_id,
			created_at = excluded.created_at`,
		string(rangeTo), n.IngredientID, n.Needed, user, s.now())
	return err
}

// DeleteNotNeeded clears the mark (ErrNotFound when the Ingredient was not Not needed for that range).
func (s *Store) DeleteNotNeeded(ctx context.Context, rangeTo stock.Date, ingredientID int64) error {
	return s.exec(ctx, `DELETE FROM shopping_not_needed WHERE range_to = ? AND ingredient_id = ?`, string(rangeTo), ingredientID)
}

// NotNeeded returns the Not needed marks of one range by Ingredient.
func (s *Store) NotNeeded(ctx context.Context, rangeTo stock.Date) (map[int64]shopping.NotNeeded, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT ingredient_id, needed FROM shopping_not_needed WHERE range_to = ?`, string(rangeTo))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[int64]shopping.NotNeeded{}
	for rows.Next() {
		var n shopping.NotNeeded
		if err := rows.Scan(&n.IngredientID, &n.Needed); err != nil {
			return nil, err
		}
		out[n.IngredientID] = n
	}
	return out, rows.Err()
}
