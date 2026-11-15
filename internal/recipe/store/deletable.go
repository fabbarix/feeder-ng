package store

import (
	"context"
	"database/sql"
)

// DeleteBlock says why Delete would refuse a Recipe (SAFE-05): the detail tells the User before they ask.
type DeleteBlock string

const (
	// DeleteAllowed: nothing stops Delete.
	DeleteAllowed DeleteBlock = ""
	// DeleteBlockedPlanned: the Recipe was planned before (any PlannedChecker); Delete answers ErrAlreadyPlanned.
	DeleteBlockedPlanned DeleteBlock = "planned"
	// DeleteBlockedInUse: a Base recipe that Recipes call for (archived ones too); Delete answers recipe.InUseError.
	DeleteBlockedInUse DeleteBlock = "in_use"
)

// DeleteBlocker says what would stop Delete, in the order Delete checks it: planned first, then a Base recipe in use.
// ErrNotFound for an unknown id.
func (s *Store) DeleteBlocker(ctx context.Context, id int64) (DeleteBlock, error) {
	var baseIng sql.NullInt64
	if err := s.db.QueryRowContext(ctx, `SELECT base_ingredient_id FROM recipes WHERE id = ?`, id).Scan(&baseIng); err != nil {
		if err == sql.ErrNoRows {
			return DeleteAllowed, ErrNotFound
		}
		return DeleteAllowed, err
	}
	planned, err := s.planned.WasPlanned(ctx, s.db, id)
	if err != nil {
		return DeleteAllowed, err
	}
	if planned {
		return DeleteBlockedPlanned, nil
	}
	if baseIng.Valid {
		used, err := usedBy(ctx, s.db, baseIng.Int64)
		if err != nil {
			return DeleteAllowed, err
		}
		if len(used) > 0 {
			return DeleteBlockedInUse, nil
		}
	}
	return DeleteAllowed, nil
}

// Deletable says whether Delete would remove the Recipe: false when it was ever planned (any PlannedChecker) or when it
// is a Base recipe that Recipes call for (archived ones too). ErrNotFound for an unknown id.
func (s *Store) Deletable(ctx context.Context, id int64) (bool, error) {
	b, err := s.DeleteBlocker(ctx, id)
	return err == nil && b == DeleteAllowed, err
}
