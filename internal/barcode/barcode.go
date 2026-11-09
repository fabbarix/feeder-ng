// Package barcode is the pure barcode logic shared (as a mirrored TypeScript
// module, web/src/features/scan/lib/barcode.ts) between server and phone:
// GTIN normalisation, GS1 Digital Link parsing, Weight Barcode Rule decoding and
// resolution of a scan at a Shop or at home. Stdlib only; no HTTP, no SQL.
// Both implementations are tested against testdata/vectors.json.
package barcode

import (
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
)

// Format is the symbology reported by the scanner (BarcodeDetector names).
// The empty Format means "unknown" (e.g. a code typed by hand).
type Format string

const (
	FormatEAN13      Format = "ean_13"
	FormatEAN8       Format = "ean_8"
	FormatUPCA       Format = "upc_a"
	FormatUPCE       Format = "upc_e"
	FormatCode128    Format = "code_128"
	FormatQR         Format = "qr_code"
	FormatDataMatrix Format = "data_matrix"
)

// Kind classifies what a raw scan is.
type Kind string

const (
	KindGTIN       Kind = "gtin"        // Code is a valid GTIN as 14 digits
	KindOpaque     Kind = "opaque"      // Code is an uninterpreted string (Code 128, shop labels)
	KindNotProduct Kind = "not_product" // QR/DataMatrix/other content: "not a product code" toast
	KindInvalid    Kind = "invalid"     // a misread; Reason says why
)

// Scanned is a normalised scan.
type Scanned struct {
	Kind   Kind   `json:"kind"`
	Code   string `json:"code,omitempty"`   // GTIN-14 (zero padded) or opaque string
	EAN13  string `json:"ean13,omitempty"`  // the 13 digit form when Code starts with 0; what Weight Barcode Rules read
	Reason string `json:"reason,omitempty"` // invalid: empty | length | format | check_digit
}

// Parse normalises a raw scan. See docs/dev/design/t5-barcode.md for the rules.
func Parse(raw string, format Format) Scanned {
	s := strings.TrimSpace(raw)
	if s == "" {
		return invalid("empty")
	}
	switch format {
	case FormatEAN13:
		return gtinOfLength(s, 13)
	case FormatEAN8:
		return gtinOfLength(s, 8)
	case FormatUPCA:
		return gtinOfLength(s, 12)
	case FormatUPCE:
		return upcE(s)
	case FormatCode128:
		return Scanned{Kind: KindOpaque, Code: s}
	case FormatQR, FormatDataMatrix:
		return digitalLink(s)
	case "":
		return unknownFormat(s)
	default:
		return Scanned{Kind: KindNotProduct}
	}
}

// Canonical normalises a barcode typed or stored by a user (unknown format).
// ok is false for invalid input.
func Canonical(raw string) (code string, ok bool) {
	s := Parse(raw, "")
	switch s.Kind {
	case KindGTIN, KindOpaque:
		return s.Code, true
	}
	return "", false
}

// ValueKind says whether a Weight Barcode Rule's value digits are a weight or a price.
type ValueKind string

const (
	ValueWeight ValueKind = "weight"
	ValuePrice  ValueKind = "price"
)

// ValueUnit is the unit a Weight Barcode Rule's value is written in. Weight
// rules use g (default), kg, oz or lb; price rules use the household
// currency's minor unit (cents for USD) and leave it empty. Resolutions are
// always in grams and cents.
type ValueUnit string

const (
	UnitDefault ValueUnit = ""   // g for a weight rule, minor currency unit for a price rule
	UnitGram    ValueUnit = "g"  // 1 g
	UnitKilo    ValueUnit = "kg" // 1000 g
	UnitOunce   ValueUnit = "oz" // 28.349523125 g
	UnitPound   ValueUnit = "lb" // 453.59237 g
)

// Span is a run of digits in the 13 digit barcode. Start is 1-based.
type Span struct {
	Start  int `json:"start"`
	Length int `json:"length"`
}

