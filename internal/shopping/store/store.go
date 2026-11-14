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
	if err := rows.Err(); err != nil {
		return nil, err
	}
	rows.Close()
	adds, err := s.additions(ctx, `extra_id IN (SELECT id FROM shopping_extras WHERE ticked_on = ?)`, string(today))
	if err != nil {
		return nil, err
	}
	for i := range out {
		for _, a := range adds {
			if a.ExtraID == out[i].ID {
				out[i].Additions = append(out[i].Additions, a.Addition)
			}
		}
	}
	return out, nil
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

// TickExtra marks an extra ticked on today (ErrNotFound). Its additions, if any, are written with AddExtraAddition.
func (s *Store) TickExtra(ctx context.Context, id int64, today stock.Date) error {
	return s.exec(ctx, `UPDATE shopping_extras SET ticked_on = ? WHERE id = ?`, string(today), id)
}

// UntickExtra clears the tick and its additions (ErrNotFound).
func (s *Store) UntickExtra(ctx context.Context, id int64) error {
	return s.UntickExtraTakenBack(ctx, id, 0)
}

// UntickExtraTakenBack clears an extra's tick and its additions, and takes taken (what Stock took back) off its got
// (floor 0), in one transaction, so a retried Undo never takes it off twice (ErrNotFound).
func (s *Store) UntickExtraTakenBack(ctx context.Context, id int64, taken float64) error {
	return s.tx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE shopping_extras SET got = MAX(0, got - ?), ticked_on = NULL WHERE id = ?`, taken, id)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		_, err = tx.ExecContext(ctx, `DELETE FROM shopping_tick_additions WHERE extra_id = ?`, id)
		return err
	})
}

func (s *Store) tx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit()
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

// SetTick sets the ticked state of an Ingredient for a range (upsert: needed and by are replaced). lotID is a Stock Lot the
// tick added, recorded as an addition with no quantity (Take back then takes what is left of it). The service ticks
// through AddLineAddition; SetTick is the bare state, for tests and tools.
func (s *Store) SetTick(ctx context.Context, rangeTo stock.Date, t shopping.Tick, lotID *int64) error {
	return s.tx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO shopping_ticks (range_to, ingredient_id, needed, by, ticked_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(range_to, ingredient_id) DO UPDATE SET needed = excluded.needed, by = excluded.by, ticked_at = excluded.ticked_at`,
			string(rangeTo), t.IngredientID, t.Needed, t.By, s.now()); err != nil {
			return err
		}
		if lotID == nil {
			return nil
		}
		_, err := tx.ExecContext(ctx, `INSERT INTO shopping_tick_additions (range_to, ingredient_id, by, lot_id, quantity, covers, ticked_at)
			VALUES (?, ?, ?, ?, NULL, ?, ?)`, string(rangeTo), t.IngredientID, t.By, *lotID, t.Needed, s.now())
		return err
	})
}

// DeleteTick unticks an Ingredient for a range and removes its additions (no error when it was not ticked).
func (s *Store) DeleteTick(ctx context.Context, rangeTo stock.Date, ingredientID int64) error {
	return s.tx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `DELETE FROM shopping_tick_additions WHERE range_to = ? AND ingredient_id = ?`,
			string(rangeTo), ingredientID); err != nil {
			return err
		}
		_, err := tx.ExecContext(ctx, `DELETE FROM shopping_ticks WHERE range_to = ? AND ingredient_id = ?`, string(rangeTo), ingredientID)
		return err
	})
}

