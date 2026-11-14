package fakeanthropic

import (
	"encoding/json"
	"strings"
)

// The receipt answer (beta.7, RR5; marker #fake:receipt). It is apart from the Recipe File answers above: a receipt read
// whose request text carries the marker (a scanned Product named "… #fake:receipt") gets a readable receipt built from the
// Scanned rows of that request, so a real read completes end to end against `cmd/fakeanthropic` (the page-layout guard's
// populated review). No other marker and no queued reply changes.

// receiptRow is the part of one Scanned row of the receipt request text (internal/receipt BuildRequestText) the answer uses.
type receiptRow struct {
	Row        int     `json:"row"`
	Product    string  `json:"product"`
	BaseUnit   string  `json:"baseUnit"`
	PackSize   int     `json:"packSize"`
	Scans      int     `json:"scans"`
	Quantity   float64 `json:"quantity"`
	Weighed    bool    `json:"weighed"`
	PriceCents int     `json:"priceCents"`
}

type receiptRequest struct {
	Shop string       `json:"shop"`
	Date string       `json:"date"`
	Rows []receiptRow `json:"rows"`
}

// receiptLine is one answer line in the receipt output schema (internal/receipt schema.go), every field present.
type receiptLine struct {
	Row            int    `json:"row"`
	Text           string `json:"text"`
	Count          int    `json:"count"`
	Grams          int    `json:"grams"`
	PriceCents     int    `json:"priceCents"`
	UnitPriceCents int    `json:"unitPriceCents"`
	PerKgCents     int    `json:"perKgCents"`
	Name           string `json:"name"`
	PackSize       int    `json:"packSize"`
	PackUnit       string `json:"packUnit"`
}

// receiptSource is the JSON between the source tags of a receipt request text, or "" when there is none.
func receiptSource(text string) string {
	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start < 0 || end < start {
		return ""
	}
	return text[start : end+1]
}

// ReceiptAnswer is the model's answer to a receipt read whose request text is `text`: readable, the request's shop and date,
// one matched line per Scanned row (its stored price, or 2.49 a pack when it has none, so every row is priced on the
// receipt), then two lines that match no row (a Product to add, one with a long name) and a receipt-wide discount. The total
// is the sum of the lines. A request text that is not a receipt request still gets the three unmatched lines.
func ReceiptAnswer(text string) string {
	var req receiptRequest
	_ = json.Unmarshal([]byte(receiptSource(text)), &req)
	lines := make([]receiptLine, 0, len(req.Rows)+3)
	for _, r := range req.Rows {
		l := receiptLine{Row: r.Row, Text: printed(r.Product), UnitPriceCents: -1, PerKgCents: -1}
		if r.Weighed {
			l.Grams = int(r.Quantity)
			l.PriceCents = 450
			l.PerKgCents = 1500
		} else {
			l.Count = max(r.Scans, 1)
			unit := r.PriceCents
			if unit <= 0 {
				unit = 249
			}
			l.UnitPriceCents = unit
			l.PriceCents = unit * l.Count
		}
		lines = append(lines, l)
	}
	lines = append(lines,
		receiptLine{Row: -1, Text: "KITCHEN ROLL 4 PACK", Count: 1, PriceCents: 349, UnitPriceCents: -1, PerKgCents: -1,
			Name: "Kitchen roll", PackSize: 4, PackUnit: "piece"},
		receiptLine{Row: -1, Text: "BIO OLIO EXTRA VERGINE DI OLIVA SPREMUTO A FREDDO 750ML", Count: 2, PriceCents: 1798, UnitPriceCents: 899,
			PerKgCents: -1, Name: "Organic extra virgin olive oil, cold pressed, from the farm shop", PackSize: 750, PackUnit: "ml"},
		receiptLine{Row: -1, Text: "SCONTO FEDELTA", PriceCents: -150, UnitPriceCents: -1, PerKgCents: -1},
	)
	total := 0
	for _, l := range lines {
		total += l.PriceCents
	}
	b, _ := json.Marshal(map[string]any{"readable": true, "shopName": req.Shop, "date": req.Date, "totalCents": total, "lines": lines})
	return string(b)
}

// printed is a Product name as a till prints it: capitals, without the marker, at most 32 characters.
func printed(name string) string {
	if i := strings.Index(name, "#fake:"); i >= 0 {
		name = name[:i]
	}
	name = strings.ToUpper(strings.TrimSpace(name))
	if r := []rune(name); len(r) > 32 {
		name = string(r[:32])
	}
	return name
}