// WeightRule is a Shop's Weight Barcode Rule.
type WeightRule struct {
	ID            int64     `json:"id"`
	Prefix        string    `json:"prefix"`
	Item          Span      `json:"item"`
	Value         Span      `json:"value"`
	ValueKind     ValueKind `json:"valueKind"`
	ValueUnit     ValueUnit `json:"valueUnit,omitempty"` // weight: g (default) kg oz lb; price: empty (minor currency unit)
	DecimalPlaces int       `json:"decimalPlaces"`       // the value digits are divided by 10^DecimalPlaces, in ValueUnit
}

// Validate reports why a rule cannot be used (nil when fine).
func (r WeightRule) Validate() error {
	if !isDigits(r.Prefix) {
		return errors.New("prefix must be one or more digits")
	}
	switch r.ValueKind {
	case ValueWeight:
		switch r.ValueUnit {
		case UnitDefault, UnitGram, UnitKilo, UnitOunce, UnitPound:
		default:
			return fmt.Errorf("unknown weight unit %q", r.ValueUnit)
		}
	case ValuePrice:
		if r.ValueUnit != UnitDefault {
			return errors.New("a price rule has no value unit")
		}
	default:
		return fmt.Errorf("unknown value kind %q", r.ValueKind)
	}
	if err := validSpan(r.Item); err != nil {
		return fmt.Errorf("item %w", err)
	}
	if err := validSpan(r.Value); err != nil {
		return fmt.Errorf("value %w", err)
	}
	if r.Item.Start <= len(r.Prefix) {
		return errors.New("item starts inside the prefix")
	}
	if r.Value.Start <= len(r.Prefix) {
		return errors.New("value starts inside the prefix")
	}
	if r.Item.Start <= lastDigit(r.Value) && r.Value.Start <= lastDigit(r.Item) {
		return errors.New("item and value overlap")
	}
	if r.DecimalPlaces < 0 || r.DecimalPlaces > r.Value.Length {
		return errors.New("decimal places must be between 0 and the value length")
	}
	return nil
}

// WeightProductKey is the key of Catalog.WeightProducts.
func WeightProductKey(ruleID int64, itemCode string) string {
	return fmt.Sprintf("%d:%s", ruleID, itemCode)
}

// Catalog is everything needed to resolve a scan, scoped to one Shop (or to
// home when the Shop fields are empty). The phone caches exactly this.
type Catalog struct {
	ShopBarcodes    map[string]int64 `json:"shopBarcodes,omitempty"`    // this Shop's Shop Barcodes: Scanned.Code -> product id
	WeightRules     []WeightRule     `json:"weightRules,omitempty"`     // this Shop's rules
	WeightProducts  map[string]int64 `json:"weightProducts,omitempty"`  // WeightProductKey(rule, item code) -> product id
	PricePerKgCents map[int64]int    `json:"pricePerKgCents,omitempty"` // product id -> last price per kg at this Shop
	GlobalBarcodes  map[string]int64 `json:"globalBarcodes,omitempty"`  // Scanned.Code -> product id
}

// Outcome is the result class of a resolution.
type Outcome string

const (
	OutcomeProduct               Outcome = "product"
	OutcomeWeighed               Outcome = "weighed"                 // product with a decoded WeightGrams
	OutcomeAskWeight             Outcome = "ask_weight"              // price-valued, no price per kg known
	OutcomeUnknownWeighedProduct Outcome = "unknown_weighed_product" // rule prefix matched, item code unknown
	OutcomeUnknown               Outcome = "unknown"
	OutcomeNotProduct            Outcome = "not_product"
	OutcomeInvalid               Outcome = "invalid"
)

// Source says which resolution step matched.
type Source string

const (
	ViaShopBarcode Source = "shop_barcode"
	ViaWeightRule  Source = "weight_rule"
	ViaGlobal      Source = "global"
)

