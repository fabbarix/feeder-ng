package product_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/units"
)

func ip(n int) *int { return &n }

func TestPriceInputValidate(t *testing.T) {
	good := product.PriceInput{ShopID: 1, Date: "2026-11-09", PriceCents: ip(159)}
	cases := []struct {
		name  string
		in    product.PriceInput
		field string
	}{
		{"pack price", good, ""},
		{"price per kg only", product.PriceInput{ShopID: 1, Date: "2026-11-09", PricePerKgCents: ip(1800)}, ""},
		{"both", product.PriceInput{ShopID: 1, Date: "2026-11-09", PriceCents: ip(159), PricePerKgCents: ip(227)}, ""},
		{"leap day", product.PriceInput{ShopID: 1, Date: "2028-02-29", PriceCents: ip(1)}, ""},
		{"no amount", product.PriceInput{ShopID: 1, Date: "2026-11-09"}, "priceCents"},
		{"zero amount", product.PriceInput{ShopID: 1, Date: "2026-11-09", PriceCents: ip(0)}, "priceCents"},
		{"negative per kg", product.PriceInput{ShopID: 1, Date: "2026-11-09", PricePerKgCents: ip(-1)}, "pricePerKgCents"},
		{"no shop", product.PriceInput{Date: "2026-11-09", PriceCents: ip(5)}, "shopId"},
		{"not a date", product.PriceInput{ShopID: 1, Date: "09/11/2026", PriceCents: ip(5)}, "date"},
		{"impossible date", product.PriceInput{ShopID: 1, Date: "2026-02-30", PriceCents: ip(5)}, "date"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			err := c.in.Validate()
			if c.field == "" {
				if err != nil {
					t.Fatal(err)
				}
				return
			}
			var ve *product.ValidationError
			if !errors.As(err, &ve) || ve.Field != c.field {
				t.Fatalf("got %v, want field %q", err, c.field)
			}
		})
	}
}

func TestPricePerKg(t *testing.T) {
	cases := []struct {
		name        string
		p           product.Price
		pack        float64
		base        units.Base
		cents       int
		derived, ok bool
	}{
		{"explicit wins", product.Price{PriceCents: ip(159), PricePerKgCents: ip(1800)}, 700, units.Gram, 1800, false, true},
		{"explicit without pack", product.Price{PricePerKgCents: ip(1800)}, 0, units.Piece, 1800, false, true},
		{"derived: 159 cents for 700 g", product.Price{PriceCents: ip(159)}, 700, units.Gram, 227, true, true}, // 227.14
		{"derived rounds half up", product.Price{PriceCents: ip(3)}, 400, units.Gram, 8, true, true},           // 7.5
		{"derived exact: 450 cents for 250 g", product.Price{PriceCents: ip(450)}, 250, units.Gram, 1800, true, true},
		{"millilitres have no price per kg", product.Price{PriceCents: ip(159)}, 700, units.Millilitre, 0, false, false},
		{"pieces have no price per kg", product.Price{PriceCents: ip(300)}, 6, units.Piece, 0, false, false},
		{"zero pack size", product.Price{PriceCents: ip(159)}, 0, units.Gram, 0, false, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			cents, derived, ok := product.PricePerKg(c.p, c.pack, c.base)
			if cents != c.cents || derived != c.derived || ok != c.ok {
				t.Fatalf("got (%d, %v, %v), want (%d, %v, %v)", cents, derived, ok, c.cents, c.derived, c.ok)
			}
		})
	}
}

func TestLatestPrice(t *testing.T) {
	if _, ok := product.LatestPrice(nil); ok {
		t.Fatal("empty list has no latest Price")
	}
	prices := []product.Price{
		{ID: 1, Date: "2026-10-01", PriceCents: ip(150)},
		{ID: 3, Date: "2026-11-02", PriceCents: ip(165)},
		{ID: 2, Date: "2026-11-02", PriceCents: ip(160)},
		{ID: 4, Date: "2026-09-30", PriceCents: ip(140)},
	}
	got, ok := product.LatestPrice(prices)
	if !ok || got.ID != 3 {
		t.Fatalf("got %+v, want the highest id on the latest date (3)", got)
	}
}

// r3-scan-fixes B5: what a weighed scan costs.
func TestPriceForWeight(t *testing.T) {
	cases := []struct {
		name     string
		price    product.Price
		packSize float64
		base     units.Base
		grams    float64
		want     int
		ok       bool
	}{
		{"1 kg pack at 8.99, 850 g", product.Price{PriceCents: ip(899)}, 1000, units.Gram, 850, 764, true},
		{"1 kg pack at 8.99, 450 g (404.55 rounds up)", product.Price{PriceCents: ip(899)}, 1000, units.Gram, 450, 405, true},
		{"half up at exactly .5: 1 cent a kg x 500 g", product.Price{PricePerKgCents: ip(1)}, 1000, units.Gram, 500, 1, true},
		{"explicit price per kg wins over the pack price", product.Price{PriceCents: ip(300), PricePerKgCents: ip(1800)}, 500, units.Gram, 250, 450, true},
		{"500 g pack at 3.00, 450 g: no double rounding", product.Price{PriceCents: ip(300)}, 500, units.Gram, 450, 270, true},
		{"fractional grams", product.Price{PricePerKgCents: ip(899)}, 1000, units.Gram, 850.5, 765, true},
		{"no price at all", product.Price{}, 1000, units.Gram, 850, 0, false},
		{"pack price on a millilitre Product has no weight basis", product.Price{PriceCents: ip(899)}, 1000, units.Millilitre, 850, 0, false},
		{"pack price without a pack size", product.Price{PriceCents: ip(899)}, 0, units.Gram, 850, 0, false},
		{"zero grams", product.Price{PriceCents: ip(899)}, 1000, units.Gram, 0, 0, false},
		{"under one cent", product.Price{PricePerKgCents: ip(1)}, 1000, units.Gram, 100, 0, false},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := product.PriceForWeight(c.price, c.packSize, c.base, c.grams)
			if ok != c.ok || got != c.want {
				t.Fatalf("PriceForWeight = %d, %v; want %d, %v", got, ok, c.want, c.ok)
			}
		})
	}
}
