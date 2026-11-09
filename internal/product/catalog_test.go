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

func TestBuildCatalogDerivesPricePerKgFromAPackPrice(t *testing.T) {
	r := rows()
	r.Latest[41] = product.Price{ProductID: 41, PriceCents: ip(450)} // 450 cents for 1000 g
	c := product.BuildCatalog(r)
	if c.PricePerKgCents[41] != 450 {
		t.Fatalf("got %v", c.PricePerKgCents)
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
