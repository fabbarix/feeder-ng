package product_test

import (
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/product"
)

func TestInputValidate(t *testing.T) {
	ok := product.Input{Name: "Mutti passata", IngredientID: 3, PackSize: 700}
	cases := []struct {
		name  string
		in    product.Input
		field string // "" = valid
	}{
		{"valid", ok, ""},
		{"spaces collapse before the length check", product.Input{Name: "  a  ", IngredientID: 1, PackSize: 1}, ""},
		{"100 runes is fine", product.Input{Name: strings.Repeat("é", 100), IngredientID: 1, PackSize: 1}, ""},
		{"101 runes is too long", product.Input{Name: strings.Repeat("é", 101), IngredientID: 1, PackSize: 1}, "name"},
		{"blank name", product.Input{Name: "   ", IngredientID: 1, PackSize: 1}, "name"},
		{"no ingredient", product.Input{Name: "x", IngredientID: 0, PackSize: 1}, "ingredientId"},
		{"zero pack size", product.Input{Name: "x", IngredientID: 1, PackSize: 0}, "packSize"},
		{"negative pack size", product.Input{Name: "x", IngredientID: 1, PackSize: -5}, "packSize"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.in.Validate()
			if c.field == "" {
				if err != nil {
					t.Fatalf("unexpected error %v", err)
				}
				return
			}
			var ve *product.ValidationError
			if !errors.As(err, &ve) || ve.Field != c.field {
				t.Fatalf("got %v, want a ValidationError on %q", err, c.field)
			}
			if !errors.Is(err, product.ErrInvalid) {
				t.Fatal("a ValidationError must match ErrInvalid")
			}
		})
	}
}

func TestInputRejectsNonFinitePackSize(t *testing.T) {
	for _, v := range []float64{inf(), -inf(), nan()} {
		if err := (product.Input{Name: "x", IngredientID: 1, PackSize: v}).Validate(); err == nil {
			t.Fatalf("pack size %v accepted", v)
		}
	}
}

func inf() float64 { var z float64; return 1 / z }
func nan() float64 { var z float64; return z / z }

func TestNormalizeName(t *testing.T) {
	if got := product.NormalizeName("  Mutti \t passata\n700 g "); got != "Mutti passata 700 g" {
		t.Fatalf("got %q", got)
	}
}

func TestValidateShopName(t *testing.T) {
	if err := product.ValidateShopName("Corner Market"); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"", "   ", strings.Repeat("x", 101)} {
		if err := product.ValidateShopName(bad); !errors.Is(err, product.ErrInvalid) {
			t.Fatalf("%q: got %v", bad, err)
		}
	}
}

func TestValidateLocation(t *testing.T) {
	for _, ok := range []product.Location{{Lat: 45.4642, Lon: 9.19}, {Lat: -90, Lon: -180}, {Lat: 90, Lon: 180}, {}} {
		if err := product.ValidateLocation(ok); err != nil {
			t.Errorf("%+v: %v", ok, err)
		}
	}
	for _, bad := range []product.Location{{Lat: 90.01}, {Lat: -91}, {Lon: 180.5}, {Lon: -181}, {Lat: math.NaN()}, {Lon: math.Inf(1)}} {
		err := product.ValidateLocation(bad)
		var ve *product.ValidationError
		if !errors.As(err, &ve) || ve.Field != "location" {
			t.Errorf("%+v: got %v, want a location ValidationError", bad, err)
		}
	}
}

func TestNormalizeBarcode(t *testing.T) {
	cases := []struct{ raw, want string }{
		{"8001234567897", "08001234567897"},   // EAN-13 -> GTIN-14
		{" 8001234567897 ", "08001234567897"}, // trimmed
		{"PRIVATE-77", "PRIVATE-77"},          // opaque stays as typed (trimmed)
	}
	for _, c := range cases {
		got, err := product.NormalizeBarcode(c.raw)
		if err != nil || got != c.want {
			t.Errorf("%q -> %q, %v; want %q", c.raw, got, err, c.want)
		}
	}
	for _, bad := range []string{"", "8001234567890" /* bad check digit */} {
		if _, err := product.NormalizeBarcode(bad); !errors.Is(err, product.ErrInvalidBarcode) {
			t.Errorf("%q: got %v, want ErrInvalidBarcode", bad, err)
		}
	}
}

func TestValidateItemCode(t *testing.T) {
	rule := barcode.WeightRule{Prefix: "21", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValueWeight}
	if err := product.ValidateItemCode(rule, "00123"); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{"123", "001234", "00x23", ""} {
		if err := product.ValidateItemCode(rule, bad); !errors.Is(err, product.ErrInvalidItemCode) {
			t.Errorf("%q: got %v", bad, err)
		}
	}
}
