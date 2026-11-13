package store

import (
	"context"
	"database/sql"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// Leftovers by hand (ADR 0012, docs/dev/design/b5-lo.md).

// StoragePlace returns a Storage Place (its kind decides Freeze it and Take out); ErrNotFound if there is none.
func (s *Store) StoragePlace(ctx context.Context, id int64) (plan.StoragePlace, error) {
	var p plan.StoragePlace
	err := s.q.QueryRowContext(ctx, `SELECT id, name, kind FROM storage_places WHERE id = ?`, id).Scan(&p.ID, &p.Name, &p.Kind)
	if errors.Is(err, sql.ErrNoRows) {
		return plan.StoragePlace{}, ErrNotFound
	}
	return p, err
}

// FrozenUseByDays returns the Recipe's own Frozen Use-by (nil: none) and the Household's default (household_settings);
// ErrNotFound if there is no such Recipe.
func (s *Store) FrozenUseByDays(ctx context.Context, recipeID int64) (recipeDays *int, householdDays int, err error) {
	var own sql.NullInt64
	err = s.q.QueryRowContext(ctx, `SELECT frozen_use_by_days FROM recipes WHERE id = ?`, recipeID).Scan(&own)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, 0, ErrNotFound
	}
	if err != nil {
		return nil, 0, err
	}
	if err := s.q.QueryRowContext(ctx, `SELECT frozen_use_by_days FROM household_settings WHERE id = 1`).Scan(&householdDays); err != nil {
		return nil, 0, err
	}
	if own.Valid {
		d := int(own.Int64)
		recipeDays = &d
	}
	return recipeDays, householdDays, nil
}

// SaveLeftoverState sets the remaining portions, the Use-by, the Storage Place (0: none) and the frozen date ("": not
// frozen) of a Leftover in one statement; ErrNotFound if unknown. Status and where it came from never change.
func (s *Store) SaveLeftoverState(ctx context.Context, id int64, portions float64, useBy string, storagePlaceID int64, frozenOn string) error {
	var place sql.NullInt64
	if storagePlaceID != 0 {
		place = sql.NullInt64{Int64: storagePlaceID, Valid: true}
	}
	var frozen sql.NullString
	if frozenOn != "" {
		frozen = sql.NullString{String: frozenOn, Valid: true}
	}
	return s.affectOne(ctx, `UPDATE leftovers SET portions = ?, use_by = ?, storage_place_id = ?, frozen_on = ? WHERE id = ?`,
		portions, useBy, place, frozen, id)
}

// DeleteLeftover removes the row (Wasn't there). planned_meals.from_leftover_id of its dependants becomes NULL by the
// foreign key; leftover_events keep their rows. ErrNotFound if unknown.
func (s *Store) DeleteLeftover(ctx context.Context, id int64) error {
	return s.affectOne(ctx, `DELETE FROM leftovers WHERE id = ?`, id)
}

// DependantsOfLeftover returns the Planned Meals in State planned whose from_leftover_id is the Leftover, in date then
// Meal Slot order. Unlike Dependants (by the source key) it tells a frozen part split off a Leftover from the part that
// stayed, as both carry the same source Meal Slot.
func (s *Store) DependantsOfLeftover(ctx context.Context, id int64) ([]plan.Meal, error) {
	rows, err := s.q.QueryContext(ctx, mealSelect+` WHERE state = 'planned' AND from_leftover_id = ?
		ORDER BY date, meal_slot_id`, id)
	if err != nil {
		return nil, err
	}
	return collectMeals(rows)
}

// AddLeftoverEvent records a hand action (created_at is the store's clock).
func (s *Store) AddLeftoverEvent(ctx context.Context, e plan.LeftoverEvent) error {
	var place, user sql.NullInt64
	if e.StoragePlaceID != 0 {
		place = sql.NullInt64{Int64: e.StoragePlaceID, Valid: true}
	}
	if e.UserID != 0 {
		user = sql.NullInt64{Int64: e.UserID, Valid: true}
	}
	_, err := s.q.ExecContext(ctx, `INSERT INTO leftover_events (leftover_id, recipe_id, kind, portions, on_date, storage_place_id, user_id, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		e.LeftoverID, e.RecipeID, string(e.Kind), e.Portions, e.On, place, user, s.now())
	return mapErr(err)
}

// LeftoverEvents returns the history of one Leftover id, oldest first (then id).
func (s *Store) LeftoverEvents(ctx context.Context, leftoverID int64) ([]plan.LeftoverEvent, error) {
	rows, err := s.q.QueryContext(ctx, `SELECT id, leftover_id, recipe_id, kind, portions, on_date, storage_place_id, user_id
		FROM leftover_events WHERE leftover_id = ? ORDER BY id`, leftoverID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []plan.LeftoverEvent
	for rows.Next() {
		var e plan.LeftoverEvent
		var kind string
		var place, user sql.NullInt64
		if err := rows.Scan(&e.ID, &e.LeftoverID, &e.RecipeID, &kind, &e.Portions, &e.On, &place, &user); err != nil {
			return nil, err
		}
		e.Kind = plan.LeftoverEventKind(kind)
		e.StoragePlaceID, e.UserID = place.Int64, user.Int64
		out = append(out, e)
	}
	return out, rows.Err()
}
