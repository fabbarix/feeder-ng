package receipt

import (
	"fmt"
	"log/slog"
)

// Every exported type that holds receipt content (Product names, barcodes, receipt text, Shop names, Prices,
// quantities, dates) prints and logs as a redacted summary: kinds, ids, indexes and counts only (design §4.3: logs
// never carry the photos, the rows or the answer). Format covers every fmt verb, and so slog's text handler;
// LogValue covers slog's JSON handler, which would otherwise marshal the fields. JSON encoding for the API is not
// affected, so slog's JSON handler still marshals the elements of a bare slice ([]Row, []Proposal): log a slice by
// its length, or inside one of these types.

func summary(f fmt.State, format string, args ...any) { fmt.Fprintf(f, format, args...) }

// Format prints the row's index and number of scans only.
func (r Row) Format(f fmt.State, _ rune) {
	summary(f, "receipt.Row{index=%d, scans=%d}", r.Index, r.Scans)
}

// LogValue logs the row's index and number of scans only.
func (r Row) LogValue() slog.Value {
	return slog.GroupValue(slog.Int("index", r.Index), slog.Int("scans", r.Scans))
}

// Format prints nothing of the event.
func (Event) Format(f fmt.State, _ rune) { summary(f, "receipt.Event{…}") }

// LogValue logs nothing of the event.
func (Event) LogValue() slog.Value { return slog.StringValue("receipt.Event{…}") }

// Format prints nothing of the event.
func (ScanEvent) Format(f fmt.State, _ rune) { summary(f, "receipt.ScanEvent{…}") }

// LogValue logs nothing of the event.
func (ScanEvent) LogValue() slog.Value { return slog.StringValue("receipt.ScanEvent{…}") }

// Format prints the Shop's id only.
func (s Shop) Format(f fmt.State, _ rune) { summary(f, "receipt.Shop{id=%d}", s.ID) }

// LogValue logs the Shop's id only.
func (s Shop) LogValue() slog.Value { return slog.GroupValue(slog.Int64("id", s.ID)) }

// Format prints the number of saved Shops only.
func (c Context) Format(f fmt.State, _ rune) { summary(f, "receipt.Context{shops=%d}", len(c.Shops)) }

// LogValue logs the number of saved Shops only.
func (c Context) LogValue() slog.Value { return slog.GroupValue(slog.Int("shops", len(c.Shops))) }

// Format prints the matched row only.
func (l Line) Format(f fmt.State, _ rune) { summary(f, "receipt.Line{row=%d}", l.Row) }

// LogValue logs the matched row only.
func (l Line) LogValue() slog.Value { return slog.GroupValue(slog.Int("row", l.Row)) }

// Format prints nothing of the value.
func (Value) Format(f fmt.State, _ rune) { summary(f, "receipt.Value{…}") }

// LogValue logs nothing of the value.
func (Value) LogValue() slog.Value { return slog.StringValue("receipt.Value{…}") }

// Format prints the proposal's id, kind and state only.
func (p Proposal) Format(f fmt.State, _ rune) {
	summary(f, "receipt.Proposal{id=%s, kind=%s, checked=%t}", p.ID, p.Kind, p.Checked)
}

// LogValue logs the proposal's id and kind only.
func (p Proposal) LogValue() slog.Value {
	return slog.GroupValue(slog.String("id", p.ID), slog.String("kind", string(p.Kind)))
}

// Format prints the note's code only.
func (n Note) Format(f fmt.State, _ rune) { summary(f, "receipt.Note{code=%s}", n.Code) }

// LogValue logs the note's code only.
func (n Note) LogValue() slog.Value { return slog.GroupValue(slog.String("code", string(n.Code))) }

// Format prints the number of lines only.
func (t Totals) Format(f fmt.State, _ rune) { summary(f, "receipt.Totals{lines=%d}", t.Lines) }

// LogValue logs the number of lines only.
func (t Totals) LogValue() slog.Value { return slog.GroupValue(slog.Int("lines", t.Lines)) }

// Format prints counts only.
func (r Result) Format(f fmt.State, _ rune) {
	summary(f, "receipt.Result{proposals=%d, notes=%d}", len(r.Proposals), len(r.Notes))
}

// LogValue logs counts only.
func (r Result) LogValue() slog.Value {
	return slog.GroupValue(slog.Int("proposals", len(r.Proposals)), slog.Int("notes", len(r.Notes)))
}

// Format prints nothing of the change.
func (PriceChange) Format(f fmt.State, _ rune) { summary(f, "receipt.PriceChange{…}") }

// LogValue logs nothing of the change.
func (PriceChange) LogValue() slog.Value { return slog.StringValue("receipt.PriceChange{…}") }

// Format prints the Ingredient's id only.
func (c IngredientChoice) Format(f fmt.State, _ rune) {
	summary(f, "receipt.IngredientChoice{id=%d, new=%t}", c.ID, c.New != nil)
}

// LogValue logs the Ingredient's id only.
func (c IngredientChoice) LogValue() slog.Value {
	return slog.GroupValue(slog.Int64("id", c.ID), slog.Bool("new", c.New != nil))
}

// Format prints nothing of the new Ingredient.
func (NewIngredient) Format(f fmt.State, _ rune) { summary(f, "receipt.NewIngredient{…}") }

// LogValue logs nothing of the new Ingredient.
func (NewIngredient) LogValue() slog.Value { return slog.StringValue("receipt.NewIngredient{…}") }

// Format prints nothing of the choice.
func (AddChoice) Format(f fmt.State, _ rune) { summary(f, "receipt.AddChoice{…}") }

// LogValue logs nothing of the choice.
func (AddChoice) LogValue() slog.Value { return slog.StringValue("receipt.AddChoice{…}") }

// Format prints the operation's kind and its uuid or ref only.
func (o Op) Format(f fmt.State, _ rune) {
	summary(f, "receipt.Op{kind=%s, uuid=%s, ref=%s, prices=%d}", o.Kind, o.UUID, o.Ref, len(o.Prices))
}

// LogValue logs the operation's kind only.
func (o Op) LogValue() slog.Value { return slog.GroupValue(slog.String("kind", string(o.Kind))) }

// Format prints the phase and the operations' kinds only.
func (s Step) Format(f fmt.State, _ rune) {
	summary(f, "receipt.Step{phase=%s, op=%s, inverse=%s}", s.Phase, s.Op.Kind, s.Inverse.Kind)
}

// LogValue logs the phase and the operation's kind only.
func (s Step) LogValue() slog.Value {
	return slog.GroupValue(slog.String("phase", string(s.Phase)), slog.String("op", string(s.Op.Kind)))
}

// Format prints the number of steps only.
func (p Plan) Format(f fmt.State, _ rune) { summary(f, "receipt.Plan{steps=%d}", len(p.Steps)) }

// LogValue logs the number of steps only.
func (p Plan) LogValue() slog.Value { return slog.GroupValue(slog.Int("steps", len(p.Steps))) }

// Format prints the read's id and counts only.
func (in PlanInput) Format(f fmt.State, _ rune) {
	summary(f, "receipt.PlanInput{read=%s, rows=%d, proposals=%d, accept=%d, adds=%d}",
		in.ReadID, len(in.Rows), len(in.Proposals), len(in.Accept), len(in.Adds))
}

// LogValue logs the read's id and counts only.
func (in PlanInput) LogValue() slog.Value {
	return slog.GroupValue(slog.String("read", in.ReadID), slog.Int("rows", len(in.Rows)),
		slog.Int("proposals", len(in.Proposals)), slog.Int("accept", len(in.Accept)))
}