// Resolution is the flat result; zero fields are "absent".
type Resolution struct {
	Outcome         Outcome `json:"outcome"`
	Via             Source  `json:"via,omitempty"`
	ProductID       int64   `json:"productId,omitempty"`
	Code            string  `json:"code,omitempty"`
	RuleID          int64   `json:"ruleId,omitempty"`
	ItemCode        string  `json:"itemCode,omitempty"`
	WeightGrams     float64 `json:"weightGrams,omitempty"` // grams, rounded to the mg
	PriceCents      int     `json:"priceCents,omitempty"`
	PricePerKgCents int     `json:"pricePerKgCents,omitempty"`
	Reason          string  `json:"reason,omitempty"` // invalid: Parse reasons | zero_value
}

// Resolve applies: Shop Barcode -> Weight Barcode Rules -> global -> unknown.
func Resolve(s Scanned, c Catalog) Resolution {
	switch s.Kind {
	case KindNotProduct:
		return Resolution{Outcome: OutcomeNotProduct}
	case KindInvalid:
		return Resolution{Outcome: OutcomeInvalid, Reason: s.Reason}
	}
	if id, ok := c.ShopBarcodes[s.Code]; ok {
		return Resolution{Outcome: OutcomeProduct, Via: ViaShopBarcode, ProductID: id, Code: s.Code}
	}
	var unknown *Resolution
	if s.EAN13 != "" {
		for _, rule := range rulesLongestPrefixFirst(c.WeightRules) {
			if rule.Validate() != nil || !strings.HasPrefix(s.EAN13, rule.Prefix) {
				continue
			}
			value := parseDigits(s.EAN13[rule.Value.Start-1 : lastDigit(rule.Value)])
			if value == 0 {
				return Resolution{Outcome: OutcomeInvalid, Reason: "zero_value", Code: s.Code}
			}
			itemCode := s.EAN13[rule.Item.Start-1 : lastDigit(rule.Item)]
			id, known := c.WeightProducts[WeightProductKey(rule.ID, itemCode)]
			if !known {
				if unknown == nil {
					r := unknownProduct(s.Code, rule, itemCode, value)
					unknown = &r
				}
				continue
			}
			return matchedProduct(s.Code, rule, itemCode, id, value, c)
		}
	}
	if id, ok := c.GlobalBarcodes[s.Code]; ok {
		return Resolution{Outcome: OutcomeProduct, Via: ViaGlobal, ProductID: id, Code: s.Code}
	}
	if unknown != nil {
		return *unknown
	}
	return Resolution{Outcome: OutcomeUnknown, Code: s.Code}
}

// WeightFromPrice derives grams (rounded) from a price and a price per kg.
func WeightFromPrice(priceCents, pricePerKgCents int) (grams int, ok bool) {
	if priceCents <= 0 || pricePerKgCents <= 0 {
		return 0, false
	}
	// round half up of priceCents * 1000 / pricePerKgCents, in integers
	return (2*priceCents*1000 + pricePerKgCents) / (2 * pricePerKgCents), true
}

// PricePerKgFromWeight derives the price per kg (rounded cents) from a price
// and a weight the user gave after an ask_weight outcome.
func PricePerKgFromWeight(priceCents int, grams float64) (pricePerKgCents int, ok bool) {
	if priceCents <= 0 || grams <= 0 {
		return 0, false
	}
	return int(math.Round(float64(priceCents) * 1000 / grams)), true
}

// matchedProduct resolves a scan whose weight rule and item code are known.
func matchedProduct(code string, rule WeightRule, itemCode string, id int64, value int64, c Catalog) Resolution {
	base := Resolution{Via: ViaWeightRule, ProductID: id, Code: code, RuleID: rule.ID, ItemCode: itemCode}
	if rule.ValueKind == ValueWeight {
		base.Outcome = OutcomeWeighed
		base.WeightGrams = weightGrams(value, rule)
		return base
	}
	cents := priceCents(value, rule.DecimalPlaces)
	base.PriceCents = cents
	ppk, known := c.PricePerKgCents[id]
	if !known || ppk <= 0 {
		base.Outcome = OutcomeAskWeight
		return base
	}
	grams, _ := WeightFromPrice(cents, ppk)
	base.Outcome = OutcomeWeighed
	base.PricePerKgCents = ppk
	base.WeightGrams = float64(grams)
	return base
}

