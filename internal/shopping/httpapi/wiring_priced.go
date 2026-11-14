package httpapi

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/shopping"
)

// B9-06 adapters, kept out of wiring.go (B9-04's file in beta.9 W0) so the two branches cannot conflict. Once both have
// merged, these can move next to the adapters they extend.

// PricedPacks is the priced Product of each Ingredient never bought (SSP-13): productstore.PricedPacks as Packs.
func (p products) PricedPacks(ctx context.Context, ids []int64, shopID *int64) (map[int64]shopping.Pack, error) {
	got, err := p.st.PricedPacks(ctx, ids, shopID)
	if err != nil {
		return nil, err
	}
	out := make(map[int64]shopping.Pack, len(got))
	for ing, pp := range got {
		out[ing] = shopping.Pack{ProductID: pp.Product.ID, Name: pp.Product.Name, Size: pp.Product.PackSize}
	}
	return out, nil
}
