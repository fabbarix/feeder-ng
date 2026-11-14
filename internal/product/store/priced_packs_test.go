package store_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/product"
)

// B9-06, SSP-13: the priced Product of an Ingredient before a first purchase (SSP 5).

func TestPricedPacksTakeTheMostRecentPriceAtTheSelectedShop(t *testing.T) {
	f := newFx(t)
	coop := f.shop(t, "Coop")
	old := f.prod(t, "Old pack", f.tomato, 700)
	fresh := f.prod(t, "Fresh pack", f.tomato, 700)
	f.price(t, old.ID, coop.ID, "2026-10-01", 199)
	f.price(t, fresh.ID, coop.ID, "2026-11-14", 349)

	got, err := f.s.PricedPacks(ctx, []int64{f.tomato}, &coop.ID)
	if err != nil {
		t.Fatal(err)
	}
	p, ok := got[f.tomato]
	if !ok || p.Product.ID != fresh.ID || p.Price.PriceCents == nil || *p.Price.PriceCents != 349 || p.Price.Date != "2026-11-14" {
		t.Fatalf("got %+v, want Fresh pack at 349 on 14 Nov (the most recent Price)", got)
	}
	if p.Product.PackSize != 700 {
		t.Errorf("pack size = %v, want the Product's 700", p.Product.PackSize)
	}
}

func TestPricedPacksBreakATieByThePricePerBaseUnit(t *testing.T) {
	f := newFx(t)
	coop := f.shop(t, "Coop")
	small := f.prod(t, "Small", f.rice, 500)  // 200 / 500 g = 0.40 per g
	large := f.prod(t, "Large", f.rice, 1000) // 300 / 1000 g = 0.30 per g
	f.price(t, small.ID, coop.ID, "2026-11-14", 200)
	f.price(t, large.ID, coop.ID, "2026-11-14", 300)

	got, err := f.s.PricedPacks(ctx, []int64{f.rice}, &coop.ID)
	if err != nil || got[f.rice].Product.ID != large.ID {
		t.Fatalf("got %+v, %v; want Large (same date, cheaper per gram)", got, err)
	}
}

func TestPricedPacksPreferTheSelectedShopOverANewerPriceElsewhere(t *testing.T) {
	f := newFx(t)
	coop, aldi := f.shop(t, "Coop"), f.shop(t, "Aldi")
	here := f.prod(t, "At Coop", f.tomato, 700)
	there := f.prod(t, "At Aldi", f.tomato, 700)
	f.price(t, here.ID, coop.ID, "2026-10-01", 299)
	f.price(t, there.ID, aldi.ID, "2026-11-14", 199)

	got, err := f.s.PricedPacks(ctx, []int64{f.tomato}, &coop.ID)
	if err != nil || got[f.tomato].Product.ID != here.ID {
		t.Fatalf("got %+v, %v; want the Product priced at the selected Shop", got, err)
	}
}

func TestPricedPacksFallBackToAnyShopWhenTheSelectedShopHasNone(t *testing.T) {
	f := newFx(t)
	coop, aldi := f.shop(t, "Coop"), f.shop(t, "Aldi")
	there := f.prod(t, "At Aldi", f.tomato, 700)
	f.price(t, there.ID, aldi.ID, "2026-11-14", 199)

	got, err := f.s.PricedPacks(ctx, []int64{f.tomato}, &coop.ID)
	if err != nil || got[f.tomato].Product.ID != there.ID {
		t.Fatalf("selected Shop with no Price: got %+v, %v; want the Product priced at any Shop", got, err)
	}
	got, err = f.s.PricedPacks(ctx, []int64{f.tomato}, nil)
	if err != nil || got[f.tomato].Product.ID != there.ID {
		t.Fatalf("no selected Shop: got %+v, %v", got, err)
	}
}

func TestPricedPacksLeaveOutArchivedProductsAndIngredientsWithoutAPackPrice(t *testing.T) {
	f := newFx(t)
	coop := f.shop(t, "Coop")
	gone := f.prod(t, "Gone", f.tomato, 700)
	f.price(t, gone.ID, coop.ID, "2026-11-14", 199)
	f.archive(t, gone.ID)
	// Rice has a Product with only a price per kg: that is no pack Price.
	kg := f.prod(t, "Rice by weight", f.rice, 1000)
	if _, err := f.s.RecordPrice(ctx, kg.ID, product.PriceInput{ShopID: coop.ID, Date: "2026-11-14", PricePerKgCents: ip(250)}); err != nil {
		t.Fatal(err)
	}
	f.prod(t, "Milk, never priced", f.milk, 1000)

	got, err := f.s.PricedPacks(ctx, []int64{f.tomato, f.rice, f.milk}, &coop.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Fatalf("got %+v, want nothing: archived, per-kg only and never priced are all absent", got)
	}
}

func TestPricedPacksAnswerForManyIngredientsAtOnce(t *testing.T) {
	f := newFx(t)
	coop := f.shop(t, "Coop")
	a := f.prod(t, "Passata", f.tomato, 700)
	b := f.prod(t, "Milk 1 l", f.milk, 1000)
	f.price(t, a.ID, coop.ID, "2026-11-14", 349)
	f.price(t, b.ID, coop.ID, "2026-11-13", 129)
	got, err := f.s.PricedPacks(ctx, []int64{f.tomato, f.milk, f.rice}, &coop.ID)
	if err != nil || len(got) != 2 || got[f.tomato].Product.ID != a.ID || got[f.milk].Product.ID != b.ID {
		t.Fatalf("got %+v, %v; want Passata and Milk, and no Rice", got, err)
	}
}

func TestPricedPacksKeepAnOlderPackPriceWhenTheNewestIsPerKgOnly(t *testing.T) {
	// The Product's newest Price at Coop is per kg only; its older pack Price still prices it, and PricedPack carries
	// that pack Price so the Shopping List can estimate from it.
	f := newFx(t)
	coop := f.shop(t, "Coop")
	p := f.prod(t, "Passata", f.tomato, 700)
	f.price(t, p.ID, coop.ID, "2026-10-01", 299)
	if _, err := f.s.RecordPrice(ctx, p.ID, product.PriceInput{ShopID: coop.ID, Date: "2026-11-14", PricePerKgCents: ip(450)}); err != nil {
		t.Fatal(err)
	}
	got, err := f.s.PricedPacks(ctx, []int64{f.tomato}, &coop.ID)
	if err != nil {
		t.Fatal(err)
	}
	pp, ok := got[f.tomato]
	if !ok || pp.Product.ID != p.ID || pp.Price.PriceCents == nil || *pp.Price.PriceCents != 299 || pp.Price.Date != "2026-10-01" {
		t.Fatalf("got %+v, want Passata with its 1 Oct pack Price of 299", got)
	}
}
