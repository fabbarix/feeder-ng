package scan_test

import (
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/scan"
)

func i64(v int64) *int64   { return &v }
func i(v int) *int         { return &v }
func f(v float64) *float64 { return &v }

func shopScan() scan.Op {
	return scan.Op{ClientUUID: "scan-0001", ScannedAt: "2026-11-09T12:05:00Z", Kind: scan.KindShopScan, ShopID: i64(1), ProductID: 7, Quantity: 700, PriceCents: i(159), RangeTo: "2026-11-15"}
}

func unknownPack() scan.Op {
	return scan.Op{ClientUUID: "scan-0002", ScannedAt: "2026-11-09T12:06:00Z", Kind: scan.KindShopUnknown, ShopID: i64(1),
		Barcode: "08000500310427", Quantity: 700, PackSize: 700, Scope: scan.ScopeGlobal,
		Ingredient: &scan.IngredientRef{Name: "passata", BaseUnit: "g"}, ProductName: "Passata 700 g"}
}

func weighed() scan.Op {
	return scan.Op{ClientUUID: "scan-0003", ScannedAt: "2026-11-09T12:07:00Z", Kind: scan.KindShopUnknown, ShopID: i64(1),
		RuleID: 3, ItemCode: "00005", Quantity: 750, Ingredient: &scan.IngredientRef{ID: 4}, ProductName: "Loose carrots"}
}

func stockTake() scan.Op {
	return scan.Op{ClientUUID: "take-0001", ScannedAt: "2026-11-09T18:00:00Z", Kind: scan.KindStockTake, ProductID: 7, Action: scan.PlusPack}
}

func field(t *testing.T, err error) string {
	t.Helper()
	var ve *scan.ValidationError
	if !errors.As(err, &ve) || !errors.Is(err, scan.ErrInvalid) {
		t.Fatalf("err = %v, want a *ValidationError matching ErrInvalid", err)
	}
	return ve.Field
}

