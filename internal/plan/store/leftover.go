package store

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/plan"
)

// Leftovers by hand (ADR 0012, docs/dev/design/b5-lo.md). STUBS for the test commit: the Developer implements them,
// and also reads and writes leftovers.storage_place_id / frozen_on in leftoverCols, scanLeftover and AddLeftover.

// StoragePlace returns a Storage Place (its kind decides Freeze it and Take out); ErrNotFound if there is none.
func (s *Store) StoragePlace(ctx context.Context, id int64) (plan.StoragePlace, error) {
	return plan.StoragePlace{}, ErrNotFound
}

// FrozenUseByDays returns the Recipe's own Frozen Use-by (nil: none) and the Household's default (household_settings);
// ErrNotFound if there is no such Recipe.
func (s *Store) FrozenUseByDays(ctx context.Context, recipeID int64) (recipeDays *int, householdDays int, err error) {
	return nil, 0, ErrNotFound
}

// SaveLeftoverState sets the remaining portions, the Use-by, the Storage Place (0: none) and the frozen date ("": not
// frozen) of a Leftover in one statement; ErrNotFound if unknown. Status and where it came from never change.
func (s *Store) SaveLeftoverState(ctx context.Context, id int64, portions float64, useBy string, storagePlaceID int64, frozenOn string) error {
	return nil
}

// DeleteLeftover removes the row (Wasn't there). planned_meals.from_leftover_id of its dependants becomes NULL by the
// foreign key; leftover_events keep their rows. ErrNotFound if unknown.
func (s *Store) DeleteLeftover(ctx context.Context, id int64) error { return nil }

// DependantsOfLeftover returns the Planned Meals in State planned whose from_leftover_id is the Leftover, in date then
// Meal Slot order. Unlike Dependants (by the source key) it tells a frozen part split off a Leftover from the part that
// stayed, as both carry the same source Meal Slot.
func (s *Store) DependantsOfLeftover(ctx context.Context, id int64) ([]plan.Meal, error) {
	return nil, nil
}

// AddLeftoverEvent records a hand action (created_at is the store's clock).
func (s *Store) AddLeftoverEvent(ctx context.Context, e plan.LeftoverEvent) error { return nil }

// LeftoverEvents returns the history of one Leftover id, oldest first (then id).
func (s *Store) LeftoverEvents(ctx context.Context, leftoverID int64) ([]plan.LeftoverEvent, error) {
	return nil, nil
}
