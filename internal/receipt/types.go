// Package receipt reads a shop receipt against a Scan session (docs/design/receipt-reading.md, RR1). It is the pure
// core: no HTTP and no SQL. The request text, the checked answer, the proposals and the apply plan are plain values.
package receipt

import (
	"fmt"
	"log/slog"
)

// CodeNoReceiptFound is returned by Finish when the photos show no usable receipt (readable false, or no lines left).
const CodeNoReceiptFound = "no_receipt_found"

// Warnings returned by Finish. They never fail a read; they say what was set aside.
const (
	WarnRowOutOfRange = "row_out_of_range"
	WarnLineInvalid   = "line_invalid"
)

// NoteCode says why a Note is shown instead of a Proposal.
type NoteCode string

// Note codes.
const (
	NoteShopUnknown  NoteCode = "shop_unknown"
	NoteDiscount     NoteCode = "discount"
	NoteTotalDiffers NoteCode = "total_differs"
)

// Row is one grouped row of the Scanned list, as the server holds it. Index is the server's row index, which the model
// answers with. PriceCents is per pack, or for the weighed quantity of a weighed row; -1 means none. PerKgCents is -1
// when none. Quantity is in the base unit, summed over the events.
type Row struct {
	Index      int
	ProductID  int64
	Product    string
	Barcode    string
	BaseUnit   string
	PackSize   int
	Scans      int
	Quantity   float64
	Weighed    bool
	PriceCents int
	PerKgCents int
	Events     []Event
}

// Event is one scan of a row, with the fields a plan needs to undo or replace it.
type Event struct {
	UUID       string
	Quantity   float64
	PriceCents int
	PerKgCents int
	ShopID     int64
	Date       string
}

// Shop is a saved Shop.
type Shop struct {
	ID   int64
	Name string
}

// Context is what a read is matched against: the day, the session's Shop and date, the saved Shops and the currency.
type Context struct {
	Today       string
	SessionShop Shop
	SessionDate string
	Shops       []Shop
	Currency    string
	MinorDigits int
}

// Answer is the checked answer of the model. Nil pointers are unknown; counts, grams and pack sizes are 0 for none.
type Answer struct {
	ShopName   string
	Date       string
	TotalCents *int
	Lines      []Line
}

// Line is one bought line of the receipt. Row is the matched row index, or -1 when no row matches.
type Line struct {
	Row            int
	Text           string
	Count          int
	Grams          int
	PriceCents     *int
	UnitPriceCents *int
	PerKgCents     *int
	Name           string
	PackSize       int
	PackUnit       string
}

// Warning records a line that Finish set aside or changed. Line is the index in the answer's lines.
type Warning struct {
	Code string
	Line int
}

// RequestInput is what a read sends about the session: it is logged as counts only (see LogValue).
type RequestInput struct {
	Shop        string
	Date        string
	Currency    string
	MinorDigits int
	Rows        []Row
	PhotoCount  int
}

// LogValue logs counts only: never the shop, the rows or a product name.
func (in RequestInput) LogValue() slog.Value {
	return slog.GroupValue(slog.Int("rows", len(in.Rows)), slog.Int("photos", in.PhotoCount))
}

// String and Format print the counts only, for any verb.
func (in RequestInput) String() string { return fmt.Sprintf("%v", in) }

// Format prints the counts only, whatever the verb.
func (in RequestInput) Format(f fmt.State, _ rune) {
	fmt.Fprintf(f, "receipt.RequestInput{rows=%d, photos=%d}", len(in.Rows), in.PhotoCount)
}

// LogValue logs the number of lines only: never a line's text or amounts.
func (a Answer) LogValue() slog.Value {
	return slog.GroupValue(slog.Int("lines", len(a.Lines)))
}

// String and Format print the number of lines only, for any verb.
func (a Answer) String() string { return fmt.Sprintf("%v", a) }

// Format prints the number of lines only, whatever the verb.
func (a Answer) Format(f fmt.State, _ rune) {
	fmt.Fprintf(f, "receipt.Answer{lines=%d}", len(a.Lines))
}

// Kind is the kind of a Proposal; it sets the review section.
type Kind string

// Proposal kinds, in review order.
const (
	KindShop     Kind = "shop"
	KindDate     Kind = "date"
	KindPrice    Kind = "price"
	KindWeight   Kind = "weight"
	KindQuantity Kind = "quantity"
	KindPackSize Kind = "pack_size"
	KindName     Kind = "name"
	KindAdd      Kind = "add"
	KindMissing  Kind = "missing"
)

// Value is one side (before or after) of a Proposal. Nil and "" mean not set.
type Value struct {
	PriceCents *int
	PerKg      bool
	Grams      *int
	Count      *int
	PackSize   *int
	PackUnit   string
	Name       string
	Date       string
	Shop       string
	ShopID     int64
}

// Proposal is one suggested change. Row is the row index (-1 for shop, date and Adds); Line is the answer line index
// for an Add (-1 otherwise).
type Proposal struct {
	ID         string
	Kind       Kind
	Row        int
	Line       int
	Text       string
	Before     Value
	After      Value
	Checked    bool
	NeedsInput bool
}

// Note is shown in the review but is not a Proposal. Cents is set for a discount and for a total difference.
type Note struct {
	Code  NoteCode
	Text  string
	Cents *int
}

// Totals compares the Scanned list with the receipt. ProjectedCents is the receipt's lines after all proposals.
type Totals struct {
	ScannedCents   int
	ProjectedCents int
	ReceiptCents   *int
	Lines          int
}

// Result is what Propose returns: the proposals in review order, the notes and the totals.
type Result struct {
	Proposals []Proposal
	Notes     []Note
	Totals    Totals
}
