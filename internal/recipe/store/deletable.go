package store

import "context"

// Deletable says whether Delete would remove the Recipe: false when it was ever planned (any PlannedChecker) or when it is a Base
// recipe that Recipes call for (archived ones too). ErrNotFound. (SAFE-05: the detail says so before the User asks.)
//
// STUB (B9-27 test author): the developer implements it.
func (s *Store) Deletable(_ context.Context, _ int64) (bool, error) {
	return true, nil
}
