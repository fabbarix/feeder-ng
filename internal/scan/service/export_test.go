package service

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/scan"
)

// SetPricesBefore and RestorePrices expose the receipt Apply's use of setPrices and restorePrices (both run with the
// scan lock held, as ApplyReceiptPlan holds it) to the external tests.
func (s *Service) SetPricesBefore(ctx context.Context, in SetPricesInput) ([]scan.Result, PricesBefore, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.setPrices(ctx, in)
}

func (s *Service) RestorePrices(ctx context.Context, b PricesBefore) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.restorePrices(ctx, b)
}
