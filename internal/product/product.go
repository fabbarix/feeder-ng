// Package product holds the pure rules for Products, Shops, Shop Barcodes,
// Weight Barcode Rules and Prices: validation, price-per-kg maths and the
// builder of the barcode Catalog. No HTTP, no SQL. See
// docs/dev/design/t9-products-shops.md.
package product

import (
	"errors"
	"math"
	"strings"
	"unicode/utf8"

	"github.com/fabbarix/feeder-ng/internal/barcode"
)

var (
	// ErrInvalid is matched (errors.Is) by every *ValidationError.
	ErrInvalid = errors.New("invalid")
	// ErrInvalidBarcode: the text is not a readable barcode.
	ErrInvalidBarcode = errors.New("invalid barcode")
	// ErrInvalidItemCode: wrong length or not digits for the rule's item span.
	ErrInvalidItemCode = errors.New("invalid item code")
)

// maxNameRunes is the longest name a Product or Shop may have.
const maxNameRunes = 100

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
	// Image is the Product's Picture: an image id from internal/imaging, "" = none (PP). Validate trims it and accepts ""
	// or a well-formed id (imaging.ValidID), else a *ValidationError{Field: "image"}. STUB: not validated yet.
	Image string
}

// Validate: name 1-100 runes after NormalizeName, IngredientID > 0, PackSize
// finite and > 0. Field names: name, ingredientId, packSize.
func (in Input) Validate() error {
	if err := checkName(in.Name); err != nil {
		return &ValidationError{Field: "name", Message: err.Error()}
	}
	if in.IngredientID <= 0 {
		return &ValidationError{Field: "ingredientId", Message: "an Ingredient is required"}
	}
	if math.IsNaN(in.PackSize) || math.IsInf(in.PackSize, 0) || in.PackSize <= 0 {
		return &ValidationError{Field: "packSize", Message: "pack size must be a positive number"}
	}
	return nil
}

// NormalizeName trims and collapses internal whitespace.
func NormalizeName(s string) string { return strings.Join(strings.Fields(s), " ") }

// ValidateShopName: 1-100 runes after NormalizeName (field "name").
func ValidateShopName(s string) error {
	if err := checkName(s); err != nil {
		return &ValidationError{Field: "name", Message: err.Error()}
	}
	return nil
}

func checkName(s string) error {
	n := utf8.RuneCountInString(NormalizeName(s))
	switch {
	case n == 0:
		return errors.New("a name is required")
	case n > maxNameRunes:
		return errors.New("a name can have at most 100 characters")
	}
	return nil
}

// NormalizeBarcode returns the canonical form (barcode.Canonical) or
// ErrInvalidBarcode.
func NormalizeBarcode(raw string) (string, error) {
	code, ok := barcode.Canonical(raw)
	if !ok {
		return "", ErrInvalidBarcode
	}
	return code, nil
}

// ValidateItemCode checks item is all digits with exactly rule.Item.Length digits.
func ValidateItemCode(rule barcode.WeightRule, item string) error {
	if len(item) != rule.Item.Length || !allDigits(item) {
		return ErrInvalidItemCode
	}
	return nil
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for _, c := range s {
		if c < '0' || c > '9' {
			return false
		}
	}
	return true
}

// ShopBarcode is a code valid only in one Shop. Plain: Code set, RuleID 0.
// Weighed: RuleID and ItemCode set, Code empty.
type ShopBarcode struct {
	ID, ShopID, ProductID int64
	Code                  string
	RuleID                int64
	ItemCode              string
}

// CatalogRows is the raw material of one Shop's Catalog (all for that Shop).
type CatalogRows struct {
	Rules        []barcode.WeightRule
	ShopBarcodes []ShopBarcode
	Global       map[string]int64  // canonical code -> product id (all Products)
	Prices       map[int64][]Price // product id -> every Price of it at this Shop (any order)
}
