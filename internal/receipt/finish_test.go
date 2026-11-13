package receipt_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// RR1: Finish, from the model's answer to a checked Answer (design §5.1). Finish(raw, rows, today) is pure; today is
// "YYYY-MM-DD" (the design's signature has no today, but "later than today" needs one).
// Decisions where the design is silent:
//   - amounts and indexes that are decoded as pointers: nil is "unknown"; counts, grams and packSize are 0 for none;
//   - a negative priceCents other than -1 on a line with row -1 is a whole-receipt discount: kept, never dropped;
//   - a JSON number that is not an integer (129.5 cents) or a missing field is CodeInvalidOutput.

func finish(t *testing.T, raw []byte) (receipt.Answer, []receipt.Warning, error) {
	t.Helper()
	return receipt.Finish(raw, fixtureRows(), "2026-11-13")
}

func hasWarning(ws []receipt.Warning, code string) bool {
	for _, w := range ws {
		if w.Code == code {
			return true
		}
	}
	return false
}

func TestFinishMapsSentinelsBack(t *testing.T) {
	a, ws, err := finish(t, mkRaw(t, nil, mkLine(map[string]any{"text": "PANE", "row": -1})))
	if err != nil {
		t.Fatal(err)
	}
	if len(ws) != 0 {
		t.Errorf("warnings = %v", ws)
	}
	if a.ShopName != "" || a.Date != "" || a.TotalCents != nil {
		t.Errorf("\"\" is absent and -1 is unknown at the top: %+v", a)
	}
	l := a.Lines[0]
	if l.Row != -1 || l.PriceCents != nil || l.UnitPriceCents != nil || l.PerKgCents != nil {
		t.Errorf("-1 is unknown: %+v", l)
	}
	if l.Count != 0 || l.Grams != 0 || l.PackSize != 0 || l.PackUnit != "" || l.Name != "" {
		t.Errorf("0 and \"\" are none: %+v", l)
	}
	if l.Text != "PANE" {
		t.Errorf("text = %q", l.Text)
	}
}

func TestFinishKeepsRealValues(t *testing.T) {
	raw := mkRaw(t, map[string]any{"shopName": "Esselunga", "date": "2026-11-12", "totalCents": 4820},
		mkLine(map[string]any{"row": 0, "text": "MUTTI", "count": 2, "priceCents": 258, "unitPriceCents": 129, "perKgCents": 1843,
			"packSize": 700, "packUnit": "g", "name": "Mutti passata 700 g"}))
	a, _, err := finish(t, raw)
	if err != nil {
		t.Fatal(err)
	}
	if a.ShopName != "Esselunga" || a.Date != "2026-11-12" || a.TotalCents == nil || *a.TotalCents != 4820 {
		t.Errorf("top = %+v", a)
	}
	l := a.Lines[0]
	if l.Row != 0 || l.Count != 2 || *l.PriceCents != 258 || *l.UnitPriceCents != 129 || *l.PerKgCents != 1843 ||
		l.PackSize != 700 || l.PackUnit != "g" || l.Name != "Mutti passata 700 g" {
		t.Errorf("line = %+v", l)
	}
}

func TestFinishKeepsAZeroPriceAsKnown(t *testing.T) {
	a, _, err := finish(t, mkRaw(t, nil, mkLine(map[string]any{"row": 0, "count": 1, "priceCents": 0})))
	if err != nil {
		t.Fatal(err)
	}
	if p := a.Lines[0].PriceCents; p == nil || *p != 0 {
		t.Errorf("a free line (0) is a known price, not a sentinel: %v", p)
	}
}

func TestFinishRejectsAnAnswerThatIsNotAJSONObject(t *testing.T) {
	for _, raw := range []string{``, `not json`, `[]`, `"x"`, `{"readable":true}`, `{"readable":true,"shopName":"","date":"","totalCents":-1,"lines":"x"}`} {
		_, _, err := finish(t, []byte(raw))
		if ra.CodeOf(err) != ra.CodeInvalidOutput {
			t.Errorf("%q: code = %q, want %q", raw, ra.CodeOf(err), ra.CodeInvalidOutput)
		}
	}
}

func TestFinishRejectsMoneyThatIsNotWholeMinorUnits(t *testing.T) {
	raw := `{"readable":true,"shopName":"","date":"","totalCents":-1,"lines":[{"row":0,"text":"","count":1,"grams":0,"priceCents":129.5,
	"unitPriceCents":-1,"perKgCents":-1,"name":"","packSize":0,"packUnit":""}]}`
	if _, _, err := finish(t, []byte(raw)); ra.CodeOf(err) != ra.CodeInvalidOutput {
		t.Errorf("129.5 minor units must be refused, code = %q", ra.CodeOf(err))
	}
}

