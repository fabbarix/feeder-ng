package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/product/store"
)

// B9-06, SET-04 (decision SET 1 = B): a typed Product barcode made only of digits must be 8, 12, 13 or 14 digits long
// with a valid check digit; a code with letters stays accepted. The chapter's example '4006381333932' has a wrong
// check digit (the right one is '4006381333931'), so these tests use the valid one.

var (
	badDigitCodes = []string{
		"123",             // far too short
		"1234567",         // 7 digits
		"123456789",       // 9 digits
		"12345678901",     // 11 digits
		"123456789012345", // 15 digits
		"8001234567890",   // 13 digits, wrong check digit
		"96385075",        // EAN-8, wrong check digit
		"036000291453",    // UPC-A, wrong check digit
	}
	goodCodes = []string{
		"8001234567897", // EAN-13
		"4006381333931", // EAN-13
		"96385074",      // EAN-8
		"036000291452",  // UPC-A
		"PRIVATE-77",    // letters: a Shop's own label
		"AB12",          // letters, short
		"2100-0042",     // not only digits
	}
)

func TestATypedDigitsOnlyBarcodeNeedsALengthAndACheckDigit(t *testing.T) {
	f := newFx(t)
	p := f.prod(t, "Passata", f.tomato, 700)
	for _, code := range badDigitCodes {
		if err := f.s.AddBarcode(ctx, p.ID, code); !errors.Is(err, product.ErrInvalidBarcode) {
			t.Errorf("AddBarcode(%q) = %v, want ErrInvalidBarcode", code, err)
		}
	}
	for _, code := range goodCodes {
		if err := f.s.AddBarcode(ctx, p.ID, code); err != nil {
			t.Errorf("AddBarcode(%q) = %v, want it accepted", code, err)
		}
	}
}

func TestCreatingAProductRefusesABadDigitsOnlyBarcodeAndCreatesNothing(t *testing.T) {
	f := newFx(t)
	_, err := f.s.CreateProduct(ctx, store.NewProduct{
		Input: product.Input{Name: "Passata", IngredientID: f.tomato, PackSize: 700}, Barcodes: []string{"8001234567897", "123"}})
	if !errors.Is(err, product.ErrInvalidBarcode) {
		t.Fatalf("got %v, want ErrInvalidBarcode", err)
	}
	list, err := f.s.Products(ctx, store.Filter{})
	if err != nil || len(list) != 0 {
		t.Fatalf("a refused create must leave no Product: %v, %v", list, err)
	}
}

func TestAShopsOwnDigitsOnlyLabelIsStillAShopBarcode(t *testing.T) {
	// Guard, not a new rule: the check applies to typed Product barcodes only (SET 1). A Shop's own short label
	// stays a Shop Barcode and still resolves in that Shop.
	f := newFx(t)
	shop := f.shop(t, "Corner Market")
	p := f.prod(t, "Loose onions", f.tomato, 1000)
	if _, err := f.s.AddShopBarcode(ctx, shop.ID, p.ID, "12345"); err != nil {
		t.Fatalf("AddShopBarcode(12345) = %v, want it accepted", err)
	}
}