// unknownProduct is the resolution when a rule's prefix matches but its item code is unknown.
func unknownProduct(code string, rule WeightRule, itemCode string, value int64) Resolution {
	r := Resolution{Outcome: OutcomeUnknownWeighedProduct, Code: code, RuleID: rule.ID, ItemCode: itemCode}
	if rule.ValueKind == ValueWeight {
		r.WeightGrams = weightGrams(value, rule)
	} else {
		r.PriceCents = priceCents(value, rule.DecimalPlaces)
	}
	return r
}

// rulesLongestPrefixFirst returns a copy of the rules, longest prefix first; equal prefixes keep their order.
func rulesLongestPrefixFirst(rules []WeightRule) []WeightRule {
	out := append([]WeightRule(nil), rules...)
	sort.SliceStable(out, func(i, j int) bool { return len(out[i].Prefix) > len(out[j].Prefix) })
	return out
}

// weightGrams decodes a weight value in the rule's unit to grams, rounded to the mg.
func weightGrams(value int64, rule WeightRule) float64 {
	return roundMilligram(float64(value) / pow10(rule.DecimalPlaces) * unitGrams(rule.ValueUnit))
}

// priceCents decodes a price value to cents, rounding half up.
func priceCents(value int64, decimalPlaces int) int {
	p := int64(1)
	for i := 0; i < decimalPlaces; i++ {
		p *= 10
	}
	return int((2*value + p) / (2 * p))
}

func unitGrams(u ValueUnit) float64 {
	switch u {
	case UnitKilo:
		return 1000
	case UnitOunce:
		return 28.349523125
	case UnitPound:
		return 453.59237
	default:
		return 1
	}
}

func pow10(n int) float64 {
	p := 1.0
	for i := 0; i < n; i++ {
		p *= 10
	}
	return p
}

func roundMilligram(g float64) float64 {
	return math.Round(g*1000) / 1000
}

// validSpan checks a span lies within the 13 digit barcode and before its check digit.
func validSpan(s Span) error {
	if s.Start < 1 || s.Length < 1 {
		return errors.New("span must start at 1 or later and have a length of at least 1")
	}
	if lastDigit(s) > 12 {
		return errors.New("span reaches the check digit or beyond")
	}
	return nil
}

// lastDigit is the 1-based position of the last digit of a span.
func lastDigit(s Span) int { return s.Start + s.Length - 1 }

// invalid is a misread with its reason.
func invalid(reason string) Scanned { return Scanned{Kind: KindInvalid, Reason: reason} }

// gtinOfLength checks a digits-only code of an exact GTIN length.
func gtinOfLength(s string, n int) Scanned {
	if !isDigits(s) {
		return invalid("format")
	}
	if len(s) != n {
		return invalid("length")
	}
	return gtin(s)
}

// gtin checks the check digit of a 12, 13 or 14 digit string (or 8 for EAN-8) and returns the GTIN-14.
func gtin(digits string) Scanned {
	if !checkDigitOK(digits) {
		return invalid("check_digit")
	}
	return gtinResult(digits)
}

// gtinResult zero pads a checked digit string to GTIN-14 and sets EAN13 when it starts with 0.
func gtinResult(digits string) Scanned {
	code := strings.Repeat("0", 14-len(digits)) + digits
	s := Scanned{Kind: KindGTIN, Code: code}
	if code[0] == '0' {
		s.EAN13 = code[1:]
	}
	return s
}

// upcE reads an 8 digit UPC-E: number system 0 or 1, expanded to UPC-A.
func upcE(s string) Scanned {
	if !isDigits(s) {
		return invalid("format")
	}
	if len(s) != 8 {
		return invalid("length")
	}
	if s[0] != '0' && s[0] != '1' {
		return invalid("format")
	}
	upca, ok := expandUPCE(s)
	if !ok {
		return invalid("check_digit")
	}
	return gtinResult(upca)
}

