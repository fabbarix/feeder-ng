package receipt_test

import (
	"bytes"
	"fmt"
	"log/slog"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
)

// RR1 review: design §4.3, logs never carry the rows or the answer. Every exported type that holds receipt content
// prints and logs a summary only, whatever the verb or the slog handler. Each string below is a marker, and 987654 is
// the marker amount; none may show up.

func TestNoExportedTypeLeaksReceiptContent(t *testing.T) {
	const amt = 987654
	ev := receipt.Event{UUID: "SECRET-uuid", Quantity: amt, PriceCents: amt, PerKgCents: amt, ShopID: 1, Date: "SECRET-date"}
	row := receipt.Row{Index: 0, ProductID: 10, Product: "SECRET-product", Barcode: "SECRET-barcode", BaseUnit: "g", PackSize: amt,
		Scans: 1, Quantity: amt, PriceCents: amt, PerKgCents: amt, Events: []receipt.Event{ev}}
	val := receipt.Value{PriceCents: ip(amt), Grams: ip(amt), Count: ip(amt), PackSize: ip(amt), Name: "SECRET-name", Date: "SECRET-date", Shop: "SECRET-shop"}
	prop := receipt.Proposal{ID: "price:0", Kind: receipt.KindPrice, Text: "SECRET-text", Before: val, After: val}
	note := receipt.Note{Code: receipt.NoteDiscount, Text: "SECRET-text", Cents: ip(amt)}
	line := receipt.Line{Row: 0, Text: "SECRET-text", Count: amt, Grams: amt, PriceCents: ip(amt), Name: "SECRET-name", PackSize: amt}
	shop := receipt.Shop{ID: 2, Name: "SECRET-shop"}
	ctx := receipt.Context{Today: "SECRET-date", SessionShop: shop, SessionDate: "SECRET-date", Shops: []receipt.Shop{shop}}
	ni := &receipt.NewIngredient{Name: "SECRET-ingredient", BaseUnit: "g"}
	choice := receipt.AddChoice{Ingredient: receipt.IngredientChoice{New: ni}, ProductName: "SECRET-product", PackSize: amt}
	op := receipt.Op{Kind: receipt.OpNewScan, UUID: "receipt:r:0", Name: "SECRET-name", Quantity: amt, PriceCents: amt,
		Prices: []receipt.PriceChange{{UUID: "SECRET-uuid", PriceCents: amt}}, Ingredient: &choice.Ingredient}
	step := receipt.Step{Phase: receipt.PhaseAdd, Op: op, Inverse: op}
	values := map[string]any{
		"Event":       ev,
		"ScanEvent":   receipt.ScanEvent{UUID: "SECRET-uuid", Product: "SECRET-product", Barcode: "SECRET-barcode", Quantity: amt, PriceCents: amt},
		"Row":         row,
		"Rows":        []receipt.Row{row},
		"Shop":        shop,
		"Context":     ctx,
		"Line":        line,
		"Answer":      receipt.Answer{ShopName: "SECRET-shop", Date: "SECRET-date", TotalCents: ip(amt), Lines: []receipt.Line{line}},
		"Value":       val,
		"Proposal":    prop,
		"Note":        note,
		"Totals":      receipt.Totals{ScannedCents: amt, ProjectedCents: amt, ReceiptCents: ip(amt), Lines: 1},
		"Result":      receipt.Result{Proposals: []receipt.Proposal{prop}, Notes: []receipt.Note{note}, Totals: receipt.Totals{ScannedCents: amt}},
		"PriceChange": receipt.PriceChange{UUID: "SECRET-uuid", PriceCents: amt},
		"Choice":      choice,
		"NewIng":      *ni,
		"Op":          op,
		"Step":        step,
		"Plan":        receipt.Plan{Steps: []receipt.Step{step}},
		"PlanInput": receipt.PlanInput{ReadID: "r", Rows: []receipt.Row{row}, Ctx: ctx, Proposals: []receipt.Proposal{prop},
			Accept: []string{"price:0"}, Adds: map[string]receipt.AddChoice{"add:0": choice}},
		"RequestInput": receipt.RequestInput{Shop: "SECRET-shop", Date: "SECRET-date", Rows: []receipt.Row{row}},
	}
	for name, v := range values {
		var buf bytes.Buffer
		slog.New(slog.NewTextHandler(&buf, nil)).Info("x", "v", v)
		if name != "Rows" { // slog's JSON handler marshals a bare slice's elements: log a slice by its length
			slog.New(slog.NewJSONHandler(&buf, nil)).Info("x", "v", v)
		}
		out := buf.String() + fmt.Sprintf("%v|%+v|%#v|%s|%q|%d", v, v, v, v, v, v) + fmt.Sprintf("%+v", &v)
		for _, bad := range []string{"SECRET", "987654"} {
			if strings.Contains(out, bad) {
				t.Errorf("%s leaks %q: %s", name, bad, out)
			}
		}
	}
}
