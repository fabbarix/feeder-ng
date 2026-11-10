package product

import (
	"math"
	"time"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// Price is a Product's Price at a Shop on a date. Amounts are minor currency units.
type Price struct {
	ID, ProductID, ShopID int64
	Date                  string // YYYY-MM-DD, household time
	PriceCents            *int   // what a pack cost
	PricePerKgCents       *int   // explicit price per kg (weighed goods)
}

// PriceInput is what recording a Price takes.
type PriceInput struct {
	ShopID          int64
	Date            string
	PriceCents      *int
	PricePerKgCents *int
}

// Validate: ShopID > 0, Date a real YYYY-MM-DD, at least one amount, every given amount > 0.
// Fields: shopId, date, priceCents, pricePerKgCents.
func (p PriceInput) Validate() error {
	if p.ShopID <= 0 {
		return &ValidationError{Field: "shopId", Message: "a Shop is required"}
	}
	if !ValidDate(p.Date) {
		return &ValidationError{Field: "date", Message: "date must be a real day as YYYY-MM-DD"}
	}
	if p.PriceCents == nil && p.PricePerKgCents == nil {
		return &ValidationError{Field: "priceCents", Message: "give a price or a price per kg"}
	}
	if p.PriceCents != nil && *p.PriceCents <= 0 {
		return &ValidationError{Field: "priceCents", Message: "price must be more than zero"}
	}
	if p.PricePerKgCents != nil && *p.PricePerKgCents <= 0 {
		return &ValidationError{Field: "pricePerKgCents", Message: "price per kg must be more than zero"}
	}
	return nil
}

// ValidDate reports whether s is a real calendar day written YYYY-MM-DD.
func ValidDate(s string) bool {
	t, err := time.Parse("2006-01-02", s)
	return err == nil && t.Format("2006-01-02") == s
}

// PricePerKg is the price per kg of a Price: the explicit value (derived=false),
// else PriceCents*1000/packSize rounded half up when base is units.Gram and
// packSize > 0 (derived=true), else ok=false.
func PricePerKg(p Price, packSize float64, base units.Base) (cents int, derived bool, ok bool) {
	if p.PricePerKgCents != nil {
		return *p.PricePerKgCents, false, true
	}
	if p.PriceCents == nil || base != units.Gram || !(packSize > 0) || math.IsInf(packSize, 0) {
		return 0, false, false
	}
	v := math.Floor(float64(*p.PriceCents)*1000/packSize + 0.5)
	if v < 1 {
		return 0, false, false
	}
	return int(v), true, true
}

// LatestPrice is the Price with the highest Date, ties broken by the highest ID.
func LatestPrice(prices []Price) (Price, bool) {
	var best Price
	found := false
	for _, p := range prices {
		if !found || p.Date > best.Date || (p.Date == best.Date && p.ID > best.ID) {
			best, found = p, true
		}
	}
	return best, found
}

// LatestExplicitPricePerKg is the pricePerKgCents of the most recent Price (highest
// Date, then highest ID) that HAS an explicit pricePerKgCents. A newer pack-only
// Price never masks it, and a pack size is never used to derive one: the Catalog
// is about weighed Products, whose nominal pack size says nothing about the price
// of a price-labelled slice. No explicit price per kg -> ok=false.
func LatestExplicitPricePerKg(prices []Price) (cents int, ok bool) {
	var best Price
	found := false
	for _, p := range prices {
		if p.PricePerKgCents == nil {
			continue
		}
		if !found || p.Date > best.Date || (p.Date == best.Date && p.ID > best.ID) {
			best, found = p, true
		}
	}
	if !found {
		return 0, false
	}
	return *best.PricePerKgCents, true
}

// PriceForWeight is what grams of a weighed Product cost: the explicit price per kg x grams / 1000, else (a pack
// Price on a Product in units.Gram with packSize > 0) PriceCents x grams / packSize; rounded half up to the minor
// unit, computed once (no rounding of an intermediate price per kg). ok=false when there is no basis or the result
// is below 1.
func PriceForWeight(p Price, packSize float64, base units.Base, grams float64) (cents int, ok bool) {
	if !(grams > 0) || math.IsInf(grams, 0) {
		return 0, false
	}
	var v float64
	switch {
	case p.PricePerKgCents != nil:
		v = float64(*p.PricePerKgCents) * grams / 1000
	case p.PriceCents != nil && base == units.Gram && packSize > 0 && !math.IsInf(packSize, 0):
		v = float64(*p.PriceCents) * grams / packSize
	default:
		return 0, false
	}
	r := math.Floor(v + 0.5)
	if r < 1 {
		return 0, false
	}
	return int(r), true
}
