package store

import (
	"context"
	"database/sql"
	"errors"
)

// TakeBackRecord is what an Undo of a tick took back from one Stock Lot (beta.8, undo; ADR 0019). It is written in the
// take-back's transaction, so a retried Undo finds it and takes nothing twice.
type TakeBackRecord struct {
	LotID   int64
	Taken   float64
	Removed bool
}

// TakeBackTx returns the take-back recorded for the Lot inside tx; ok is false when there is none.
func (s *Store) TakeBackTx(ctx context.Context, tx *sql.Tx, lotID int64) (rec TakeBackRecord, ok bool, err error) {
	var removed int
	err = tx.QueryRowContext(ctx, `SELECT lot_id, taken, removed FROM stock_lot_take_backs WHERE lot_id = ?`, lotID).
		Scan(&rec.LotID, &rec.Taken, &removed)
	if errors.Is(err, sql.ErrNoRows) {
		return TakeBackRecord{}, false, nil
	}
	if err != nil {
		return TakeBackRecord{}, false, err
	}
	rec.Removed = removed == 1
	return rec, true, nil
}

// RecordTakeBackTx records a take-back inside tx; a Lot is taken back at most once.
func (s *Store) RecordTakeBackTx(ctx context.Context, tx *sql.Tx, rec TakeBackRecord) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO stock_lot_take_backs (lot_id, taken, removed, taken_at) VALUES (?, ?, ?, ?)`,
		rec.LotID, rec.Taken, boolInt(rec.Removed), s.now())
	return err
}
