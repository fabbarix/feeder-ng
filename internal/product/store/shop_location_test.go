package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/product/store"
)

// Shop Location: saved on create or later, read back by Shop and Shops, kept by a rename.
func TestShopLocationIsSavedAndReadBack(t *testing.T) {
	f := newFx(t)
	at := &product.Location{Lat: 45.4642, Lon: 9.19}
	coop, err := f.s.CreateShop(ctx, "Coop", at)
	if err != nil {
		t.Fatal(err)
	}
	if coop.Location == nil || *coop.Location != *at {
		t.Fatalf("create: got %+v", coop.Location)
	}
	plain := f.shop(t, "Esselunga")
	if plain.Location != nil {
		t.Fatalf("no location: got %+v", plain.Location)
	}
	got, err := f.s.Shop(ctx, coop.ID)
	if err != nil || got.Location == nil || *got.Location != *at {
		t.Fatalf("Shop: got %+v, %v", got, err)
	}
	renamed, err := f.s.RenameShop(ctx, coop.ID, "Coop Centro")
	if err != nil || renamed.Location == nil || *renamed.Location != *at {
		t.Fatalf("rename keeps the location: got %+v, %v", renamed, err)
	}

	moved, err := f.s.SetShopLocation(ctx, plain.ID, product.Location{Lat: -33.86, Lon: 151.21})
	if err != nil || moved.Location == nil || moved.Location.Lat != -33.86 || moved.Name != "Esselunga" {
		t.Fatalf("set: got %+v, %v", moved, err)
	}
	all, _ := f.s.Shops(ctx)
	for _, sh := range all {
		if sh.Location == nil {
			t.Fatalf("Shops: %s lost its location", sh.Name)
		}
	}
}

func TestShopLocationIsValidated(t *testing.T) {
	f := newFx(t)
	if _, err := f.s.CreateShop(ctx, "Coop", &product.Location{Lat: 91}); !errors.Is(err, product.ErrInvalid) {
		t.Fatalf("create: got %v", err)
	}
	sh := f.shop(t, "Coop")
	if _, err := f.s.SetShopLocation(ctx, sh.ID, product.Location{Lon: 200}); !errors.Is(err, product.ErrInvalid) {
		t.Fatalf("set: got %v", err)
	}
	if _, err := f.s.SetShopLocation(ctx, 9999, product.Location{}); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("unknown Shop: got %v", err)
	}
}