func TestFinishRejectsALineMissingAField(t *testing.T) {
	raw := `{"readable":true,"shopName":"","date":"","totalCents":-1,"lines":[{"row":0,"text":"","count":1}]}`
	if _, _, err := finish(t, []byte(raw)); ra.CodeOf(err) != ra.CodeInvalidOutput {
		t.Errorf("every field is required: code = %q", ra.CodeOf(err))
	}
}

func TestFinishRejectsAPackUnitOutsideTheEnum(t *testing.T) {
	_, _, err := finish(t, mkRaw(t, nil, mkLine(map[string]any{"row": 0, "packSize": 1, "packUnit": "kg"})))
	if ra.CodeOf(err) != ra.CodeInvalidOutput {
		t.Errorf("code = %q", ra.CodeOf(err))
	}
}

func TestFinishReadableFalseOrNoLinesIsNoReceiptFound(t *testing.T) {
	_, _, err := finish(t, mkRaw(t, map[string]any{"readable": false}))
	if ra.CodeOf(err) != receipt.CodeNoReceiptFound {
		t.Errorf("readable false: code = %q", ra.CodeOf(err))
	}
	_, _, err = finish(t, mkRaw(t, nil))
	if ra.CodeOf(err) != receipt.CodeNoReceiptFound {
		t.Errorf("no lines: code = %q", ra.CodeOf(err))
	}
	if receipt.CodeNoReceiptFound != "no_receipt_found" {
		t.Errorf("the code is %q", receipt.CodeNoReceiptFound)
	}
}

func TestFinishDecidesARowOutOfRangeByTreatingItAsUnmatchedWithAWarning(t *testing.T) {
	for _, bad := range []int{4, 99, -2} {
		a, ws, err := finish(t, mkRaw(t, nil, mkLine(map[string]any{"row": bad, "text": "X", "count": 1, "priceCents": 100})))
		if err != nil {
			t.Fatalf("row %d: %v", bad, err)
		}
		if len(a.Lines) != 1 || a.Lines[0].Row != -1 {
			t.Errorf("row %d: the line is kept as unmatched: %+v", bad, a.Lines)
		}
		if !hasWarning(ws, receipt.WarnRowOutOfRange) {
			t.Errorf("row %d: want the warning %q, got %v", bad, receipt.WarnRowOutOfRange, ws)
		}
	}
	if receipt.WarnRowOutOfRange != "row_out_of_range" || receipt.WarnLineInvalid != "line_invalid" {
		t.Error("warning codes are row_out_of_range and line_invalid")
	}
}

func TestFinishAcceptsEveryRowInRange(t *testing.T) {
	for r := -1; r < 4; r++ {
		_, ws, err := finish(t, mkRaw(t, nil, mkLine(map[string]any{"row": r, "count": 1})))
		if err != nil || hasWarning(ws, receipt.WarnRowOutOfRange) {
			t.Errorf("row %d is valid: %v %v", r, err, ws)
		}
	}
}

func TestFinishDropsALineWithANegativeAmountOrCount(t *testing.T) {
	for name, over := range map[string]map[string]any{
		"count":     {"row": 0, "count": -1},
		"grams":     {"row": 1, "grams": -5},
		"price":     {"row": 0, "count": 1, "priceCents": -5},
		"unitPrice": {"row": 0, "count": 1, "unitPriceCents": -2},
		"perKg":     {"row": 1, "grams": 100, "perKgCents": -7},
	} {
		a, ws, err := finish(t, mkRaw(t, nil, mkLine(over), mkLine(map[string]any{"row": 2, "count": 1, "priceCents": 99})))
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		if len(a.Lines) != 1 || a.Lines[0].Row != 2 {
			t.Errorf("%s: the invalid line is dropped and the good one kept: %+v", name, a.Lines)
		}
		if !hasWarning(ws, receipt.WarnLineInvalid) {
			t.Errorf("%s: want %q, got %v", name, receipt.WarnLineInvalid, ws)
		}
	}
}

func TestFinishKeepsAWholeReceiptDiscountLine(t *testing.T) {
	a, ws, err := finish(t, mkRaw(t, nil,
		mkLine(map[string]any{"row": 0, "count": 1, "priceCents": 129}),
		mkLine(map[string]any{"row": -1, "text": "SCONTO FEDELTA", "priceCents": -200})))
	if err != nil {
		t.Fatal(err)
	}
	if hasWarning(ws, receipt.WarnLineInvalid) || len(a.Lines) != 2 || *a.Lines[1].PriceCents != -200 {
		t.Errorf("a negative priceCents on row -1 is a discount, kept: %+v %v", a.Lines, ws)
	}
}

func TestFinishAllLinesDroppedIsNoReceiptFound(t *testing.T) {
	_, _, err := finish(t, mkRaw(t, nil, mkLine(map[string]any{"row": 0, "count": -3})))
	if ra.CodeOf(err) != receipt.CodeNoReceiptFound {
		t.Errorf("nothing usable left: code = %q", ra.CodeOf(err))
	}
}

