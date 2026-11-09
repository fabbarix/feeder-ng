// Package product holds the pure rules for Products, Shops, Shop Barcodes,
// Weight Barcode Rules and Prices: validation, price-per-kg maths and the
// builder of the barcode Catalog. No HTTP, no SQL. See
// docs/dev/design/t9-products-shops.md.
package product

import (
	"errors"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var (
	// ErrInvalid is matched (errors.Is) by every *ValidationError.
	ErrInvalid = errors.New("invalid")
	// ErrInvalidBarcode: the text is not a readable barcode.
	ErrInvalidBarcode = errors.New("invalid barcode")
	// ErrInvalidItemCode: wrong length or not digits for the rule's item span.
	ErrInvalidItemCode = errors.New("invalid item code")
)

// ValidationError names the JSON field that is wrong.
type ValidationError struct {
	Field   string
	Message string
}

func (e *ValidationError) Error() string        { return e.Field + ": " + e.Message }
func (e *ValidationError) Is(target error) bool { return target == ErrInvalid }

// Input is what a Product is created from.
type Input struct {
	Name         string
	IngredientID int64
	PackSize     float64 // in the Ingredient's Base Unit
}

// Validate: name 1-100 runes after NormalizeName, IngredientID > 0, PackSize
// finite and > 0. Field names: name, ingredientId, packSize.
func (in Input) Validate() error { panic("TODO") }

// NormalizeName trims and collapses internal whitespace.
func NormalizeName(s string) string { panic("TODO") }

// ValidateShopName: 1-100 runes after NormalizeName (field "name").
func ValidateShopName(s string) error { panic("TODO") }

// NormalizeBarcode returns the canonical form (barcode.Canonical) or
// ErrInvalidBarcode.
func NormalizeBarcode(raw string) (string, error) { panic("TODO") }

// ValidateItemCode checks item is all digits with exactly rule.Item.Length digits.
func ValidateItemCode(rule barcode.WeightRule, item string) error { panic("TODO") }

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
func (p PriceInput) Validate() error { panic("TODO") }

// PricePerKg is the price per kg of a Price: the explicit value (derived=false),
// else PriceCents*1000/packSize rounded half up when base is units.Gram and
// packSize > 0 (derived=true), else ok=false.
func PricePerKg(p Price, packSize float64, base units.Base) (cents int, derived bool, ok bool) {
	panic("TODO")
}

// LatestPrice is the Price with the highest Date, ties broken by the highest ID.
func LatestPrice(prices []Price) (Price, bool) { panic("TODO") }

// ShopBarcode is a code valid only in one Shop. Plain: Code set, RuleID 0.
// Weighed: RuleID and ItemCode set, Code empty.
type ShopBarcode struct {
	ID, ShopID, ProductID int64
	Code                  string
	RuleID                int64
	ItemCode              string
}

// ProductInfo is what price-per-kg derivation needs about a Product.
type ProductInfo struct {
	PackSize float64
	Base     units.Base
}

// CatalogRows is the raw material of one Shop's Catalog (all for that Shop).
type CatalogRows struct {
	Rules        []barcode.WeightRule
	ShopBarcodes []ShopBarcode
	Global       map[string]int64      // canonical code -> product id (all Products)
	Latest       map[int64]Price       // product id -> latest Price at this Shop
	Info         map[int64]ProductInfo // product id -> pack size and Base Unit
}

// BuildCatalog: plain Shop Barcodes -> ShopBarcodes; weighed -> WeightProducts
// (barcode.WeightProductKey); PricePerKgCents only for Products in WeightProducts
// that have a price per kg; Global copied; Rules sorted by ID. Empty maps are nil
// so the JSON omits them. A home Catalog is BuildCatalog(CatalogRows{Global: g}).
func BuildCatalog(r CatalogRows) barcode.Catalog { panic("TODO") }
