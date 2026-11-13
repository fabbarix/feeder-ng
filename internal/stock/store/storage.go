package store

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"unicode/utf8"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Storage Places (Pantry page): where the Household keeps its Stock.

var (
	// ErrPlaceNotFound: no Storage Place with that id.
	ErrPlaceNotFound = errors.New("storage place not found")
	// ErrPlaceNameTaken: another Storage Place has that name (ignoring case and spacing).
	ErrPlaceNameTaken = errors.New("a Storage Place with that name already exists")
	// ErrInvalidPlace: a blank or too long name, or an unknown kind.
	ErrInvalidPlace = errors.New("invalid storage place")
)

// StoragePlace is one place Stock is kept in.
type StoragePlace struct {
	ID      int64      `json:"id"`
	Name    string     `json:"name"`
	Kind    stock.Kind `json:"kind"`
	Default bool       `json:"default"` // new Lots of an Ingredient never put anywhere go here
}

// PlacePatch is a partial update; nil fields are kept.
type PlacePatch struct {
	Name    *string
	Kind    *stock.Kind
	Default *bool
}

// rememberedPlaceSQL is the Storage Place a new Lot of an Ingredient (the one ? argument) goes to: where that
// Ingredient was last put, else the default Storage Place, else none.
const rememberedPlaceSQL = `COALESCE((SELECT storage_place_id FROM ingredient_storage WHERE ingredient_id = ?),
	(SELECT id FROM storage_places WHERE is_default = 1))`

const maxPlaceName = 60

func cleanPlaceName(name string) (string, error) {
	clean := strings.Join(strings.Fields(name), " ")
	if n := utf8.RuneCountInString(clean); n == 0 || n > maxPlaceName {
		return "", ErrInvalidPlace
	}
	return clean, nil
}

func placeKey(name string) string { return strings.ToLower(name) }