func TestValidOperationsPass(t *testing.T) {
	for name, op := range map[string]scan.Op{"shop scan": shopScan(), "unknown pack": unknownPack(), "weighed": weighed(), "stock-take": stockTake()} {
		if err := op.Validate(); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
	set := stockTake()
	set.Action, set.Total = scan.SetTotal, f(0)
	if err := set.Validate(); err != nil {
		t.Errorf("set total 0: %v", err)
	}
}

func TestEveryOperationNeedsAClientUUIDAndATimestamp(t *testing.T) {
	op := shopScan()
	op.ClientUUID = " "
	if got := field(t, op.Validate()); got != "clientUuid" {
		t.Errorf("field = %q", got)
	}
	op = shopScan()
	op.ClientUUID = "prices" // PATCH /api/scan/prices is the batch route
	if got := field(t, op.Validate()); got != "clientUuid" {
		t.Errorf("prices: field = %q", got)
	}
	op = shopScan()
	op.ClientUUID = strings.Repeat("x", 65)
	if got := field(t, op.Validate()); got != "clientUuid" {
		t.Errorf("too long: field = %q", got)
	}
	op = shopScan()
	op.ScannedAt = "yesterday"
	if got := field(t, op.Validate()); got != "scannedAt" {
		t.Errorf("field = %q", got)
	}
	op = shopScan()
	op.Kind = "teleport"
	if got := field(t, op.Validate()); got != "kind" {
		t.Errorf("field = %q", got)
	}
}

func TestShopScanNeedsAShopAProductAndAQuantity(t *testing.T) {
	cases := map[string]func(*scan.Op){
		"shopId":     func(o *scan.Op) { o.ShopID = nil },
		"productId":  func(o *scan.Op) { o.ProductID = 0 },
		"quantity":   func(o *scan.Op) { o.Quantity = 0 },
		"priceCents": func(o *scan.Op) { o.PriceCents = i(0) },
		"rangeTo":    func(o *scan.Op) { o.RangeTo = "next week" },
	}
	for want, mutate := range cases {
		op := shopScan()
		mutate(&op)
		if got := field(t, op.Validate()); got != want {
			t.Errorf("breaking %s: field = %q", want, got)
		}
	}
}

func TestUnknownBarcodeFormRules(t *testing.T) {
	cases := map[string]func(*scan.Op){
		"barcode":     func(o *scan.Op) { o.Barcode = "" },
		"scope":       func(o *scan.Op) { o.Scope = "" },
		"ingredient":  func(o *scan.Op) { o.Ingredient = nil },
		"productName": func(o *scan.Op) { o.ProductName = "  " },
		"packSize":    func(o *scan.Op) { o.PackSize = 0 },
		"quantity":    func(o *scan.Op) { o.Quantity = -1 },
	}
	for want, mutate := range cases {
		op := unknownPack()
		mutate(&op)
		if got := field(t, op.Validate()); got != want {
			t.Errorf("breaking %s: field = %q", want, got)
		}
	}
	op := unknownPack()
	op.Ingredient = &scan.IngredientRef{Name: "passata", BaseUnit: "kg"}
	if got := field(t, op.Validate()); got != "ingredient" {
		t.Errorf("a new Ingredient needs a Base Unit g, ml or piece: field = %q", got)
	}
	op = unknownPack()
	op.Barcode, op.RuleID, op.ItemCode = "08000500310427", 3, "00005"
	if got := field(t, op.Validate()); got != "barcode" {
		t.Errorf("a barcode and a rule at once: field = %q", got)
	}
}

func TestAWeighedCodeAsksOnlyForTheIngredientAndTheProductName(t *testing.T) {
	op := weighed()
	if err := op.Validate(); err != nil {
		t.Fatalf("no pack size and no scope are needed: %v", err)
	}
	op.ItemCode = "12a45"
	if got := field(t, op.Validate()); got != "itemCode" {
		t.Errorf("non-digit item code: field = %q", got)
	}
	op = weighed()
	op.Scope = scan.ScopeGlobal
	if got := field(t, op.Validate()); got != "scope" {
		t.Errorf("a weighed code can only be this Shop's: field = %q", got)
	}
	op = weighed()
	op.Quantity = 0
	if got := field(t, op.Validate()); got != "quantity" {
		t.Errorf("the decoded weight is needed: field = %q", got)
	}
}

func TestStockTakeRules(t *testing.T) {
	op := stockTake()
	op.ShopID = i64(1)
	if got := field(t, op.Validate()); got != "shopId" {
		t.Errorf("Stock-take has no Shop: field = %q", got)
	}
	op = stockTake()
	op.Action = "double_pack"
	if got := field(t, op.Validate()); got != "action" {
		t.Errorf("field = %q", got)
	}
	op = stockTake()
	op.Action = scan.SetTotal
	if got := field(t, op.Validate()); got != "total" {
		t.Errorf("set_total needs a total: field = %q", got)
	}
	op.Total = f(-1)
	if got := field(t, op.Validate()); got != "total" {
		t.Errorf("negative total: field = %q", got)
	}
	op = stockTake()
	op.ProductID = 0
	if got := field(t, op.Validate()); got != "productId" {
		t.Errorf("field = %q", got)
	}
}

func TestResultJSONIsCamelCase(t *testing.T) {
	lot := int64(5)
	price := 159
	res := scan.Result{ClientUUID: "scan-0001", Status: scan.StatusApplied, Scan: &scan.Applied{
		IngredientID: 2, IngredientName: "Passata", BaseUnit: "g", ProductID: 7, ProductName: "Mutti 700 g", Quantity: 700,
		LotID: &lot, PriceCents: &price, OnList: true, Remaining: 700, Merged: &scan.Merged{ProductID: 7, ProductName: "Mutti 700 g"}}}
	b, _ := json.Marshal(res)
	var m map[string]any
	_ = json.Unmarshal(b, &m)
	s, _ := m["scan"].(map[string]any)
	for _, k := range []string{"ingredientId", "ingredientName", "baseUnit", "productId", "productName", "quantity", "lotId", "priceCents", "onList", "remaining", "ticked", "productCreated", "merged"} {
		if _, ok := s[k]; !ok {
			t.Errorf("scan JSON lacks %q: %s", k, b)
		}
	}
	if m["clientUuid"] != "scan-0001" || m["status"] != "applied" {
		t.Errorf("result JSON = %s", b)
	}
}

// r3-scan-fixes B5: the Weighed flag belongs to a shop_scan only.
func TestWeighedFlagOnlyOnAShopScan(t *testing.T) {
	op := shopScan()
	op.Weighed = true
	if err := op.Validate(); err != nil {
		t.Fatalf("a weighed shop scan: %v", err)
	}
	for name, bad := range map[string]scan.Op{"stock-take": stockTake(), "unknown pack": unknownPack()} {
		bad.Weighed = true
		if got := field(t, bad.Validate()); got != "weighed" {
			t.Errorf("%s: field = %q, want weighed", name, got)
		}
	}
}
