package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/product/store"
)

// R8: a bought Product is archived instead of deleted. See docs/dev/design/r8-product-archive.md.

func (f *fx) archive(t *testing.T, id int64) {
	t.Helper()
	d, err := f.s.SetArchived(ctx, id, true)
	if err != nil {
		t.Fatal(err)
	}
	if !d.Archived {
		t.Fatal("SetArchived(true) must return the Product with Archived set")
	}
}

func ids(list []store.Product) []int64 {
	out := []int64{}
	for _, p := range list {
		out = append(out, p.ID)
	}
	return out
}

func TestArchivedProductIsHiddenFromListsUnlessIncluded(t *testing.T) {
	f := newFx(t)
	a := f.prod(t, "Alpha", f.tomato, 700, "8001234567897")
	b := f.prod(t, "Beta", f.tomato, 400)
	f.archive(t, a.ID)

	got, err := f.s.Products(ctx, store.Filter{})
	if err != nil || len(got) != 1 || got[0].ID != b.ID || got[0].Archived {
		t.Fatalf("default list must hold only active Products: %v %v", got, err)
	}
	all, err := f.s.Products(ctx, store.Filter{IncludeArchived: true})
	if err != nil || len(all) != 2 || all[0].ID != a.ID || !all[0].Archived || all[1].Archived {
		t.Fatalf("IncludeArchived lists both, flagged: %v %v", all, err)
	}
	// every other filter honours the same default
	for name, flt := range map[string]store.Filter{
		"query":      {Query: "alp"},
		"ingredient": {IngredientID: f.tomato},
		"barcode":    {Barcode: "8001234567897"},
	} {
		list, err := f.s.Products(ctx, flt)
		if err != nil {
			t.Fatal(err)
		}
		for _, id := range ids(list) {
			if id == a.ID {
				t.Errorf("%s filter returned the archived Product", name)
			}
		}
		flt.IncludeArchived = true
		list, _ = f.s.Products(ctx, flt)
		found := false
		for _, id := range ids(list) {
			found = found || id == a.ID
		}
		if !found {
			t.Errorf("%s filter with IncludeArchived must find the archived Product", name)
		}
	}
}