// expandUPCE expands an 8 digit UPC-E (number system, six digits, check digit)
// to its 12 digit UPC-A. ok is false when the UPC-E check digit does not match.
func expandUPCE(s string) (string, bool) {
	ns := s[0:1]
	x := s[1:7]
	var mfr, item string
	switch x[5] {
	case '0', '1', '2':
		mfr = x[0:2] + x[5:6] + "00"
		item = "00" + x[2:5]
	case '3':
		mfr = x[0:3] + "00"
		item = "000" + x[3:5]
	case '4':
		mfr = x[0:4] + "0"
		item = "0000" + x[4:5]
	default:
		mfr = x[0:5]
		item = "0000" + x[5:6]
	}
	body := ns + mfr + item
	c := checkDigit(body)
	if int(s[7]-'0') != c {
		return "", false
	}
	return body + string(rune('0'+c)), true
}

// unknownFormat reads a code whose symbology is not known (typed by hand).
func unknownFormat(s string) Scanned {
	if _, ok := afterHTTPScheme(s); ok {
		return digitalLink(s)
	}
	if !isDigits(s) {
		return Scanned{Kind: KindOpaque, Code: s}
	}
	switch len(s) {
	case 12, 13, 14:
		return gtin(s)
	case 8:
		if checkDigitOK(s) {
			return gtinResult(s)
		}
		if s[0] == '0' || s[0] == '1' {
			if upca, ok := expandUPCE(s); ok {
				return gtinResult(upca)
			}
		}
		return invalid("check_digit")
	}
	return Scanned{Kind: KindOpaque, Code: s}
}

// digitalLink reads a QR or DataMatrix: only a GS1 Digital Link URL carries a product code.
func digitalLink(s string) Scanned {
	gtinDigits, ok := digitalLinkGTIN(s)
	if !ok {
		return Scanned{Kind: KindNotProduct}
	}
	return gtin(gtinDigits)
}

// digitalLinkGTIN returns the 14 digits after a "01" path segment of an http(s) URL.
func digitalLinkGTIN(s string) (string, bool) {
	rest, ok := afterHTTPScheme(s)
	if !ok {
		return "", false
	}
	if i := strings.IndexAny(rest, "?#"); i >= 0 {
		rest = rest[:i]
	}
	i := strings.IndexByte(rest, '/')
	if i < 0 {
		return "", false
	}
	segs := strings.Split(rest[i+1:], "/")
	for j := 0; j+1 < len(segs); j++ {
		if segs[j] == "01" && len(segs[j+1]) == 14 && isDigits(segs[j+1]) {
			return segs[j+1], true
		}
	}
	return "", false
}

// afterHTTPScheme returns what follows an http:// or https:// prefix (ASCII case-insensitive).
func afterHTTPScheme(s string) (string, bool) {
	switch {
	case hasPrefixASCIIFold(s, "https://"):
		return s[len("https://"):], true
	case hasPrefixASCIIFold(s, "http://"):
		return s[len("http://"):], true
	}
	return "", false
}

func hasPrefixASCIIFold(s, prefix string) bool {
	if len(s) < len(prefix) {
		return false
	}
	for i := 0; i < len(prefix); i++ {
		c := s[i]
		if 'A' <= c && c <= 'Z' {
			c += 'a' - 'A'
		}
		if c != prefix[i] {
			return false
		}
	}
	return true
}

// checkDigitOK reports whether the last digit is the GS1 check digit of the rest.
func checkDigitOK(d string) bool {
	return checkDigit(d[:len(d)-1]) == int(d[len(d)-1]-'0')
}

// checkDigit is the GS1 mod-10 check digit of a body: weights 3 and 1 counted from its right.
func checkDigit(body string) int {
	sum := 0
	for i := 0; i < len(body); i++ {
		w := 3
		if (len(body)-1-i)%2 == 1 {
			w = 1
		}
		sum += int(body[i]-'0') * w
	}
	return (10 - sum%10) % 10
}

func isDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// parseDigits reads a run of digits (at most 12 in a 13 digit barcode).
func parseDigits(s string) int64 {
	var n int64
	for i := 0; i < len(s); i++ {
		n = n*10 + int64(s[i]-'0')
	}
	return n
}
