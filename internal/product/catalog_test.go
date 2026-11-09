package product_test

import (
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/units"
)

var (
	// Shop rule 21: item digits 3-7, value digits 8-12, weight in g, no decimals.
	ruleWeight = barcode.WeightRule{ID: 5, Prefix: "21", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValueWeight, ValueUnit: barcode.UnitGram}
	// Shop rule 22: same layout, the value is a price in cents.
	rulePrice = barcode.WeightRule{ID: 6, Prefix: "22", Item: barcode.Span{Start: 3, Length: 5}, Value: barcode.Span{Start: 8, Length: 5}, ValueKind: barcode.ValuePrice}
)

func rows() product.CatalogRows {
	return product.CatalogRows{
		Rules: []barcode.WeightRule{rulePrice, ruleWeight}, // deliberately out of order
		ShopBarcodes: []product.ShopBarcode{
			{ID: 1, ShopID: 9, ProductID: 40, Code: "PRIVATE-77"},
			{ID: 2, ShopID: 9, ProductID: 41, RuleID: 5, ItemCode: "00123"},
			{ID: 3, ShopID: 9, ProductID: 42, RuleID: 6, ItemCode: "00123"},
		},
		Global: map[string]int64{"08001234567897": 50, "05901234123457": 51},
		Latest: map[int64]product.Price{
			42: {ID: 8, ProductID: 42, ShopID: 9, Date: "2026-11-01", PricePerKgCents: ip(1800)},
			40: {ID: 9, ProductID: 40, ShopID: 9, Date: "2026-11-01", PriceCents: ip(159)},
		},
		Info: map[int64]product.ProductInfo{
			40: {PackSize: 700, Base: units.Gram},
			41: {PackSize: 1000, Base: units.Gram},
			42: {PackSize: 1000, Base: units.Gram},
		},
	}
}

func TestBuildCatalogSplitsShopBarcodesAndWeighedProducts(t *testing.T) {
	c := product.BuildCatalog(rows())
	if want := map[string]int64{"PRIVATE-77": 40}; !reflect.DeepEqual(c.ShopBarcodes, want) {
		t.Errorf("ShopBarcodes = %v, want %v", c.ShopBarcodes, want)
	}
	want := map[string]int64{barcode.WeightProductKey(5, "00123"): 41, barcode.WeightProductKey(6, "00123"): 42}
	if !reflect.DeepEqual(c.WeightProducts, want) {
		t.Errorf("WeightProducts = %v, want %v", c.WeightProducts, want)
	}
	if len(c.WeightRules) != 2 || c.WeightRules[0].ID != 5 || c.WeightRules[1].ID != 6 {
		t.Errorf("WeightRules must be sorted by id, got %+v", c.WeightRules)
	}
	if !reflect.DeepEqual(c.GlobalBarcodes, map[string]int64{"08001234567897": 50, "05901234123457": 51}) {
		t.Errorf("GlobalBarcodes = %v", c.GlobalBarcodes)
	}
}

func TestBuildCatalogPricePerKgOnlyForWeighedProducts(t *testing.T) {
	c := product.BuildCatalog(rows())
	// 42 is reachable through a weighed Shop Barcode and has a price per kg.
	// 40 has a derived price per kg (159 for 700 g) but is a plain product: left out.
	// 41 is weighed but has no Price.
	if want := map[int64]int{42: 1800}; !reflect.DeepEqual(c.PricePerKgCents, want) {
		t.Fatalf("PricePerKgCents = %v, want %v", c.PricePerKgCents, want)
	}
}

func TestBuildCatalogNeverDerivesPricePerKgFromAPackPrice(t *testing.T) {
	// 41 is weighed, in grams, pack 1000, and its only Price is a pack price of 450:
	// the nominal pack says nothing about a price-labelled slice, so no price per kg.
	r := rows()
	r.Latest = nil
	r.Prices = map[int64][]product.Price{41: {{ID: 1, ProductID: 41, ShopID: 9, Date: "2026-11-01", PriceCents: ip(450)}}}
	c := product.BuildCatalog(r)
	if _, ok := c.PricePerKgCents[41]; ok {
		t.Fatalf("a pack-only Price must not give a price per kg: %v", c.PricePerKgCents)
	}
}

func TestBuildCatalogPackOnlyPriceNeverMasksAnOlderExplicitPricePerKg(t *testing.T) {
	// Cooked ham (g, pack 200): 1800/kg recorded after an ask_weight scan, then a pack-only 540.
	r := rows()
	r.Latest = nil
	r.Info[42] = product.ProductInfo{PackSize: 200, Base: units.Gram}
	r.Prices = map[int64][]product.Price{42: {
		{ID: 1, ProductID: 42, ShopID: 9, Date: "2026-11-01", PricePerKgCents: ip(1800)},
		{ID: 2, ProductID: 42, ShopID: 9, Date: "2026-11-05", PriceCents: ip(540)},
	}}
	c := product.BuildCatalog(r)
	if c.PricePerKgCents[42] != 1800 {
		t.Fatalf("explicit 1800 must survive a newer pack-only Price, got %v", c.PricePerKgCents)
	}
	// 540 cents at 1800/kg = 300 g, not the 200 g a derived 2700/kg would read.
	res := barcode.Resolve(barcode.Parse("2200123005403", barcode.FormatEAN13), c)
	if res.Outcome != barcode.OutcomeWeighed || res.WeightGrams != 300 {
		t.Errorf("540 cents = %+v", res)
	}
}

