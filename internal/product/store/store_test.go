package store_test

import (
	"context"
	"database/sql"
	"errors"
	"path/filepath"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/product/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// These tests need migration 0200 (ingredients, team T2) next to 0400. Ingredients are
// inserted with SQL so this package does not import T2's Go code.

var ctx = context.Background()

func ip(n int) *int { return &n }

type fx struct {
	db                 *sql.DB
	s                  *store.Store
	tomato, rice, milk int64 // Ingredient ids: g, g, ml
}

func newFx(t *testing.T) *fx {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(ctx, d); err != nil {
		t.Fatal(err)
	}
	f := &fx{db: d, s: store.New(d, clock.NewFake(testkit.StartTime))}
	ins := func(name, base string) int64 {
		res, err := d.Exec(`INSERT INTO ingredients(name, name_key, base_unit, created_at, updated_at) VALUES (?,?,?,?,?)`,
			name, name, base, "2026-11-09T12:00:00Z", "2026-11-09T12:00:00Z")
		if err != nil {
			t.Fatal(err)
		}
		id, _ := res.LastInsertId()
		return id
	}
	f.tomato, f.rice, f.milk = ins("tomato passata", "g"), ins("rice", "g"), ins("milk", "ml")
	return f
}

func (f *fx) shop(t *testing.T, name string) store.Shop {
	t.Helper()
	s, err := f.s.CreateShop(ctx, name, nil)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func (f *fx) prod(t *testing.T, name string, ing int64, size float64, barcodes ...string) store.Detail {
	t.Helper()
	d, err := f.s.CreateProduct(ctx, store.NewProduct{Input: product.Input{Name: name, IngredientID: ing, PackSize: size}, Barcodes: barcodes})
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func TestShopNamesAreUniqueIgnoringCaseAndSpacing(t *testing.T) {
	f := newFx(t)
	f.shop(t, "Corner Market")
	if _, err := f.s.CreateShop(ctx, "  corner   market ", nil); !errors.Is(err, store.ErrNameTaken) {
		t.Fatalf("got %v", err)
	}
	if _, err := f.s.CreateShop(ctx, "  ", nil); !errors.Is(err, product.ErrInvalid) {
		t.Fatalf("blank: got %v", err)
	}
}

func TestShopsAreOrderedByName(t *testing.T) {
	f := newFx(t)
	f.shop(t, "Zed")
	f.shop(t, "alpha")
	f.shop(t, "Mid")
	got, _ := f.s.Shops(ctx)
	var names []string
	for _, s := range got {
		names = append(names, s.Name)
	}
	if !reflect.DeepEqual(names, []string{"alpha", "Mid", "Zed"}) {
		t.Fatalf("got %v", names)
	}
}

func TestRenameShopKeepsIdAndChecksUniqueness(t *testing.T) {
	f := newFx(t)
	a, b := f.shop(t, "A"), f.shop(t, "B")
	r, err := f.s.RenameShop(ctx, a.ID, "Alpha")
	if err != nil || r.ID != a.ID || r.Name != "Alpha" {
		t.Fatalf("%+v %v", r, err)
	}
	if _, err := f.s.RenameShop(ctx, a.ID, "b"); !errors.Is(err, store.ErrNameTaken) {
		t.Fatalf("got %v", err)
	}
	_ = b
	if _, err := f.s.RenameShop(ctx, 999, "x"); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("got %v", err)
	}
}

func TestCreateProductIsAtomicWithBarcodesAndShopBarcodes(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Corner Market")
	d, err := f.s.CreateProduct(ctx, store.NewProduct{
		Input:        product.Input{Name: " Mutti  passata 700 g", IngredientID: f.tomato, PackSize: 700},
		Barcodes:     []string{"8001234567897"},
		ShopBarcodes: []store.NewShopBarcode{{ShopID: shop.ID, Code: "PRIVATE-77"}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if d.Name != "Mutti passata 700 g" || d.IngredientName != "tomato passata" || d.BaseUnit != "g" || d.PackSize != 700 {
		t.Errorf("detail = %+v", d.Product)
	}
	if !reflect.DeepEqual(d.Barcodes, []string{"08001234567897"}) {
		t.Errorf("barcodes = %v (stored canonical)", d.Barcodes)
	}
	if len(d.ShopBarcodes) != 1 || d.ShopBarcodes[0].Code != "PRIVATE-77" {
		t.Errorf("shop barcodes = %+v", d.ShopBarcodes)
	}
	if len(d.Shops) != 1 || d.Shops[0].ID != shop.ID {
		t.Errorf("a Shop Barcode records the Product as sold there: %+v", d.Shops)
	}
}

func TestCreateProductRollsBackWhenABarcodeIsTaken(t *testing.T) {
	f := newFx(t)
	first := f.prod(t, "First", f.tomato, 700, "8001234567897")
	_, err := f.s.CreateProduct(ctx, store.NewProduct{
		Input:    product.Input{Name: "Second", IngredientID: f.tomato, PackSize: 500},
		Barcodes: []string{"5901234123457", "8001234567897"},
	})
	var taken *store.BarcodeTakenError
	if !errors.As(err, &taken) || taken.ProductID != first.ID {
		t.Fatalf("got %v, want BarcodeTakenError for product %d", err, first.ID)
	}
	all, _ := f.s.Products(ctx, store.Filter{})
	if len(all) != 1 {
		t.Fatalf("the failed create left %d Products", len(all))
	}
	if p, _ := f.s.Products(ctx, store.Filter{Barcode: "5901234123457"}); len(p) != 0 {
		t.Fatal("the first barcode of the failed create was kept")
	}
}

func TestCreateProductRejects(t *testing.T) {
	f := newFx(t)
	_, err := f.s.CreateProduct(ctx, store.NewProduct{Input: product.Input{Name: "x", IngredientID: 999, PackSize: 1}})
	if !errors.Is(err, store.ErrUnknownIngredient) {
		t.Errorf("unknown ingredient: %v", err)
	}
	_, err = f.s.CreateProduct(ctx, store.NewProduct{Input: product.Input{Name: "x", IngredientID: f.tomato, PackSize: 1}, Barcodes: []string{"8001234567890"}})
	if !errors.Is(err, product.ErrInvalidBarcode) {
		t.Errorf("bad check digit: %v", err)
	}
	_, err = f.s.CreateProduct(ctx, store.NewProduct{Input: product.Input{Name: "x", IngredientID: f.tomato, PackSize: 0}})
	if !errors.Is(err, product.ErrInvalid) {
		t.Errorf("zero pack size: %v", err)
	}
}

func TestSameCodeMayBeGlobalForOneProductAndShopBarcodeForAnother(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Corner Market")
	a := f.prod(t, "A", f.tomato, 700, "8001234567897")
	b := f.prod(t, "B", f.rice, 1000)
	if _, err := f.s.AddShopBarcode(ctx, shop.ID, b.ID, "8001234567897"); err != nil {
		t.Fatal(err)
	}
	cat, _ := f.s.Catalog(ctx, &shop.ID)
	if cat.GlobalBarcodes["08001234567897"] != a.ID || cat.ShopBarcodes["08001234567897"] != b.ID {
		t.Fatalf("catalog = %+v", cat)
	}
	r, err := f.s.Resolve(ctx, "8001234567897", barcode.FormatEAN13, &shop.ID)
	if err != nil || r.Resolution.ProductID != b.ID || r.Resolution.Via != barcode.ViaShopBarcode {
		t.Fatalf("at the Shop the Shop Barcode wins: %+v %v", r, err)
	}
	r, _ = f.s.Resolve(ctx, "8001234567897", barcode.FormatEAN13, nil)
	if r.Resolution.ProductID != a.ID || r.Resolution.Via != barcode.ViaGlobal {
		t.Fatalf("at home only global applies: %+v", r)
	}
}

func TestShopBarcodeUniqueWithinAShop(t *testing.T) {
	f := newFx(t)
	s1, s2 := f.shop(t, "One"), f.shop(t, "Two")
	p := f.prod(t, "P", f.tomato, 700)
	q := f.prod(t, "Q", f.rice, 500)
	if _, err := f.s.AddShopBarcode(ctx, s1.ID, p.ID, "PRIVATE-77"); err != nil {
		t.Fatal(err)
	}
	_, err := f.s.AddShopBarcode(ctx, s1.ID, q.ID, " PRIVATE-77 ")
	var taken *store.BarcodeTakenError
	if !errors.As(err, &taken) || taken.ProductID != p.ID {
		t.Fatalf("got %v", err)
	}
	if _, err := f.s.AddShopBarcode(ctx, s2.ID, q.ID, "PRIVATE-77"); err != nil {
		t.Fatalf("another Shop may reuse the code: %v", err)
	}
}

func TestWeightRuleLifecycle(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Butcher")
	rule := barcode.WeightRule{Prefix: "21", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValueWeight, ValueUnit: barcode.UnitKilo, DecimalPlaces: 3}
	r, err := f.s.CreateRule(ctx, shop.ID, rule)
	if err != nil || r.ID == 0 || r.ShopID != shop.ID || r.ValueUnit != barcode.UnitKilo {
		t.Fatalf("%+v %v", r, err)
	}
	if _, err := f.s.CreateRule(ctx, shop.ID, rule); !errors.Is(err, store.ErrDuplicatePrefix) {
		t.Errorf("same prefix twice: %v", err)
	}
	overlapping := rule
	overlapping.Prefix = "210"
	overlapping.Item = barcode.Span{Start: 4, Length: 5}
	overlapping.Value = barcode.Span{Start: 9, Length: 4}
	overlapping.DecimalPlaces = 0
	if _, err := f.s.CreateRule(ctx, shop.ID, overlapping); err != nil {
		t.Errorf("a longer overlapping prefix is allowed: %v", err)
	}
	bad := rule
	bad.Prefix = "22"
	bad.ValueKind = barcode.ValuePrice
	bad.ValueUnit = barcode.UnitGram // a price rule has no unit
	if _, err := f.s.CreateRule(ctx, shop.ID, bad); !errors.Is(err, product.ErrInvalid) {
		t.Errorf("Validate failure must be an invalid error: %v", err)
	}
	rules, _ := f.s.Rules(ctx, shop.ID)
	if len(rules) != 2 || rules[0].ID != r.ID {
		t.Fatalf("rules = %+v", rules)
	}
	if _, err := f.s.CreateRule(ctx, 999, rule); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown Shop: %v", err)
	}
}

func TestWeighedShopBarcodesAndRuleChanges(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Butcher")
	p := f.prod(t, "Ham", f.rice, 1000)
	r, _ := f.s.CreateRule(ctx, shop.ID, barcode.WeightRule{Prefix: "21", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValueWeight})
	if _, err := f.s.AddWeighedShopBarcode(ctx, shop.ID, p.ID, r.ID, "123"); !errors.Is(err, product.ErrInvalidItemCode) {
		t.Fatalf("wrong length: %v", err)
	}
	sb, err := f.s.AddWeighedShopBarcode(ctx, shop.ID, p.ID, r.ID, "00123")
	if err != nil || sb.RuleID != r.ID || sb.ItemCode != "00123" || sb.Code != "" {
		t.Fatalf("%+v %v", sb, err)
	}
	q := f.prod(t, "Other", f.rice, 500)
	if _, err := f.s.AddWeighedShopBarcode(ctx, shop.ID, q.ID, r.ID, "00123"); err == nil {
		t.Fatal("item code reused for another Product")
	}
	// changing the item length while a weighed barcode uses it is refused
	longer := r.WeightRule
	longer.Item = barcode.Span{Start: 3, Length: 4}
	longer.Value = barcode.Span{Start: 7, Length: 5}
	if _, err := f.s.UpdateRule(ctx, r.ID, longer); !errors.Is(err, store.ErrInUse) {
		t.Fatalf("got %v", err)
	}
	// changing only the value unit is fine
	kg := r.WeightRule
	kg.ValueUnit = barcode.UnitKilo
	kg.DecimalPlaces = 3
	if u, err := f.s.UpdateRule(ctx, r.ID, kg); err != nil || u.ValueUnit != barcode.UnitKilo {
		t.Fatalf("%+v %v", u, err)
	}
	// deleting the rule deletes its weighed Shop Barcodes
	if err := f.s.DeleteRule(ctx, r.ID); err != nil {
		t.Fatal(err)
	}
	if list, _ := f.s.ShopBarcodes(ctx, shop.ID); len(list) != 0 {
		t.Fatalf("left %+v", list)
	}
}

func TestPricesUpsertLatestAndDerivedPricePerKg(t *testing.T) {
	f := newFx(t)
	a, b := f.shop(t, "A"), f.shop(t, "B")
	p := f.prod(t, "Passata", f.tomato, 700)

	if _, ok, err := f.s.LatestPrice(ctx, p.ID, &a.ID); ok || err != nil {
		t.Fatalf("no Price yet: %v %v", ok, err)
	}
	if _, err := f.s.RecordPrice(ctx, p.ID, product.PriceInput{ShopID: a.ID, Date: "2026-11-01", PriceCents: ip(150)}); err != nil {
		t.Fatal(err)
	}
	pr, err := f.s.RecordPrice(ctx, p.ID, product.PriceInput{ShopID: a.ID, Date: "2026-11-05", PriceCents: ip(159)})
	if err != nil {
		t.Fatal(err)
	}
	if pr.PricePerKgCents == nil || *pr.PricePerKgCents != 227 || !pr.PricePerKgDerived {
		t.Errorf("159 cents / 700 g = 227 per kg derived: %+v", pr)
	}
	// same day again replaces
	again, _ := f.s.RecordPrice(ctx, p.ID, product.PriceInput{ShopID: a.ID, Date: "2026-11-05", PriceCents: ip(169)})
	if again.ID != pr.ID || *again.PriceCents != 169 {
		t.Errorf("same day must update in place: %+v", again)
	}
	if _, err := f.s.RecordPrice(ctx, p.ID, product.PriceInput{ShopID: b.ID, Date: "2026-11-02", PriceCents: ip(139)}); err != nil {
		t.Fatal(err)
	}

	l, ok, _ := f.s.LatestPrice(ctx, p.ID, &a.ID)
	if !ok || *l.PriceCents != 169 {
		t.Errorf("latest at A = %+v", l)
	}
	l, ok, _ = f.s.LatestPrice(ctx, p.ID, nil)
	if !ok || l.ShopID != a.ID || *l.PriceCents != 169 {
		t.Errorf("latest anywhere = %+v", l)
	}
	c := f.shop(t, "C")
	l, ok, _ = f.s.LatestPrice(ctx, p.ID, &c.ID)
	if !ok || l.ShopID != a.ID {
		t.Errorf("a Shop with no Price falls back to the latest anywhere: %+v", l)
	}
	list, _ := f.s.Prices(ctx, p.ID, nil)
	if len(list) != 3 || list[0].Date != "2026-11-05" || list[2].Date != "2026-11-01" {
		t.Errorf("newest first: %+v", list)
	}
	d, _ := f.s.Product(ctx, p.ID)
	if len(d.LatestPrices) != 2 || len(d.Shops) != 2 {
		t.Errorf("one latest Price per Shop, and Shops with a Price sell it: %+v %+v", d.LatestPrices, d.Shops)
	}
	if err := f.s.DeletePrice(ctx, l.ID); err != nil {
		t.Fatal(err)
	}
}

func TestExplicitPricePerKgAndNoDerivationForMillilitres(t *testing.T) {
	f := newFx(t)
	a := f.shop(t, "A")
	ham := f.prod(t, "Ham", f.rice, 1000)
	milk := f.prod(t, "Milk", f.milk, 1000)
	pr, _ := f.s.RecordPrice(ctx, ham.ID, product.PriceInput{ShopID: a.ID, Date: "2026-11-01", PricePerKgCents: ip(1800)})
	if pr.PriceCents != nil || *pr.PricePerKgCents != 1800 || pr.PricePerKgDerived {
		t.Errorf("%+v", pr)
	}
	m, _ := f.s.RecordPrice(ctx, milk.ID, product.PriceInput{ShopID: a.ID, Date: "2026-11-01", PriceCents: ip(120)})
	if m.PricePerKgCents != nil {
		t.Errorf("a millilitre Product has no price per kg: %+v", m)
	}
}

func TestCatalogPackOnlyPriceNeverMasksAnExplicitPricePerKg(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Butcher")
	ham := f.prod(t, "Cooked ham", f.rice, 200) // g, nominal pack 200
	r, _ := f.s.CreateRule(ctx, shop.ID, barcode.WeightRule{Prefix: "22", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValuePrice})
	if _, err := f.s.AddWeighedShopBarcode(ctx, shop.ID, ham.ID, r.ID, "00123"); err != nil {
		t.Fatal(err)
	}
	// Only a pack-only Price: nothing to read a weight from, the scan asks once.
	if _, err := f.s.RecordPrice(ctx, ham.ID, product.PriceInput{ShopID: shop.ID, Date: "2026-10-20", PriceCents: ip(540)}); err != nil {
		t.Fatal(err)
	}
	c, _ := f.s.Catalog(ctx, &shop.ID)
	if _, ok := c.PricePerKgCents[ham.ID]; ok {
		t.Fatalf("a pack-only Price gives no price per kg for a weighed Product: %v", c.PricePerKgCents)
	}
	res, _ := f.s.Resolve(ctx, "2200123005403", barcode.FormatEAN13, &shop.ID)
	if res.Resolution.Outcome != barcode.OutcomeAskWeight {
		t.Errorf("no explicit price per kg: ask the weight once: %+v", res.Resolution)
	}

	// 1800/kg recorded after the ask_weight scan, then a newer pack-only 540.
	if _, err := f.s.RecordPrice(ctx, ham.ID, product.PriceInput{ShopID: shop.ID, Date: "2026-11-01", PricePerKgCents: ip(1800)}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.RecordPrice(ctx, ham.ID, product.PriceInput{ShopID: shop.ID, Date: "2026-11-05", PriceCents: ip(540)}); err != nil {
		t.Fatal(err)
	}
	c, _ = f.s.Catalog(ctx, &shop.ID)
	if c.PricePerKgCents[ham.ID] != 1800 {
		t.Fatalf("explicit 1800 must survive: %v", c.PricePerKgCents)
	}
	res, _ = f.s.Resolve(ctx, "2200123005403", barcode.FormatEAN13, &shop.ID)
	if res.Resolution.Outcome != barcode.OutcomeWeighed || res.Resolution.WeightGrams != 300 || res.Resolution.PricePerKgCents != 1800 {
		t.Errorf("540 cents at 1800/kg = 300 g (not 200 g from a derived 2700/kg): %+v", res.Resolution)
	}
}

func TestCatalogForAShopCarriesWeighedProductsAndPricePerKg(t *testing.T) {
	f := newFx(t)
	shop := f.shop(t, "Butcher")
	other := f.shop(t, "Elsewhere")
	ham := f.prod(t, "Ham", f.rice, 1000, "5901234123457")
	cheese := f.prod(t, "Cheese", f.rice, 1000)
	r, _ := f.s.CreateRule(ctx, shop.ID, barcode.WeightRule{Prefix: "22", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValuePrice})
	_, _ = f.s.CreateRule(ctx, other.ID, barcode.WeightRule{Prefix: "23", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValuePrice})
	if _, err := f.s.AddWeighedShopBarcode(ctx, shop.ID, ham.ID, r.ID, "00123"); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.RecordPrice(ctx, ham.ID, product.PriceInput{ShopID: shop.ID, Date: "2026-10-01", PricePerKgCents: ip(1500)}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.RecordPrice(ctx, ham.ID, product.PriceInput{ShopID: shop.ID, Date: "2026-11-01", PricePerKgCents: ip(1800)}); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.RecordPrice(ctx, ham.ID, product.PriceInput{ShopID: other.ID, Date: "2026-11-08", PricePerKgCents: ip(2500)}); err != nil {
		t.Fatal(err)
	}
	_ = cheese

	c, err := f.s.Catalog(ctx, &shop.ID)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.WeightRules) != 1 || c.WeightRules[0].ID != r.ID {
		t.Errorf("only this Shop's rules: %+v", c.WeightRules)
	}
	if c.WeightProducts[barcode.WeightProductKey(r.ID, "00123")] != ham.ID {
		t.Errorf("weight products = %v", c.WeightProducts)
	}
	if !reflect.DeepEqual(c.PricePerKgCents, map[int64]int{ham.ID: 1800}) {
		t.Errorf("latest price per kg at THIS Shop: %v", c.PricePerKgCents)
	}
	if c.GlobalBarcodes["05901234123457"] != ham.ID {
		t.Errorf("global = %v", c.GlobalBarcodes)
	}

	res, _ := f.s.Resolve(ctx, "2200123004505", barcode.FormatEAN13, &shop.ID)
	if res.Resolution.Outcome != barcode.OutcomeWeighed || res.Resolution.WeightGrams != 250 || res.Product == nil || res.Product.Name != "Ham" {
		t.Errorf("450 cents at 1800/kg = 250 g of Ham: %+v", res)
	}
	home, _ := f.s.Catalog(ctx, nil)
	if home.WeightRules != nil || home.ShopBarcodes != nil || len(home.GlobalBarcodes) != 1 {
		t.Errorf("home catalog = %+v", home)
	}
	if _, err := f.s.Catalog(ctx, ptr(int64(999))); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown Shop: %v", err)
	}
}

func ptr[T any](v T) *T { return &v }

func TestLastBought(t *testing.T) {
	f := newFx(t)
	a, b := f.shop(t, "A"), f.shop(t, "B")
	small := f.prod(t, "Passata 400 g", f.tomato, 400)
	big := f.prod(t, "Passata 700 g", f.tomato, 700)
	rice := f.prod(t, "Rice 1 kg", f.rice, 1000)

	if _, ok, err := f.s.LastBought(ctx, f.tomato, nil); ok || err != nil {
		t.Fatalf("nothing bought yet: %v %v", ok, err)
	}
	// a Price is not a purchase
	f.s.RecordPrice(ctx, small.ID, product.PriceInput{ShopID: a.ID, Date: "2026-11-01", PriceCents: ip(100)})
	if _, ok, _ := f.s.LastBought(ctx, f.tomato, nil); ok {
		t.Fatal("a Price alone must not count as bought")
	}

	f.s.RecordPurchase(ctx, small.ID, &a.ID, "2026-10-20")
	f.s.RecordPurchase(ctx, big.ID, &b.ID, "2026-11-02")
	f.s.RecordPurchase(ctx, rice.ID, &a.ID, "2026-11-08")

	got, ok, _ := f.s.LastBought(ctx, f.tomato, nil)
	if !ok || got.ID != big.ID || got.PackSize != 700 {
		t.Errorf("anywhere: most recent is the 700 g: %+v", got)
	}
	got, _, _ = f.s.LastBought(ctx, f.tomato, &a.ID)
	if got.ID != small.ID {
		t.Errorf("at A: the 400 g bought at A, even though 700 g is newer elsewhere: %+v", got)
	}
	c := f.shop(t, "C")
	got, _, _ = f.s.LastBought(ctx, f.tomato, &c.ID)
	if got.ID != big.ID {
		t.Errorf("at a Shop where nothing was bought: falls back to anywhere: %+v", got)
	}

	// same day: the later purchase wins
	f.s.RecordPurchase(ctx, small.ID, &a.ID, "2026-11-02")
	got, _, _ = f.s.LastBought(ctx, f.tomato, nil)
	if got.ID != small.ID {
		t.Errorf("ties go to the later purchase: %+v", got)
	}

	many, err := f.s.LastBoughtMany(ctx, []int64{f.tomato, f.rice, f.milk}, &a.ID)
	if err != nil || len(many) != 2 || many[f.tomato].ID != small.ID || many[f.rice].ID != rice.ID {
		t.Errorf("many = %+v %v (milk was never bought: absent)", many, err)
	}
}

func TestPurchaseMarksProductSoldAtShopAndUndoRemovesIt(t *testing.T) {
	f := newFx(t)
	a := f.shop(t, "A")
	p := f.prod(t, "P", f.tomato, 700)
	id, err := f.s.RecordPurchase(ctx, p.ID, &a.ID, "2026-11-09")
	if err != nil {
		t.Fatal(err)
	}
	d, _ := f.s.Product(ctx, p.ID)
	if len(d.Shops) != 1 {
		t.Fatalf("sold at: %+v", d.Shops)
	}
	if err := f.s.DeletePurchase(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, ok, _ := f.s.LastBought(ctx, f.tomato, nil); ok {
		t.Fatal("undone purchase still counts")
	}
	home, err := f.s.RecordPurchase(ctx, p.ID, nil, "2026-11-09")
	if err != nil || home == 0 {
		t.Fatalf("a purchase at home (no Shop): %v", err)
	}
}

func TestDeleteProductRefusedWhenBoughtOrUsed(t *testing.T) {
	f := newFx(t)
	a := f.shop(t, "A")
	p := f.prod(t, "P", f.tomato, 700, "8001234567897")
	f.s.RecordPurchase(ctx, p.ID, &a.ID, "2026-11-09")
	if err := f.s.DeleteProduct(ctx, p.ID); !errors.Is(err, store.ErrInUse) {
		t.Fatalf("got %v", err)
	}
	q := f.prod(t, "Q", f.rice, 500, "5901234123457")
	if err := f.s.DeleteProduct(ctx, q.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.Product(ctx, q.ID); !errors.Is(err, store.ErrNotFound) {
		t.Fatalf("got %v", err)
	}
	if list, _ := f.s.Products(ctx, store.Filter{Barcode: "5901234123457"}); len(list) != 0 {
		t.Fatal("its barcode survived")
	}
}

func TestDeleteShopCascadesButKeepsPurchases(t *testing.T) {
	f := newFx(t)
	a := f.shop(t, "A")
	p := f.prod(t, "P", f.tomato, 700)
	f.s.AddShopBarcode(ctx, a.ID, p.ID, "PRIVATE-77")
	f.s.RecordPrice(ctx, p.ID, product.PriceInput{ShopID: a.ID, Date: "2026-11-01", PriceCents: ip(100)})
	f.s.RecordPurchase(ctx, p.ID, &a.ID, "2026-11-01")
	if err := f.s.DeleteShop(ctx, a.ID); err != nil {
		t.Fatal(err)
	}
	d, _ := f.s.Product(ctx, p.ID)
	if len(d.ShopBarcodes) != 0 || len(d.LatestPrices) != 0 || len(d.Shops) != 0 {
		t.Errorf("left %+v", d)
	}
	if got, ok, _ := f.s.LastBought(ctx, f.tomato, nil); !ok || got.ID != p.ID {
		t.Error("the purchase must survive its Shop")
	}
}

func TestProductsFilterAndOrder(t *testing.T) {
	f := newFx(t)
	f.prod(t, "zucchini", f.rice, 1)
	f.prod(t, "Mutti passata", f.tomato, 700, "8001234567897")
	f.prod(t, "Cirio passata", f.tomato, 400)
	all, _ := f.s.Products(ctx, store.Filter{})
	if len(all) != 3 || all[0].Name != "Cirio passata" || all[2].Name != "zucchini" {
		t.Errorf("order: %+v", all)
	}
	q, _ := f.s.Products(ctx, store.Filter{Query: "  PASSATA "})
	if len(q) != 2 {
		t.Errorf("query: %+v", q)
	}
	i, _ := f.s.Products(ctx, store.Filter{IngredientID: f.rice})
	if len(i) != 1 || i[0].Name != "zucchini" {
		t.Errorf("ingredient: %+v", i)
	}
	b, _ := f.s.Products(ctx, store.Filter{Barcode: "8001234567897"})
	if len(b) != 1 || b[0].Name != "Mutti passata" {
		t.Errorf("barcode (raw form is canonicalised): %+v", b)
	}
}

func TestUpdateProductKeepsIngredient(t *testing.T) {
	f := newFx(t)
	p := f.prod(t, "P", f.tomato, 700)
	name, size := "Passata", 500.0
	d, err := f.s.UpdateProduct(ctx, p.ID, &name, &size)
	if err != nil || d.Name != "Passata" || d.PackSize != 500 || d.IngredientID != f.tomato {
		t.Fatalf("%+v %v", d, err)
	}
	bad := -1.0
	if _, err := f.s.UpdateProduct(ctx, p.ID, nil, &bad); !errors.Is(err, product.ErrInvalid) {
		t.Fatalf("got %v", err)
	}
}

func TestIngredientDeleteIsRestrictedByProducts(t *testing.T) {
	f := newFx(t)
	f.prod(t, "P", f.tomato, 700)
	if _, err := f.db.Exec(`DELETE FROM ingredients WHERE id=?`, f.tomato); err == nil {
		t.Fatal("an Ingredient with Products must not be deletable at the database level")
	}
}

func TestRegisterUsageBlocksDeletion(t *testing.T) {
	f := newFx(t)
	p := f.prod(t, "usage-blocked", f.tomato, 700)
	// Registered for the whole test binary, so it only reacts to this Product's name.
	store.RegisterUsage("t9 test usage", func(ctx context.Context, q store.Querier, id int64) (int, error) {
		var name string
		if err := q.QueryRowContext(ctx, `SELECT name FROM products WHERE id=?`, id).Scan(&name); err != nil {
			return 0, err
		}
		if name == "usage-blocked" {
			return 2, nil
		}
		return 0, nil
	})
	if err := f.s.DeleteProduct(ctx, p.ID); !errors.Is(err, store.ErrInUse) {
		t.Fatalf("got %v", err)
	}
}
