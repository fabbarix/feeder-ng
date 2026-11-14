package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/product/store"
)

// B9-06, SET-02: Prices by Shop (docs/design/ui-review-3/settings.md SET-02).

func (f *fx) price(t *testing.T, productID, shopID int64, date string, cents int) store.Price {
	t.Helper()
	p, err := f.s.RecordPrice(ctx, productID, product.PriceInput{ShopID: shopID, Date: date, PriceCents: ip(cents)})
	if err != nil {
		t.Fatal(err)
	}
	return p
}

func TestShopPricesHoldsTheLatestPriceOfEachProductAtThatShop(t *testing.T) {
	f := newFx(t)
	coop, other := f.shop(t, "Coop"), f.shop(t, "Aldi")
	butter := f.prod(t, "Butter", f.milk, 250)
	f.price(t, butter.ID, coop.ID, "2026-10-01", 350)
	f.price(t, butter.ID, coop.ID, "2026-11-14", 374)
	f.price(t, butter.ID, other.ID, "2026-11-20", 100) // another Shop's Price is never returned

	got, err := f.s.ShopPrices(ctx, coop.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 1 {
		t.Fatalf("rows = %+v, want one (the latest Price of Butter at Coop)", got)
	}
	r := got[0]
	if r.Product.ID != butter.ID || r.Product.Name != "Butter" || r.Price.ShopID != coop.ID ||
		r.Price.Date != "2026-11-14" || r.Price.PriceCents == nil || *r.Price.PriceCents != 374 {
		t.Errorf("row = %+v, want Butter at Coop, 14 Nov, 374 cents", r)
	}
}

func TestShopPricesNeedsNoShopBarcode(t *testing.T) {
	f := newFx(t)
	coop := f.shop(t, "Coop")
	rice := f.prod(t, "Rice 1 kg", f.rice, 1000)
	f.price(t, rice.ID, coop.ID, "2026-11-14", 249)
	got, err := f.s.ShopPrices(ctx, coop.ID)
	if err != nil || len(got) != 1 || got[0].Product.ID != rice.ID {
		t.Fatalf("Coop has no Shop Barcodes yet its Price must be read: %+v, %v", got, err)
	}
}

func TestShopPricesAreSortedByProductNameAndLeaveOutArchivedProducts(t *testing.T) {
	f := newFx(t)
	coop := f.shop(t, "Coop")
	zucchini := f.prod(t, "Zucchini", f.rice, 500)
	apple := f.prod(t, "apple", f.rice, 500) // sorted ignoring case
	gone := f.prod(t, "Gone", f.rice, 500)
	for _, p := range []store.Detail{zucchini, apple, gone} {
		f.price(t, p.ID, coop.ID, "2026-11-14", 100)
	}
	f.archive(t, gone.ID)

	got, err := f.s.ShopPrices(ctx, coop.ID)
	if err != nil {
		t.Fatal(err)
	}
	names := []string{}
	for _, r := range got {
		names = append(names, r.Product.Name)
	}
	if len(names) != 2 || names[0] != "apple" || names[1] != "Zucchini" {
		t.Errorf("names = %v, want [apple Zucchini]: by name, archived Products left out", names)
	}
}

func TestShopPricesServeThePricePerKgExplicitOrDerived(t *testing.T) {
	f := newFx(t)
	coop := f.shop(t, "Coop")
	rice := f.prod(t, "Rice", f.rice, 500)  // base g: 249 cents / 500 g -> 498 per kg, derived
	milk := f.prod(t, "Milk", f.milk, 1000) // base ml: no per-kg
	f.price(t, rice.ID, coop.ID, "2026-11-14", 249)
	f.price(t, milk.ID, coop.ID, "2026-11-14", 120)

	got, err := f.s.ShopPrices(ctx, coop.ID)
	if err != nil || len(got) != 2 {
		t.Fatalf("rows = %+v, %v", got, err)
	}
	byName := map[string]store.ShopPrice{}
	for _, r := range got {
		byName[r.Product.Name] = r
	}
	if p := byName["Rice"].Price; p.PricePerKgCents == nil || *p.PricePerKgCents != 498 || !p.PricePerKgDerived {
		t.Errorf("Rice price per kg = %+v, want 498 derived from the pack size", p)
	}
	if p := byName["Milk"].Price; p.PricePerKgCents != nil {
		t.Errorf("Milk price per kg = %v, want none for a millilitre Product", *p.PricePerKgCents)
	}
}

func TestShopPricesOfAShopWithNoPricesIsAnEmptyList(t *testing.T) {
	f := newFx(t)
	coop := f.shop(t, "Coop")
	got, err := f.s.ShopPrices(ctx, coop.ID)
	if err != nil || got == nil || len(got) != 0 {
		t.Fatalf("got %#v, %v; want an empty, non-nil list (it serialises as [])", got, err)
	}
}

func TestShopPricesOfAnUnknownShopIsNotFound(t *testing.T) {
	f := newFx(t)
	if _, err := f.s.ShopPrices(ctx, 999); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("got %v, want ErrNotFound", err)
	}
}