func TestBuildCatalogTakesTheLatestExplicitPricePerKg(t *testing.T) {
	r := rows()
	r.Latest = nil
	r.Prices = map[int64][]product.Price{42: { // deliberately unordered
		{ID: 3, ProductID: 42, ShopID: 9, Date: "2026-11-01", PricePerKgCents: ip(1900)},
		{ID: 1, ProductID: 42, ShopID: 9, Date: "2026-10-01", PricePerKgCents: ip(1500)},
		{ID: 2, ProductID: 42, ShopID: 9, Date: "2026-11-01", PricePerKgCents: ip(1800)},
		{ID: 4, ProductID: 42, ShopID: 9, Date: "2026-11-09", PriceCents: ip(540)},
	}}
	if got := product.BuildCatalog(r).PricePerKgCents[42]; got != 1900 {
		t.Fatalf("same date: highest id wins; got %d", got)
	}
}

func TestLatestExplicitPricePerKg(t *testing.T) {
	cases := []struct {
		name   string
		prices []product.Price
		want   int
		ok     bool
	}{
		{"none", nil, 0, false},
		{"pack-only", []product.Price{{ID: 1, Date: "2026-11-01", PriceCents: ip(540)}}, 0, false},
		{"explicit", []product.Price{{ID: 1, Date: "2026-11-01", PricePerKgCents: ip(1800)}}, 1800, true},
		{"newer pack-only does not mask", []product.Price{
			{ID: 1, Date: "2026-11-01", PricePerKgCents: ip(1800)},
			{ID: 2, Date: "2026-11-05", PriceCents: ip(540)},
		}, 1800, true},
		{"newest explicit wins", []product.Price{
			{ID: 1, Date: "2026-10-01", PricePerKgCents: ip(1500)},
			{ID: 2, Date: "2026-11-01", PricePerKgCents: ip(1800)},
		}, 1800, true},
		{"a Price with both counts by its explicit value", []product.Price{
			{ID: 1, Date: "2026-11-01", PriceCents: ip(159), PricePerKgCents: ip(227)},
		}, 227, true},
		{"same date: highest id", []product.Price{
			{ID: 2, Date: "2026-11-01", PricePerKgCents: ip(1800)},
			{ID: 1, Date: "2026-11-01", PricePerKgCents: ip(1500)},
		}, 1800, true},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got, ok := product.LatestExplicitPricePerKg(c.prices)
			if got != c.want || ok != c.ok {
				t.Errorf("got %d, %v; want %d, %v", got, ok, c.want, c.ok)
			}
		})
	}
}

func TestBuildCatalogHomeHasOnlyGlobalBarcodes(t *testing.T) {
	c := product.BuildCatalog(product.CatalogRows{Global: map[string]int64{"08001234567897": 50}})
	if c.ShopBarcodes != nil || c.WeightRules != nil || c.WeightProducts != nil || c.PricePerKgCents != nil {
		t.Fatalf("home catalog has Shop data: %+v", c)
	}
	if c.GlobalBarcodes["08001234567897"] != 50 {
		t.Fatal("global barcode missing")
	}
}

// The Catalog must resolve scans exactly as spec §5 and docs/dev/design/t5-barcode.md say.
func TestBuiltCatalogResolvesScans(t *testing.T) {
	c := product.BuildCatalog(rows())
	scan := func(code string) barcode.Resolution {
		return barcode.Resolve(barcode.Parse(code, barcode.FormatEAN13), c)
	}
	// weight rule 21: item 00123, 750 g
	r := scan("2100123007509")
	if r.Outcome != barcode.OutcomeWeighed || r.ProductID != 41 || r.WeightGrams != 750 || r.Via != barcode.ViaWeightRule {
		t.Errorf("weight rule scan = %+v", r)
	}
	// price rule 22: 450 cents at 1800 cents/kg = 250 g
	r = scan("2200123004505")
	if r.Outcome != barcode.OutcomeWeighed || r.ProductID != 42 || r.WeightGrams != 250 || r.PriceCents != 450 {
		t.Errorf("price rule scan = %+v", r)
	}
	// global
	r = scan("8001234567897")
	if r.Outcome != barcode.OutcomeProduct || r.ProductID != 50 || r.Via != barcode.ViaGlobal {
		t.Errorf("global scan = %+v", r)
	}
	// unknown item code under a known rule prefix
	r = scan("2100999007504")
	if r.Outcome != barcode.OutcomeUnknownWeighedProduct || r.RuleID != 5 || r.ItemCode != "00999" {
		t.Errorf("unknown weighed scan = %+v", r)
	}
}