func TestFinishClearsAPackSizeWithoutAUnitAndAUnitWithoutAPackSize(t *testing.T) {
	a := answer(t, nil,
		mkLine(map[string]any{"row": -1, "text": "A", "packSize": 500, "packUnit": ""}),
		mkLine(map[string]any{"row": -1, "text": "B", "packSize": 0, "packUnit": "g"}),
		mkLine(map[string]any{"row": -1, "text": "C", "packSize": 500, "packUnit": "g"}))
	if a.Lines[0].PackSize != 0 || a.Lines[0].PackUnit != "" {
		t.Errorf("size without unit clears both: %+v", a.Lines[0])
	}
	if a.Lines[1].PackSize != 0 || a.Lines[1].PackUnit != "" {
		t.Errorf("unit without size clears both: %+v", a.Lines[1])
	}
	if a.Lines[2].PackSize != 500 || a.Lines[2].PackUnit != "g" {
		t.Errorf("an unmatched line keeps its pack size: %+v", a.Lines[2])
	}
}

func TestFinishDropsThePackSizeOfAMatchedLineWhoseUnitIsNotTheRowsBaseUnit(t *testing.T) {
	a := answer(t, nil,
		mkLine(map[string]any{"row": 0, "count": 1, "packSize": 700, "packUnit": "g"}),   // row 0 is in g
		mkLine(map[string]any{"row": 3, "count": 1, "packSize": 1000, "packUnit": "g"}),  // row 3 is in ml
		mkLine(map[string]any{"row": 3, "count": 1, "packSize": 1000, "packUnit": "ml"}), // ml agrees
	)
	if a.Lines[0].PackSize != 700 {
		t.Errorf("same unit keeps the size: %+v", a.Lines[0])
	}
	if a.Lines[1].PackSize != 0 || a.Lines[1].PackUnit != "" {
		t.Errorf("g on an ml row loses its pack size: %+v", a.Lines[1])
	}
	if a.Lines[2].PackSize != 1000 || a.Lines[2].PackUnit != "ml" {
		t.Errorf("ml on an ml row keeps it: %+v", a.Lines[2])
	}
}

func TestFinishReadsWeightsInGramsAndMillilitres(t *testing.T) {
	// A weighed line is in grams; for a Product in ml the same number is millilitres (1 g = 1 ml on a receipt).
	a := answer(t, nil, mkLine(map[string]any{"row": 3, "grams": 250, "priceCents": 80}))
	if a.Lines[0].Grams != 250 {
		t.Errorf("grams = %d", a.Lines[0].Grams)
	}
}

func TestFinishDateMustBeARealDayNotAfterToday(t *testing.T) {
	for date, ok := range map[string]bool{
		"2026-11-13": true, "2026-11-12": true, "2025-02-28": true,
		"2026-02-30": false, "2026-13-01": false, "13/11/2026": false, "2026-11-14": false, "2027-01-01": false, "yesterday": false,
	} {
		a, _, err := finish(t, mkRaw(t, map[string]any{"date": date}, mkLine(map[string]any{"row": 0, "count": 1})))
		if err != nil {
			t.Fatalf("%q: %v", date, err)
		}
		if ok && a.Date != date || !ok && a.Date != "" {
			t.Errorf("date %q: got %q, accepted should be %v", date, a.Date, ok)
		}
	}
}

func TestFinishAcceptsTwoHundredLinesAndRefusesTwoHundredAndOne(t *testing.T) {
	mk := func(n int) []byte {
		var ls []map[string]any
		for i := 0; i < n; i++ {
			ls = append(ls, mkLine(map[string]any{"row": -1, "text": fmt.Sprint("L", i), "count": 1, "priceCents": 100}))
		}
		return mkRaw(t, nil, ls...)
	}
	if _, _, err := finish(t, mk(200)); err != nil {
		t.Errorf("200 lines: %v", err)
	}
	_, _, err := finish(t, mk(201))
	if ra.CodeOf(err) != ra.CodeOutputTooLong {
		t.Errorf("201 lines: code = %q, want %q", ra.CodeOf(err), ra.CodeOutputTooLong)
	}
}

func TestFinishTrustsNothingElseFromTheAnswer(t *testing.T) {
	// Shops and products come from the server: extra fields in the answer have no effect and are not an error.
	raw := strings.Replace(string(mkRaw(t, nil, mkLine(map[string]any{"row": 0, "count": 1}))), `"readable":true`, `"readable":true,"shopId":99`, 1)
	a, _, err := finish(t, []byte(raw))
	if err != nil || len(a.Lines) != 1 {
		t.Errorf("extra field: %v %+v", err, a)
	}
}
