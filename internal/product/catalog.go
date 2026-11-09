package product

import (
	"sort"

	"github.com/fabbarix/feeder-ng/internal/barcode"
)

// BuildCatalog: plain Shop Barcodes -> ShopBarcodes; weighed -> WeightProducts
// (barcode.WeightProductKey); PricePerKgCents only for Products in WeightProducts
// whose latest explicit price per kg is known (never derived from a pack size); Global copied; Rules sorted by ID. Empty maps are nil
// so the JSON omits them. A home Catalog is BuildCatalog(CatalogRows{Global: g}).
func BuildCatalog(r CatalogRows) barcode.Catalog {
	var c barcode.Catalog
	for _, sb := range r.ShopBarcodes {
		if sb.RuleID == 0 {
			if c.ShopBarcodes == nil {
				c.ShopBarcodes = map[string]int64{}
			}
			c.ShopBarcodes[sb.Code] = sb.ProductID
			continue
		}
		if c.WeightProducts == nil {
			c.WeightProducts = map[string]int64{}
		}
		c.WeightProducts[barcode.WeightProductKey(sb.RuleID, sb.ItemCode)] = sb.ProductID
	}
	for id := range weighedProducts(c.WeightProducts) {
		if cents, ok := LatestExplicitPricePerKg(r.Prices[id]); ok {
			if c.PricePerKgCents == nil {
				c.PricePerKgCents = map[int64]int{}
			}
			c.PricePerKgCents[id] = cents
		}
	}
	if len(r.Rules) > 0 {
		c.WeightRules = append([]barcode.WeightRule(nil), r.Rules...)
		sort.Slice(c.WeightRules, func(i, j int) bool { return c.WeightRules[i].ID < c.WeightRules[j].ID })
	}
	if len(r.Global) > 0 {
		c.GlobalBarcodes = make(map[string]int64, len(r.Global))
		for k, v := range r.Global {
			c.GlobalBarcodes[k] = v
		}
	}
	return c
}

func weighedProducts(wp map[string]int64) map[int64]struct{} {
	out := make(map[int64]struct{}, len(wp))
	for _, id := range wp {
		out[id] = struct{}{}
	}
	return out
}
