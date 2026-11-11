package store

import (
	"context"
	"errors"

	"github.com/fabbarix/feeder-ng/internal/household"
)

// UpdateSlotsBatch applies a batch edit in one transaction: all matching Meal Slots or none. STUB (R15 step 2).
func (s *Store) UpdateSlotsBatch(ctx context.Context, in household.BatchInput) (household.BatchResult, error) {
	return household.BatchResult{}, errors.New("not implemented")
}
