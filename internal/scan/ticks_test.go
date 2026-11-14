package scan_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/scan"
)

// B9-23 (RES-03): the Ticks the phone queues with its Scans. shop_tick carries ingredientId or extraId, quantity (the
// amount added; 0 = Tick without adding), covers (the Line quantity the phone showed) and rangeTo; shop_untick carries
// tickClientUuid, or ingredientId with rangeTo. scannedAt is the Tick's time.

func shopTick() scan.Op {
	return scan.Op{ClientUUID: "tick-0001", ScannedAt: "2026-11-09T12:05:00Z", Kind: scan.KindShopTick, ShopID: i64(1),
		IngredientID: 4, Quantity: 50, Covers: 150, RangeTo: "2026-11-15"}
}

func shopUntick() scan.Op {
	return scan.Op{ClientUUID: "untick-0001", ScannedAt: "2026-11-09T12:06:00Z", Kind: scan.KindShopUntick, TickClientUUID: "tick-0001"}
}

func TestValidTickOperationsPass(t *testing.T) {
	extra := shopTick()
	extra.IngredientID, extra.ExtraID = 0, 9
	noAmount := shopTick()
	noAmount.Quantity, noAmount.Covers = 0, 0
	noShop := shopTick()
	noShop.ShopID, noShop.RangeTo = nil, ""
	byLine := shopUntick()
	byLine.TickClientUUID, byLine.IngredientID, byLine.RangeTo = "", 4, "2026-11-15"
	for name, op := range map[string]scan.Op{"tick": shopTick(), "tick of an extra": extra, "tick without adding": noAmount,
		"tick with no Shop or range": noShop, "untick by UUID": shopUntick(), "untick by Line": byLine} {
		if err := op.Validate(); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestATickNeedsExactlyOneOfIngredientOrExtra(t *testing.T) {
	neither := shopTick()
	neither.IngredientID = 0
	both := shopTick()
	both.ExtraID = 9
	for name, op := range map[string]scan.Op{"neither": neither, "both": both} {
		if got := field(t, op.Validate()); got != "ingredientId" {
			t.Errorf("%s: field = %q, want ingredientId", name, got)
		}
	}
}

func TestATickRefusesWhatCannotBeAnAmount(t *testing.T) {
	for _, c := range []struct {
		name  string
		mod   func(*scan.Op)
		field string
	}{
		{"negative quantity", func(o *scan.Op) { o.Quantity = -1 }, "quantity"},
		{"negative covers", func(o *scan.Op) { o.Covers = -1 }, "covers"},
		{"bad range", func(o *scan.Op) { o.RangeTo = "next week" }, "rangeTo"},
		{"bad Shop", func(o *scan.Op) { o.ShopID = i64(0) }, "shopId"},
		{"weighed", func(o *scan.Op) { o.Weighed = true }, "weighed"},
		{"no UUID", func(o *scan.Op) { o.ClientUUID = "" }, "clientUuid"},
		{"no time", func(o *scan.Op) { o.ScannedAt = "" }, "scannedAt"},
	} {
		op := shopTick()
		c.mod(&op)
		if got := field(t, op.Validate()); got != c.field {
			t.Errorf("%s: field = %q, want %q", c.name, got, c.field)
		}
	}
}

func TestAnUntickNeedsOneAddressAndARangeForALine(t *testing.T) {
	none := shopUntick()
	none.TickClientUUID = ""
	both := shopUntick()
	both.IngredientID, both.RangeTo = 4, "2026-11-15"
	lineNoRange := shopUntick()
	lineNoRange.TickClientUUID, lineNoRange.IngredientID = "", 4
	for name, c := range map[string]struct {
		op    scan.Op
		field string
	}{"nothing named": {none, "tickClientUuid"}, "both named": {both, "tickClientUuid"}, "a Line without a range": {lineNoRange, "rangeTo"}} {
		if got := field(t, c.op.Validate()); got != c.field {
			t.Errorf("%s: field = %q, want %q", name, got, c.field)
		}
	}
}

func TestATickOpRoundTripsAsTheJSONThePhoneSends(t *testing.T) {
	raw := `{"clientUuid":"tick-0001","scannedAt":"2026-11-09T12:05:00Z","kind":"shop_tick","shopId":1,"ingredientId":4,"quantity":50,"covers":150,"rangeTo":"2026-11-15"}`
	var op scan.Op
	if err := json.Unmarshal([]byte(raw), &op); err != nil {
		t.Fatal(err)
	}
	if op.Kind != scan.KindShopTick || op.IngredientID != 4 || op.Quantity != 50 || op.Covers != 150 || op.RangeTo != "2026-11-15" || op.Validate() != nil {
		t.Errorf("decoded %+v (validate %v)", op, op.Validate())
	}
	raw = `{"clientUuid":"u2","scannedAt":"2026-11-09T12:05:00Z","kind":"shop_untick","tickClientUuid":"tick-0001"}`
	op = scan.Op{}
	if err := json.Unmarshal([]byte(raw), &op); err != nil || op.Kind != scan.KindShopUntick || op.TickClientUUID != "tick-0001" || op.Validate() != nil {
		t.Errorf("decoded %+v (%v, validate %v)", op, err, op.Validate())
	}
}

func TestATickResultCarriesTheLotTheAmountAndWhoTickedBefore(t *testing.T) {
	lot := int64(7)
	res := scan.Result{ClientUUID: "tick-0001", Status: scan.StatusApplied, Tick: &scan.AppliedTick{LotID: &lot, Added: 50,
		AlsoTickedBy: []scan.AlsoTickedBy{{Name: "Sam", Quantity: 50, By: "hand"}}}}
	b, _ := json.Marshal(res)
	for _, want := range []string{`"tick":{"lotId":7,"added":50,"alsoTickedBy":[{"name":"Sam","quantity":50,"by":"hand"}]}`} {
		if !strings.Contains(string(b), want) {
			t.Errorf("JSON = %s, want it to contain %s", b, want)
		}
	}
	var scanRes scan.Result
	b, _ = json.Marshal(scanRes)
	if strings.Contains(string(b), `"tick"`) {
		t.Errorf("a Result without a Tick sends %s", b)
	}
}