// Ticks returns the ticks of one range by Ingredient, each with its additions (oldest first) and what they added.
func (s *Store) Ticks(ctx context.Context, rangeTo stock.Date) (map[int64]shopping.Tick, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT ingredient_id, needed, by FROM shopping_ticks WHERE range_to = ?`, string(rangeTo))
	if err != nil {
		return nil, err
	}
	out := map[int64]shopping.Tick{}
	for rows.Next() {
		var t shopping.Tick
		if err := rows.Scan(&t.IngredientID, &t.Needed, &t.By); err != nil {
			rows.Close()
			return nil, err
		}
		out[t.IngredientID] = t
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	adds, err := s.additions(ctx, `range_to = ? AND ingredient_id IS NOT NULL`, string(rangeTo))
	if err != nil {
		return nil, err
	}
	for _, a := range adds {
		t, ok := out[a.IngredientID]
		if !ok {
			continue
		}
		t.Additions = append(t.Additions, a.Addition)
		out[a.IngredientID] = t
	}
	for ing, t := range out {
		t.Added, t.AddedUnknown = shopping.AddedOf(t.Additions)
		out[ing] = t
	}
	return out, nil
}

// Addition is a stored tick addition: one of a Line (RangeTo and IngredientID) or of an extra (ExtraID).
type Addition struct {
	ID           int64
	RangeTo      stock.Date
	IngredientID int64
	ExtraID      int64
	shopping.Addition
}

const additionColumns = `id, range_to, ingredient_id, extra_id, by, lot_id, quantity, covers, user_id, client_uuid, ticked_at, synced_at`

func (s *Store) additions(ctx context.Context, where string, args ...any) ([]Addition, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT `+additionColumns+` FROM shopping_tick_additions WHERE `+where+` ORDER BY id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Addition
	for rows.Next() {
		a, err := scanAddition(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

type scanner interface{ Scan(dest ...any) error }

func scanAddition(r scanner) (Addition, error) {
	var (
		a                   Addition
		rangeTo, uuid, sync sql.NullString
		ing, extra, lot     sql.NullInt64
		user                sql.NullInt64
		qty                 sql.NullFloat64
		at                  string
	)
	if err := r.Scan(&a.ID, &rangeTo, &ing, &extra, &a.By, &lot, &qty, &a.Covers, &user, &uuid, &at, &sync); err != nil {
		return Addition{}, err
	}
	a.RangeTo, a.IngredientID, a.ExtraID = stock.Date(rangeTo.String), ing.Int64, extra.Int64
	a.LotID, a.UserID, a.ClientUUID = lot.Int64, user.Int64, uuid.String
	a.Quantity = qty.Float64
	if !qty.Valid {
		a.Quantity = lotQuantity(qty)
	}
	a.TickedAt, _ = time.Parse(time.RFC3339, at)
	if sync.Valid {
		a.SyncedAt, _ = time.Parse(time.RFC3339, sync.String)
	}
	return a, nil
}

// LineAdditions returns the additions of a Line for a range, oldest first.
func (s *Store) LineAdditions(ctx context.Context, rangeTo stock.Date, ingredientID int64) ([]Addition, error) {
	return s.additions(ctx, `range_to = ? AND ingredient_id = ?`, string(rangeTo), ingredientID)
}

// ExtraAdditions returns the additions of an extra, oldest first.
func (s *Store) ExtraAdditions(ctx context.Context, extraID int64) ([]Addition, error) {
	return s.additions(ctx, `extra_id = ?`, extraID)
}

// AdditionByUUID finds the addition with that client UUID (ok false for none, or for "").
func (s *Store) AdditionByUUID(ctx context.Context, clientUUID string) (Addition, bool, error) {
	if clientUUID == "" {
		return Addition{}, false, nil
	}
	a, err := scanAddition(s.db.QueryRowContext(ctx, `SELECT `+additionColumns+` FROM shopping_tick_additions WHERE client_uuid = ?`, clientUUID))
	if errors.Is(err, sql.ErrNoRows) {
		return Addition{}, false, nil
	}
	if err != nil {
		return Addition{}, false, err
	}
	return a, true, nil
}

// insertAddition writes one addition. ok is false when its client UUID is already taken (nothing is written).
func (s *Store) insertAddition(ctx context.Context, tx *sql.Tx, rangeTo *stock.Date, ingredientID, extraID int64, a shopping.Addition) (int64, bool, error) {
	var (
		rt         sql.NullString
		ing, extra sql.NullInt64
		lot, user  sql.NullInt64
		uuid, sync sql.NullString
	)
	if rangeTo != nil {
		rt = sql.NullString{String: string(*rangeTo), Valid: true}
	}
	if ingredientID != 0 {
		ing = sql.NullInt64{Int64: ingredientID, Valid: true}
	}
	if extraID != 0 {
		extra = sql.NullInt64{Int64: extraID, Valid: true}
	}
	if a.LotID != 0 {
		lot = sql.NullInt64{Int64: a.LotID, Valid: true}
	}
	if a.UserID != 0 {
		user = sql.NullInt64{Int64: a.UserID, Valid: true}
	}
	if a.ClientUUID != "" {
		uuid = sql.NullString{String: a.ClientUUID, Valid: true}
	}
	if !a.SyncedAt.IsZero() {
		sync = sql.NullString{String: a.SyncedAt.UTC().Format(time.RFC3339), Valid: true}
	}
	at := a.TickedAt
	if at.IsZero() {
		at = s.clk.Now()
	}
	by := a.By
	if by == "" {
		by = "hand"
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO shopping_tick_additions (range_to, ingredient_id, extra_id, by, lot_id, quantity,
		covers, user_id, client_uuid, ticked_at, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(client_uuid) DO NOTHING`,
		rt, ing, extra, by, lot, a.Quantity, math.Max(0, a.Covers), user, uuid, at.UTC().Format(time.RFC3339), sync)
	if err != nil {
		return 0, false, err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return 0, false, nil
	}
	id, err := res.LastInsertId()
	return id, true, err
}