func TestArchiveKeepsHistoryAndIsIdempotentAndReversible(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Corner Market")
	p := f.prod(t, "Alpha", f.tomato, 700, "8001234567897")
	if _, err := f.s.RecordPrice(ctx, p.ID, product.PriceInput{ShopID: shop.ID, Date: "2026-11-01", PriceCents: ip(199)}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.RecordPurchase(ctx, p.ID, &shop.ID, "2026-11-02"); err != nil {
		t.Fatal(err)
	}
	f.archive(t, p.ID)
	f.archive(t, p.ID) // idempotent

	d, err := f.s.Product(ctx, p.ID) // still readable by id
	if err != nil || !d.Archived || len(d.Barcodes) != 1 || len(d.LatestPrices) != 1 {
		t.Fatalf("an archived Product keeps barcodes and Prices: %+v %v", d, err)
	}
	if pr, ok, err := f.s.LatestPrice(ctx, p.ID, nil); err != nil || !ok || *pr.PriceCents != 199 {
		t.Fatalf("Prices survive archiving: %v %v %v", pr, ok, err)
	}
	var n int
	f.db.QueryRow(`SELECT COUNT(*) FROM purchases WHERE product_id=?`, p.ID).Scan(&n)
	if n != 1 {
		t.Fatalf("purchase history must stay, got %d", n)
	}

	d, err = f.s.SetArchived(ctx, p.ID, false)
	if err != nil || d.Archived {
		t.Fatalf("unarchive: %+v %v", d, err)
	}
	if _, err := f.s.SetArchived(ctx, p.ID, false); err != nil { // idempotent
		t.Fatal(err)
	}
	list, _ := f.s.Products(ctx, store.Filter{})
	if len(list) != 1 {
		t.Fatalf("an unarchived Product is listed again: %v", list)
	}
}

func TestArchiveUnknownProductIsNotFound(t *testing.T) {
	f := newFx(t)
	if _, err := f.s.SetArchived(ctx, 4242, true); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestBoughtProductDeleteIsRefusedWithErrBought(t *testing.T) {
	f := newFx(t)
	a := f.shop(t, "A")
	p := f.prod(t, "P", f.tomato, 700)
	f.s.RecordPurchase(ctx, p.ID, &a.ID, "2026-11-09")
	err := f.s.DeleteProduct(ctx, p.ID)
	if !errors.Is(err, store.ErrBought) || !errors.Is(err, store.ErrInUse) {
		t.Fatalf("a bought Product: want ErrBought (which is an ErrInUse), got %v", err)
	}
	f.archive(t, p.ID)
	if err := f.s.DeleteProduct(ctx, p.ID); !errors.Is(err, store.ErrBought) {
		t.Fatalf("archiving does not make a bought Product deletable: %v", err)
	}
}

func TestNeverBoughtProductCanBeDeletedArchivedOrNot(t *testing.T) {
	f := newFx(t)
	p := f.prod(t, "P", f.tomato, 700, "8001234567897")
	f.archive(t, p.ID)
	if err := f.s.DeleteProduct(ctx, p.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.Product(ctx, p.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("got %v", err)
	}
	// its barcode is free again
	f.prod(t, "Q", f.tomato, 700, "8001234567897")
}

func TestArchivedProductsLeaveTheCatalogUntilUnarchived(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Butcher")
	ham := f.prod(t, "Ham", f.rice, 1000, "8001234567897")
	rule, err := f.s.CreateRule(ctx, shop.ID, barcode.WeightRule{Prefix: "21", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValueWeight})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.AddWeighedShopBarcode(ctx, shop.ID, ham.ID, rule.ID, "00123"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.AddShopBarcode(ctx, shop.ID, ham.ID, "PRIVATE-77"); err != nil {
		t.Fatal(err)
	}
	keep := f.prod(t, "Rice", f.rice, 1000, "5901234123457")
	f.archive(t, ham.ID)

	cat, err := f.s.Catalog(ctx, &shop.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(cat.GlobalBarcodes) != 1 || len(cat.ShopBarcodes) != 0 || len(cat.WeightProducts) != 0 {
		t.Fatalf("the archived Product must be absent from every Catalog map: %+v", cat)
	}
	if cat.GlobalBarcodes["05901234123457"] != keep.ID {
		t.Fatalf("active Products stay: %+v", cat.GlobalBarcodes)
	}
	if home, _ := f.s.Catalog(ctx, nil); len(home.GlobalBarcodes) != 1 {
		t.Fatalf("home Catalog: %+v", home)
	}

	if _, err := f.s.SetArchived(ctx, ham.ID, false); err != nil {
		t.Fatal(err)
	}
	cat, _ = f.s.Catalog(ctx, &shop.ID)
	if len(cat.GlobalBarcodes) != 2 || len(cat.ShopBarcodes) != 1 || len(cat.WeightProducts) != 1 {
		t.Fatalf("unarchiving restores every barcode: %+v", cat)
	}
}

func TestResolveTreatsAnArchivedProductAsUnknownAndNamesIt(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Butcher")
	p := f.prod(t, "Mutti passata", f.tomato, 700, "8001234567897")
	f.s.AddShopBarcode(ctx, shop.ID, p.ID, "PRIVATE-77")
	rule, _ := f.s.CreateRule(ctx, shop.ID, barcode.WeightRule{Prefix: "21", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValueWeight})
	f.s.AddWeighedShopBarcode(ctx, shop.ID, p.ID, rule.ID, "00123")

	active, err := f.s.Resolve(ctx, "8001234567897", barcode.FormatEAN13, &shop.ID)
	if err != nil || active.Resolution.Outcome != barcode.OutcomeProduct || active.ArchivedProduct != nil {
		t.Fatalf("active: %+v %v", active, err)
	}
	f.archive(t, p.ID)

	for name, c := range map[string]struct {
		raw    string
		format barcode.Format
		shop   *int64
		want   barcode.Outcome
	}{
		"global at a Shop": {"8001234567897", barcode.FormatEAN13, &shop.ID, barcode.OutcomeUnknown},
		"global at home":   {"8001234567897", barcode.FormatEAN13, nil, barcode.OutcomeUnknown},
		"Shop Barcode":     {"PRIVATE-77", barcode.FormatCode128, &shop.ID, barcode.OutcomeUnknown},
		"weighed item":     {"2100123007509", barcode.FormatEAN13, &shop.ID, barcode.OutcomeUnknownWeighedProduct},
	} {
		got, err := f.s.Resolve(ctx, c.raw, c.format, c.shop)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if got.Resolution.Outcome != c.want || got.Product != nil {
			t.Errorf("%s: an archived Product must not resolve (want %s, no product): %+v", name, c.want, got)
		}
		if got.ArchivedProduct == nil || got.ArchivedProduct.ID != p.ID || !got.ArchivedProduct.Archived {
			t.Errorf("%s: the response must name the archived owner so the UI can offer to unarchive: %+v", name, got.ArchivedProduct)
		}
	}
	// a truly unknown code names nobody
	if got, _ := f.s.Resolve(ctx, "4006381333931", barcode.FormatEAN13, &shop.ID); got.ArchivedProduct != nil {
		t.Fatalf("unknown code: %+v", got)
	}
}

func TestLastBoughtNeverSuggestsAnArchivedProduct(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Corner Market")
	other := f.shop(t, "Big Mart")
	old := f.prod(t, "Passata 400", f.tomato, 400)
	newer := f.prod(t, "Passata 700", f.tomato, 700)
	f.s.RecordPurchase(ctx, old.ID, &other.ID, "2026-10-20")
	f.s.RecordPurchase(ctx, newer.ID, &shop.ID, "2026-11-02")
	f.archive(t, newer.ID)

	p, ok, err := f.s.LastBought(ctx, f.tomato, &shop.ID)
	if err != nil || !ok || p.ID != old.ID {
		t.Fatalf("at the Shop the archived one is skipped, falling back to any Shop: %v %v %v", p, ok, err)
	}
	m, err := f.s.LastBoughtMany(ctx, []int64{f.tomato, f.rice}, nil)
	if err != nil || m[f.tomato].ID != old.ID || len(m) != 1 {
		t.Fatalf("%v %v", m, err)
	}
	f.archive(t, old.ID)
	if _, ok, _ := f.s.LastBought(ctx, f.tomato, nil); ok {
		t.Fatal("with every bought Product archived there is no suggestion (exact amounts)")
	}
	f.s.SetArchived(ctx, newer.ID, false)
	if p, ok, _ := f.s.LastBought(ctx, f.tomato, nil); !ok || p.ID != newer.ID {
		t.Fatalf("unarchiving brings the suggestion back: %v %v", p, ok)
	}
}

func TestBarcodeOfAnArchivedProductIsStillTaken(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Corner Market")
	owner := f.prod(t, "Old passata", f.tomato, 700, "8001234567897")
	f.s.AddShopBarcode(ctx, shop.ID, owner.ID, "PRIVATE-77")
	live := f.prod(t, "Live", f.rice, 500, "5901234123457")
	f.archive(t, owner.ID)

	var taken *store.BarcodeTakenError
	_, err := f.s.CreateProduct(ctx, newP("New passata", f.tomato, 700, "8001234567897")) // claims the same global barcode
	if !errors.As(err, &taken) || taken.ProductID != owner.ID || !taken.Archived {
		t.Fatalf("want *BarcodeTakenError{ProductID: owner, Archived: true}, got %v", err)
	}
	if list, _ := f.s.Products(ctx, store.Filter{Query: "New"}); len(list) != 0 {
		t.Fatal("the refused create must leave nothing behind")
	}
	taken = nil
	if err := f.s.AddBarcode(ctx, live.ID, "8001234567897"); !errors.As(err, &taken) || !taken.Archived {
		t.Fatalf("AddBarcode: %v", err)
	}
	taken = nil
	if _, err := f.s.AddShopBarcode(ctx, shop.ID, live.ID, "PRIVATE-77"); !errors.As(err, &taken) || taken.ProductID != owner.ID || !taken.Archived {
		t.Fatalf("AddShopBarcode: %v", err)
	}
	// an active owner is still reported as not archived
	taken = nil
	if err := f.s.AddBarcode(ctx, owner.ID, "5901234123457"); !errors.As(err, &taken) || taken.Archived || taken.ProductID != live.ID {
		t.Fatalf("active owner: %v", err)
	}
	// unarchive, then archive-free create is still refused (now as a plain taken)
	f.s.SetArchived(ctx, owner.ID, false)
	taken = nil
	_, err = f.s.CreateProduct(ctx, newP("New passata", f.tomato, 700, "8001234567897"))
	if !errors.As(err, &taken) || taken.Archived {
		t.Fatalf("got %v", err)
	}
}

func TestPurchasesAndPricesCanStillBeRecordedForAnArchivedProduct(t *testing.T) {
	// An offline phone may replay a scan of a Product that was archived meanwhile; the
	// purchase and Price are true and must not be lost.
	f := newFx(t)
	shop := f.shop(t, "Corner Market")
	p := f.prod(t, "P", f.tomato, 700)
	f.archive(t, p.ID)
	if _, err := f.s.RecordPurchase(ctx, p.ID, &shop.ID, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.RecordPrice(ctx, p.ID, product.PriceInput{ShopID: shop.ID, Date: "2026-11-09", PriceCents: ip(150)}); err != nil {
		t.Fatal(err)
	}
}

func newP(name string, ing int64, size float64, code string) store.NewProduct {
	return store.NewProduct{Input: product.Input{Name: name, IngredientID: ing, PackSize: size}, Barcodes: []string{code}}
}
