package fakeanthropic_test

import (
	"encoding/json"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/receipt"
	"github.com/fabbarix/feeder-ng/internal/recipeassistant/fakeanthropic"
)

// receiptRows is a Scanned list of two rows: a pack scanned twice with a stored price (the marker in its name) and a weighed row.
func receiptRows() []receipt.Row {
	return []receipt.Row{
		{Index: 0, Product: "Passata #fake:receipt", Barcode: "8000000001009", BaseUnit: "g", PackSize: 700, Scans: 2, Quantity: 1400, PriceCents: 129, PerKgCents: -1},
		{Index: 1, Product: "Parmigiano Reggiano", BaseUnit: "g", PackSize: 300, Scans: 1, Quantity: 312, Weighed: true, PriceCents: -1, PerKgCents: -1},
	}
}

func receiptText(t *testing.T) string {
	t.Helper()
	text, err := receipt.BuildRequestText(receipt.RequestInput{Shop: "Coop", Date: "2026-11-13", Currency: "EUR", MinorDigits: 2, Rows: receiptRows()})
	if err != nil {
		t.Fatal(err)
	}
	return text
}

// RR5: the #fake:receipt answer is a readable receipt the receipt package accepts, with one line per Scanned row and three
// lines that match none.
func TestReceiptAnswerIsAReadableReceiptForTheRows(t *testing.T) {
	ans, warnings, err := receipt.Finish([]byte(fakeanthropic.ReceiptAnswer(receiptText(t))), receiptRows(), "2026-11-13")
	if err != nil {
		t.Fatalf("Finish refused the fake's receipt answer: %v", err)
	}
	if len(warnings) != 0 {
		t.Fatalf("the fake's receipt answer must use every line, got warnings %v", warnings)
	}
	if ans.ShopName != "Coop" || ans.Date != "2026-11-13" {
		t.Fatalf("shop and date come from the request: %q %q", ans.ShopName, ans.Date)
	}
	var matched, unmatched int
	for _, l := range ans.Lines {
		if l.Row >= 0 {
			matched++
		} else {
			unmatched++
		}
	}
	if matched != 2 || unmatched != 3 {
		t.Fatalf("want 2 matched lines and 3 unmatched, got %d and %d: %+v", matched, unmatched, ans.Lines)
	}
	if ans.Lines[0].Text != "PASSATA" || ans.Lines[0].Count != 2 || ans.Lines[0].PriceCents == nil || *ans.Lines[0].PriceCents != 258 {
		t.Fatalf("the pack row is printed without the marker, twice at its stored price: %+v", ans.Lines[0])
	}
	if ans.Lines[1].Grams != 312 || ans.Lines[1].Count != 0 {
		t.Fatalf("the weighed row gives its grams: %+v", ans.Lines[1])
	}
}

// The marker answers a receipt through the Messages API; without it the recipe answers are unchanged (a Recipe File).
func TestReceiptMarkerAnswersAReceiptAndLeavesTheRecipeAnswers(t *testing.T) {
	s := fakeanthropic.New()
	defer s.Close()
	status, m, _ := post(t, s.URL, "sk-1", receiptText(t))
	if status != 200 || m["stop_reason"] != "end_turn" {
		t.Fatalf("receipt: %d %v", status, m)
	}
	text := m["content"].([]any)[0].(map[string]any)["text"].(string)
	var got map[string]any
	if err := json.Unmarshal([]byte(text), &got); err != nil || got["readable"] != true {
		t.Fatalf("the receipt marker must answer a readable receipt, got %s", text)
	}
	_, m, _ = post(t, s.URL, "sk-1", "<source>#fake:valid</source>")
	text = m["content"].([]any)[0].(map[string]any)["text"].(string)
	if text != fakeanthropic.ValidFile() {
		t.Fatalf("#fake:valid must still answer the Recipe File, got %s", text)
	}
}