// AddLineAddition ticks a Line for a range with one more addition: the first one sets the tick (needed = its covers,
// by = its by); a later one raises needed to its covers when they are larger. ok is false when the client UUID is
// already taken: nothing is written and the caller answers with that addition.
func (s *Store) AddLineAddition(ctx context.Context, rangeTo stock.Date, ingredientID int64, a shopping.Addition) (id int64, ok bool, err error) {
	err = s.tx(ctx, func(tx *sql.Tx) error {
		by := a.By
		if by == "" {
			by = "hand"
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO shopping_ticks (range_to, ingredient_id, needed, by, ticked_at)
			VALUES (?, ?, ?, ?, ?)
			ON CONFLICT(range_to, ingredient_id) DO UPDATE SET needed = MAX(needed, excluded.needed)`,
			string(rangeTo), ingredientID, math.Max(0, a.Covers), by, s.now()); err != nil {
			return err
		}
		id, ok, err = s.insertAddition(ctx, tx, &rangeTo, ingredientID, 0, a)
		if err != nil {
			return err
		}
		if !ok {
			return errDuplicate
		}
		return nil
	})
	if errors.Is(err, errDuplicate) {
		return 0, false, nil
	}
	return id, ok, err
}

var errDuplicate = errors.New("shopping store: client UUID taken")

// AddExtraAddition ticks an extra on today with one more addition (ErrNotFound for an unknown extra). ok is false when
// the client UUID is already taken: nothing is written.
func (s *Store) AddExtraAddition(ctx context.Context, extraID int64, today stock.Date, a shopping.Addition) (id int64, ok bool, err error) {
	err = s.tx(ctx, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `UPDATE shopping_extras SET ticked_on = ? WHERE id = ?`, string(today), extraID)
		if err != nil {
			return err
		}
		if n, _ := res.RowsAffected(); n == 0 {
			return ErrNotFound
		}
		id, ok, err = s.insertAddition(ctx, tx, nil, 0, extraID, a)
		if err != nil {
			return err
		}
		if !ok {
			return errDuplicate
		}
		return nil
	})
	if errors.Is(err, errDuplicate) {
		return 0, false, nil
	}
	return id, ok, err
}

// SetAdditionLot records the Stock Lot an addition now has (0 = none) and the quantity it put into Stock (ErrNotFound).
func (s *Store) SetAdditionLot(ctx context.Context, id, lotID int64, quantity float64) error {
	var lot sql.NullInt64
	if lotID != 0 {
		lot = sql.NullInt64{Int64: lotID, Valid: true}
	}
	return s.exec(ctx, `UPDATE shopping_tick_additions SET lot_id = ?, quantity = ? WHERE id = ?`, lot, quantity, id)
}

// DeleteAddition removes one addition. For a Line, the tick goes with its last addition; otherwise its needed becomes the
// largest covers left. gone says the Line or extra has no addition left. An unknown id is not an error (gone false).
func (s *Store) DeleteAddition(ctx context.Context, id int64) (gone bool, err error) {
	err = s.tx(ctx, func(tx *sql.Tx) error {
		a, err := scanAddition(tx.QueryRowContext(ctx, `SELECT `+additionColumns+` FROM shopping_tick_additions WHERE id = ?`, id))
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `DELETE FROM shopping_tick_additions WHERE id = ?`, id); err != nil {
			return err
		}
		var left int
		var maxCovers sql.NullFloat64
		if a.ExtraID != 0 {
			err = tx.QueryRowContext(ctx, `SELECT COUNT(*), MAX(covers) FROM shopping_tick_additions WHERE extra_id = ?`, a.ExtraID).Scan(&left, &maxCovers)
		} else {
			err = tx.QueryRowContext(ctx, `SELECT COUNT(*), MAX(covers) FROM shopping_tick_additions WHERE range_to = ? AND ingredient_id = ?`,
				string(a.RangeTo), a.IngredientID).Scan(&left, &maxCovers)
		}
		if err != nil {
			return err
		}
		gone = left == 0
		if a.ExtraID != 0 {
			return nil
		}
		if gone {
			_, err = tx.ExecContext(ctx, `DELETE FROM shopping_ticks WHERE range_to = ? AND ingredient_id = ?`, string(a.RangeTo), a.IngredientID)
			return err
		}
		_, err = tx.ExecContext(ctx, `UPDATE shopping_ticks SET needed = ? WHERE range_to = ? AND ingredient_id = ?`,
			maxCovers.Float64, string(a.RangeTo), a.IngredientID)
		return err
	})
	return gone, err
}

// lotQuantity is the quantity a tick added to its Lot; NULL (a tick from before migration 1560) means the Lot's whole
// current quantity, which Stock expresses as +Inf.
func lotQuantity(q sql.NullFloat64) float64 {
	if !q.Valid {
		return math.Inf(1)
	}
	return q.Float64
}

// PurgeBefore deletes ticks, their additions and Not needed marks whose range ended before today.
func (s *Store) PurgeBefore(ctx context.Context, today stock.Date) error {
	if _, err := s.db.ExecContext(ctx, `DELETE FROM shopping_tick_additions WHERE range_to < ?`, string(today)); err != nil {
		return err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM shopping_ticks WHERE range_to < ?`, string(today)); err != nil {
		return err
	}
	_, err := s.db.ExecContext(ctx, `DELETE FROM shopping_not_needed WHERE range_to < ?`, string(today))
	return err
}

// LotsAdded counts the Stock Lots ticks by hand put into Stock for a range (a Scan's are in the Scan ledger).
func (s *Store) LotsAdded(ctx context.Context, rangeTo stock.Date) (int, error) {
	var n int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM shopping_tick_additions WHERE range_to = ? AND by = 'hand' AND lot_id IS NOT NULL`,
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
