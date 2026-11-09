// Package barcode is the pure barcode logic shared (as a mirrored TypeScript
// module, web/src/features/scan/lib/barcode.ts) between server and phone:
// GTIN normalisation, GS1 Digital Link parsing, Weight Barcode Rule decoding and
// resolution of a scan at a Shop or at home. Stdlib only; no HTTP, no SQL.
// Both implementations are tested against testdata/vectors.json.
package barcode

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
func Parse(raw string, format Format) Scanned { panic("TODO") }

// Canonical normalises a barcode typed or stored by a user (unknown format).
// ok is false for invalid input.
func Canonical(raw string) (code string, ok bool) { panic("TODO") }

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
func (r WeightRule) Validate() error { panic("TODO") }

// WeightItemKey is the key of Catalog.WeightItems.
func WeightItemKey(ruleID int64, itemCode string) string { panic("TODO") }

// Catalog is everything needed to resolve a scan, scoped to one Shop (or to
// home when the Shop fields are empty). The phone caches exactly this.
type Catalog struct {
	ShopBarcodes    map[string]int64 `json:"shopBarcodes,omitempty"`    // this Shop's Shop Barcodes: Scanned.Code -> product id
	WeightRules     []WeightRule     `json:"weightRules,omitempty"`     // this Shop's rules
	WeightItems     map[string]int64 `json:"weightItems,omitempty"`     // WeightItemKey(rule, item code) -> product id
	PricePerKgCents map[int64]int    `json:"pricePerKgCents,omitempty"` // product id -> last price per kg at this Shop
	GlobalBarcodes  map[string]int64 `json:"globalBarcodes,omitempty"`  // Scanned.Code -> product id
}

// Outcome is the result class of a resolution.
type Outcome string

const (
	OutcomeProduct            Outcome = "product"
	OutcomeWeighed            Outcome = "weighed"              // product with a decoded WeightGrams
	OutcomeAskWeight          Outcome = "ask_weight"           // price-valued, no price per kg known
	OutcomeUnknownWeighedItem Outcome = "unknown_weighed_item" // rule prefix matched, item code unknown
	OutcomeUnknown            Outcome = "unknown"
	OutcomeNotProduct         Outcome = "not_product"
	OutcomeInvalid            Outcome = "invalid"
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
func Resolve(s Scanned, c Catalog) Resolution { panic("TODO") }

// WeightFromPrice derives grams (rounded) from a price and a price per kg.
func WeightFromPrice(priceCents, pricePerKgCents int) (grams int, ok bool) { panic("TODO") }

// PricePerKgFromWeight derives the price per kg (rounded cents) from a price
// and a weight the user gave after an ask_weight outcome.
func PricePerKgFromWeight(priceCents int, grams float64) (pricePerKgCents int, ok bool) {
	panic("TODO")
}
