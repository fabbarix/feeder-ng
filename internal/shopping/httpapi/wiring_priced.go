package httpapi

import (
	"context"

	"github.com/fabbarix/feeder-ng/internal/shopping"
	"github.com/fabbarix/feeder-ng/internal/shopping/service"
	"github.com/fabbarix/feeder-ng/internal/stock"
)

// B9-06 adapters, kept out of wiring.go (B9-04's file in beta.9 W0) so the two branches cannot conflict. Once both have
// merged, these can move next to the adapters they extend.

// PricedPacks is the priced Product of each Ingredient never bought (SSP-13): productstore.PricedPacks as Packs,
// each with the pack Price that chose it (its cents, date and Shop: the Line's pack carries them, B9-23).
func (p products) PricedPacks(ctx context.Context, ids []int64, shopID *int64) (map[int64]service.PricedPack, error) {
	got, err := p.st.PricedPacks(ctx, ids, shopID)
	if err != nil {
		return nil, err
	}
	out := make(map[int64]service.PricedPack, len(got))
	for ing, pp := range got {
		if pp.Price.PriceCents == nil { // never: PricedPacks only picks pack Prices
			continue
		}
		out[ing] = service.PricedPack{Pack: shopping.Pack{ProductID: pp.Product.ID, Name: pp.Product.Name, Size: pp.Product.PackSize},
			PriceCents: *pp.Price.PriceCents, Date: stock.Date(pp.Price.Date), ShopID: pp.Price.ShopID}
	}
	return out, nil
}
