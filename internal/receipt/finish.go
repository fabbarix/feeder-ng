package receipt

import (
	"bytes"
	"encoding/json"
	"strconv"
	"time"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// maxLines is the most lines an answer may carry; more is CodeOutputTooLong (design §5.1).
const maxLines = 200

const dateLayout = "2006-01-02"

// Bounds past which a value is not a receipt's: they keep the arithmetic of Propose and BuildPlan (× 1000 for a price
// per kg) far from overflow. A line beyond them is dropped as line_invalid; a total beyond them is unknown.
const (
	maxCents = 100_000_000 // one million in a currency with two minor digits
	maxGrams = 10_000_000  // ten tonnes
	maxCount = 10_000
)

// Finish turns the model's raw answer into a checked Answer (design §5.1). Pure: today is "YYYY-MM-DD".
//
// Errors: CodeInvalidOutput for a malformed answer (not an object, a field missing or of the wrong type, a non-integer
// amount, a packUnit outside the enum); CodeNoReceiptFound when the photos show no receipt or no line is usable; and
// CodeOutputTooLong above 200 lines. Lines that cannot be used are dropped with a Warning; they never fail the read.
func Finish(raw []byte, rows []Row, today string) (Answer, []Warning, error) {
	var v any
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.UseNumber()
	if err := dec.Decode(&v); err != nil {
		return Answer{}, nil, invalid("the answer is not JSON")
	}
	if dec.More() {
		return Answer{}, nil, invalid("the answer has data after the JSON object")
	}
	top, ok := v.(map[string]any)
	if !ok {
		return Answer{}, nil, invalid("the answer is not a JSON object")
	}
	readable, okReadable := top["readable"].(bool)
	shopName, okShop := top["shopName"].(string)
	date, okDate := top["date"].(string)
	total, okTotal := intField(top, "totalCents")
	rawLines, okLines := top["lines"].([]any)
	if !(okReadable && okShop && okDate && okTotal && okLines) {
		return Answer{}, nil, invalid("a top-level field is missing or has the wrong type")
	}
	if !readable {
		return Answer{}, nil, noReceipt()
	}
	if len(rawLines) > maxLines {
		return Answer{}, nil, &ra.Error{Code: ra.CodeOutputTooLong}
	}

	var lines []Line
	var warnings []Warning
	for i, item := range rawLines {
		m, ok := item.(map[string]any)
		if !ok {
			return Answer{}, nil, invalid("a line is not a JSON object")
		}
		rl, err := parseRawLine(m)
		if err != nil {
			return Answer{}, nil, err
		}
		ln, ws, keep := checkLine(i, rl, rows)
		warnings = append(warnings, ws...)
		if keep {
			lines = append(lines, ln)
		}
	}
	if len(lines) == 0 {
		return Answer{}, nil, noReceipt()
	}

	a := Answer{ShopName: shopName, Date: checkDate(date, today), Lines: lines}
	if total >= 0 && total <= maxCents {
		a.TotalCents = intPtr(total)
	}
	return a, warnings, nil
}

// rawLine is one line as the model wrote it, every field present and typed.
type rawLine struct {
	row, count, grams, price, unitPrice, perKg, packSize int
	text, name, packUnit                                 string
}

func parseRawLine(m map[string]any) (rawLine, error) {
	var rl rawLine
	var ok [10]bool
	rl.row, ok[0] = intField(m, "row")
	rl.text, ok[1] = m["text"].(string)
	rl.count, ok[2] = intField(m, "count")
	rl.grams, ok[3] = intField(m, "grams")
	rl.price, ok[4] = intField(m, "priceCents")
	rl.unitPrice, ok[5] = intField(m, "unitPriceCents")
	rl.perKg, ok[6] = intField(m, "perKgCents")
	rl.name, ok[7] = m["name"].(string)
	rl.packSize, ok[8] = intField(m, "packSize")
	rl.packUnit, ok[9] = m["packUnit"].(string)
	for _, good := range ok {
		if !good {
			return rawLine{}, invalid("a line field is missing or has the wrong type")
		}
	}
	switch rl.packUnit {
	case "g", "ml", "piece", "":
	default:
		return rawLine{}, invalid("packUnit is not one of g, ml, piece")
	}
	return rl, nil
}

// checkLine maps the sentinels of one line and applies the row, sign and pack rules. keep is false when the line is
// dropped; the warnings say why.
func checkLine(i int, rl rawLine, rows []Row) (Line, []Warning, bool) {
	var ws []Warning
	row := rl.row
	if row < -1 || row >= len(rows) {
		row = -1
		ws = append(ws, Warning{Code: WarnRowOutOfRange, Line: i})
	}
	// A negative priceCents other than -1 on an unmatched line is a whole-receipt discount: kept, never dropped.
	badPrice := rl.price < -1 && row != -1
	tooBig := rl.count > maxCount || rl.grams > maxGrams || rl.packSize > maxGrams ||
		rl.price > maxCents || rl.price < -maxCents || rl.unitPrice > maxCents || rl.perKg > maxCents
	if rl.count < 0 || rl.grams < 0 || rl.packSize < 0 || rl.unitPrice < -1 || rl.perKg < -1 || badPrice || tooBig {
		return Line{}, append(ws, Warning{Code: WarnLineInvalid, Line: i}), false
	}
	ln := Line{
		Row: row, Text: rl.text, Count: rl.count, Grams: rl.grams,
		PriceCents: sentinel(rl.price), UnitPriceCents: sentinel(rl.unitPrice), PerKgCents: sentinel(rl.perKg),
		Name: rl.name, PackSize: rl.packSize, PackUnit: rl.packUnit,
	}
	if ln.PackSize == 0 || ln.PackUnit == "" {
		ln.PackSize, ln.PackUnit = 0, ""
	}
	if ln.Row >= 0 && ln.PackUnit != rows[ln.Row].BaseUnit {
		ln.PackSize, ln.PackUnit = 0, ""
	}
	return ln, ws, true
}

func sentinel(v int) *int {
	if v == -1 {
		return nil
	}
	return intPtr(v)
}

// checkDate keeps a real day, not later than today; anything else is absent.
func checkDate(date, today string) string {
	if len(date) != len(dateLayout) {
		return ""
	}
	if _, err := time.Parse(dateLayout, date); err != nil {
		return ""
	}
	if date > today {
		return ""
	}
	return date
}

// intField reads a JSON integer. A number with a fraction, or a non-number, is not an integer.
func intField(m map[string]any, key string) (int, bool) {
	n, ok := m[key].(json.Number)
	if !ok {
		return 0, false
	}
	i, err := strconv.ParseInt(n.String(), 10, 64)
	if err != nil {
		return 0, false
	}
	return int(i), true
}

func invalid(msg string) error {
	return &ra.Error{Code: ra.CodeInvalidOutput, Message: msg}
}

func noReceipt() error {
	return &ra.Error{Code: CodeNoReceiptFound, Message: "no receipt found in the photos"}
}

func intPtr(v int) *int { return &v }