// StoragePlaces lists every Storage Place by name.
func (s *Store) StoragePlaces(ctx context.Context) ([]StoragePlace, error) {
	rows, err := s.db.QueryContext(ctx, `SELECT id, name, kind, is_default FROM storage_places ORDER BY name_key, id`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []StoragePlace{}
	for rows.Next() {
		p, err := scanPlace(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, p)
	}
	return out, rows.Err()
}

// StoragePlace returns one Storage Place, or ErrPlaceNotFound.
func (s *Store) StoragePlace(ctx context.Context, id int64) (StoragePlace, error) {
	return placeByID(ctx, s.db, id)
}

// StoragePlaceTx returns one Storage Place inside tx, or ErrPlaceNotFound (H9: Undo checks the place of a Lot it recreates).
func (s *Store) StoragePlaceTx(ctx context.Context, tx *sql.Tx, id int64) (StoragePlace, error) {
	return placeByID(ctx, tx, id)
}

func placeByID(ctx context.Context, q querier, id int64) (StoragePlace, error) {
	p, err := scanPlace(q.QueryRowContext(ctx, `SELECT id, name, kind, is_default FROM storage_places WHERE id = ?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return StoragePlace{}, ErrPlaceNotFound
	}
	return p, err
}

func scanPlace(r scanner) (StoragePlace, error) {
	var p StoragePlace
	var kind string
	var def int
	if err := r.Scan(&p.ID, &p.Name, &kind, &def); err != nil {
		return StoragePlace{}, err
	}
	p.Kind, p.Default = stock.Kind(kind), def == 1
	return p, nil
}

// CreateStoragePlace adds one. With def, it becomes the only default.
func (s *Store) CreateStoragePlace(ctx context.Context, name string, kind stock.Kind, def bool) (StoragePlace, error) {
	clean, err := cleanPlaceName(name)
	if err != nil {
		return StoragePlace{}, err
	}
	if !stock.ValidKind(kind) {
		return StoragePlace{}, ErrInvalidPlace
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return StoragePlace{}, err
	}
	defer tx.Rollback()
	if def {
		if _, err := tx.ExecContext(ctx, `UPDATE storage_places SET is_default = 0 WHERE is_default = 1`); err != nil {
			return StoragePlace{}, err
		}
	}
	res, err := tx.ExecContext(ctx, `INSERT INTO storage_places (name, name_key, kind, is_default, created_at) VALUES (?, ?, ?, ?, ?)`,
		clean, placeKey(clean), string(kind), boolInt(def), s.now())
	if isUnique(err) {
		return StoragePlace{}, ErrPlaceNameTaken
	}
	if err != nil {
		return StoragePlace{}, err
	}
	id, err := res.LastInsertId()
	if err != nil {
		return StoragePlace{}, err
	}
	p, err := placeByID(ctx, tx, id)
	if err != nil {
		return StoragePlace{}, err
	}
	return p, tx.Commit()
}

// UpdateStoragePlace renames it, changes its kind or makes it (or stops it being) the default. Changing the kind
// does not move any go-off date: only moving a Lot does.
func (s *Store) UpdateStoragePlace(ctx context.Context, id int64, p PlacePatch) (StoragePlace, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return StoragePlace{}, err
	}
	defer tx.Rollback()
	cur, err := placeByID(ctx, tx, id)
	if err != nil {
		return StoragePlace{}, err
	}
	if p.Name != nil {
		clean, err := cleanPlaceName(*p.Name)
		if err != nil {
			return StoragePlace{}, err
		}
		cur.Name = clean
	}
	if p.Kind != nil {
		if !stock.ValidKind(*p.Kind) {
			return StoragePlace{}, ErrInvalidPlace
		}
		cur.Kind = *p.Kind
	}
	if p.Default != nil {
		if *p.Default {
			if _, err := tx.ExecContext(ctx, `UPDATE storage_places SET is_default = 0 WHERE is_default = 1 AND id <> ?`, id); err != nil {
				return StoragePlace{}, err
			}
		}
		cur.Default = *p.Default
	}
	_, err = tx.ExecContext(ctx, `UPDATE storage_places SET name = ?, name_key = ?, kind = ?, is_default = ? WHERE id = ?`,
		cur.Name, placeKey(cur.Name), string(cur.Kind), boolInt(cur.Default), id)
	if isUnique(err) {
		return StoragePlace{}, ErrPlaceNameTaken
	}
	if err != nil {
		return StoragePlace{}, err
	}
	return cur, tx.Commit()
}

// DeleteStoragePlace removes it. Its Lots stay in Stock, not sorted; Ingredients that went there forget it.
func (s *Store) DeleteStoragePlace(ctx context.Context, id int64) error {
	res, err := s.db.ExecContext(ctx, `DELETE FROM storage_places WHERE id = ?`, id)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrPlaceNotFound
	}
	return nil
}

// RememberedPlace is where a new Lot of the Ingredient goes: where it was last put, else the default Storage
// Place; nil when neither exists.
func (s *Store) RememberedPlace(ctx context.Context, ingredientID int64) (*StoragePlace, error) {
	var id sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `SELECT `+rememberedPlaceSQL, ingredientID).Scan(&id); err != nil {
		return nil, err
	}
	if !id.Valid {
		return nil, nil
	}
	p, err := placeByID(ctx, s.db, id.Int64)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// RememberPlace records that the Ingredient was put in the Storage Place, so its next Lots go there too.
func (s *Store) RememberPlace(ctx context.Context, ingredientID, placeID int64) error {
	return rememberPlace(ctx, s.db, ingredientID, placeID)
}

func rememberPlace(ctx context.Context, q querier, ingredientID, placeID int64) error {
	_, err := q.ExecContext(ctx, `INSERT INTO ingredient_storage (ingredient_id, storage_place_id) VALUES (?, ?)
		ON CONFLICT (ingredient_id) DO UPDATE SET storage_place_id = excluded.storage_place_id`, ingredientID, placeID)
	return err
}

// Move is a Lot (or part of it) going to another Storage Place.
type Move struct {
	LotID   int64
	PlaceID int64
	// Quantity to move; 0 or the whole Lot moves the Lot itself, less splits it: the rest stays where it was.
	Quantity float64
	// GoesOff is the moved quantity's go-off date (the caller works it out with stock.GoOffAfterMove).
	GoesOff stock.Date
}

// MoveLot moves a Lot, or splits it and moves the part, and remembers the place for its Ingredient. It returns the
// moved Lot (the original one, or the new one split off).
func (s *Store) MoveLot(ctx context.Context, m Move) (StoredLot, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return StoredLot{}, err
	}
	defer tx.Rollback()
	cur, err := scanLot(tx.QueryRowContext(ctx, `SELECT `+lotColumns+` FROM stock_lots WHERE id = ?`, m.LotID))
	if errors.Is(err, sql.ErrNoRows) {
		return StoredLot{}, ErrNotFound
	}
	if err != nil {
		return StoredLot{}, err
	}
	if _, err := placeByID(ctx, tx, m.PlaceID); err != nil {
		return StoredLot{}, err
	}
	movedID := cur.ID
	if m.Quantity > 0 && m.Quantity < cur.Quantity-1e-9 {
		if _, err := tx.ExecContext(ctx, `UPDATE stock_lots SET quantity = ? WHERE id = ?`, cur.Quantity-m.Quantity, cur.ID); err != nil {
			return StoredLot{}, err
		}
		res, err := tx.ExecContext(ctx, `INSERT INTO stock_lots
			(ingredient_id, quantity, purchased, goes_off, source, product_id, shop_id, created_at, kept_on, storage_place_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			cur.IngredientID, m.Quantity, string(cur.Purchased), nullDate(m.GoesOff), string(cur.Source),
			nullInt(cur.ProductID), nullInt(cur.ShopID), s.now(), nullDate(cur.KeptOn), m.PlaceID)
		if err != nil {
			return StoredLot{}, err
		}
		if movedID, err = res.LastInsertId(); err != nil {
			return StoredLot{}, err
		}
	} else if _, err := tx.ExecContext(ctx, `UPDATE stock_lots SET storage_place_id = ?, goes_off = ? WHERE id = ?`,
		m.PlaceID, nullDate(m.GoesOff), cur.ID); err != nil {
		return StoredLot{}, err
	}
	if err := rememberPlace(ctx, tx, cur.IngredientID, m.PlaceID); err != nil {
		return StoredLot{}, err
	}
	moved, err := scanLot(tx.QueryRowContext(ctx, `SELECT `+lotColumns+` FROM stock_lots WHERE id = ?`, movedID))
	if err != nil {
		return StoredLot{}, err
	}
	return moved, tx.Commit()
}

// querier is *sql.DB or *sql.Tx.
type querier interface {
	QueryRowContext(ctx context.Context, query string, args ...any) *sql.Row
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

func boolInt(b bool) int {
	if b {
		return 1
	}
	return 0
}
