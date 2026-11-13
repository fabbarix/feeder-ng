package receipt

import (
	"fmt"
	"math"
	"strings"
	"time"
)

// Propose turns a checked answer into the review (design §6, §7.1): proposals in section order (shop, date, price,
// weight, quantity, pack_size, name, add, missing), the notes and the totals. Pure. Proposal ids are "<kind>:<row>"
// (add: "add:<answer line>"), plus "shop" and "date".
func Propose(rows []Row, ans Answer, ctx Context) Result {
	byRow := make([][]int, len(rows))
	var addLines []int
	var discounts []Note
	for i, l := range ans.Lines {
		switch {
		case l.Row >= 0 && l.Row < len(rows):
			byRow[l.Row] = append(byRow[l.Row], i)
		case l.Row == -1:
			if l.PriceCents != nil && *l.PriceCents < 0 {
				discounts = append(discounts, Note{Code: NoteDiscount, Text: l.Text, Cents: intPtr(*l.PriceCents)})
			} else if isAdd(l) {
				addLines = append(addLines, i)
			}
		}
	}

	var res Result
	var shop, date, price, weight, qty, pack, name, add, missing []Proposal
	if p, note := shopCheck(ans, ctx); p != nil {
		shop = append(shop, *p)
	} else if note != nil {
		res.Notes = append(res.Notes, *note)
	}
	if p, ok := dateProposal(ans, ctx); ok {
		date = append(date, p)
	}

	for r, idx := range byRow {
		row := rows[r]
		if len(idx) == 0 {
			missing = append(missing, Proposal{ID: pid("missing", r), Kind: KindMissing, Row: r, Line: -1, Before: Value{Name: row.Product}})
			continue
		}
		lines := make([]Line, 0, len(idx))
		for _, i := range idx {
			lines = append(lines, ans.Lines[i])
		}
		text := lines[0].Text
		if byWeight(row, lines) {
			if p, ok := weighedPriceProposal(r, row, lines, text); ok {
				price = append(price, p)
			}
			if p, ok := weightProposal(r, row, lines, text); ok {
				weight = append(weight, p)
			}
		} else {
			if p, ok := packPriceProposal(r, row, lines, text); ok {
				price = append(price, p)
			}
			if p, ok := quantityProposal(r, row, lines, text); ok {
				qty = append(qty, p)
			}
			if p, ok := packSizeProposal(r, row, lines, text); ok {
				pack = append(pack, p)
			}
		}
		if p, ok := nameProposal(r, row, lines, text); ok {
			name = append(name, p)
		}
	}

	for _, i := range addLines {
		add = append(add, addProposal(i, ans.Lines[i]))
	}

	res.Proposals = concat(shop, date, price, weight, qty, pack, name, add, missing)
	res.Notes = append(res.Notes, discounts...)

	scanned := 0
	for _, row := range rows {
		for _, e := range row.Events {
			if e.PriceCents >= 0 {
				scanned += e.PriceCents
			}
		}
	}
	projected := 0
	for _, l := range ans.Lines {
		if l.PriceCents != nil {
			projected += *l.PriceCents
		}
	}
	res.Totals = Totals{ScannedCents: scanned, ProjectedCents: projected, Lines: len(ans.Lines)}
	if ans.TotalCents != nil {
		res.Totals.ReceiptCents = intPtr(*ans.TotalCents)
		if diff := *ans.TotalCents - projected; diff != 0 {
			res.Notes = append(res.Notes, Note{Code: NoteTotalDiffers, Cents: intPtr(diff)})
		}
	}
	return res
}

func concat(sections ...[]Proposal) []Proposal {
	var out []Proposal
	for _, s := range sections {
		out = append(out, s...)
	}
	return out
}

func pid(kind string, n int) string { return fmt.Sprintf("%s:%d", kind, n) }

// isAdd is an unmatched line that bought something at a price.
func isAdd(l Line) bool {
	return l.PriceCents != nil && *l.PriceCents >= 0 && (l.Count > 0 || l.Grams > 0)
}

// lineCount is the packs a line bought: its count, or one pack when it printed a price and no count.
func lineCount(l Line) int {
	if l.Count > 0 {
		return l.Count
	}
	if l.PriceCents != nil {
		return 1
	}
	return 0
}

// roundDiv divides with round half up; num and den are non-negative, den is positive.
func roundDiv(num, den int) int {
	return (2*num + den) / (2 * den)
}

// packPrice is the per-pack Price: the unit price when every line printed the same one, else round(Σ price / Σ count).
func packPrice(lines []Line) (int, bool) {
	unit, agree := 0, true
	for i, l := range lines {
		if l.UnitPriceCents == nil {
			agree = false
			break
		}
		if i == 0 {
			unit = *l.UnitPriceCents
		} else if *l.UnitPriceCents != unit {
			agree = false
			break
		}
	}
	if agree && len(lines) > 0 {
		return unit, true
	}
	sum, n := 0, 0
	for _, l := range lines {
		if l.PriceCents == nil {
			continue
		}
		sum += *l.PriceCents
		n += lineCount(l)
	}
	if n == 0 {
		return 0, false
	}
	return roundDiv(sum, n), true
}

func packPriceProposal(r int, row Row, lines []Line, text string) (Proposal, bool) {
	after, ok := packPrice(lines)
	if !ok {
		return Proposal{}, false
	}
	var before *int
	if row.PriceCents >= 0 {
		before = intPtr(row.PriceCents)
	}
	if before != nil && *before == after {
		return Proposal{}, false
	}
	return Proposal{ID: pid("price", r), Kind: KindPrice, Row: r, Line: -1, Text: text, Checked: true,
		Before: Value{PriceCents: before}, After: Value{PriceCents: intPtr(after)}}, true
}

// weighedPerKg is the price per kg: the printed one when every line that has one agrees, else Σ price × 1000 / Σ grams.
func weighedPerKg(lines []Line) (int, bool) {
	val, have, agree := 0, false, true
	for _, l := range lines {
		if l.PerKgCents == nil {
			continue
		}
		if !have {
			val, have = *l.PerKgCents, true
		} else if val != *l.PerKgCents {
			agree = false
		}
	}
	if have && agree {
		return val, true
	}
	sumPrice, sumGrams := 0, 0
	for _, l := range lines {
		if l.PriceCents != nil && l.Grams > 0 {
			sumPrice += *l.PriceCents
			sumGrams += l.Grams
		}
	}
	if sumGrams == 0 {
		return 0, false
	}
	return roundDiv(sumPrice*1000, sumGrams), true
}

// byWeight: the row is read by weight, a weighed row or a Product in g whose lines give grams (design §6, weight).
func byWeight(row Row, lines []Line) bool {
	if row.Weighed {
		return true
	}
	if row.BaseUnit != "g" {
		return false
	}
	for _, l := range lines {
		if l.Grams > 0 {
			return true
		}
	}
	return false
}

// rowPerKg is the row's current price per kg: its stored per-kg price, else a weighed row's total over its quantity,
// else a pack row's per-pack Price over its pack size.
func rowPerKg(row Row) (int, bool) {
	if row.PerKgCents >= 0 {
		return row.PerKgCents, true
	}
	if row.PriceCents < 0 {
		return 0, false
	}
	den := row.PackSize
	if row.Weighed {
		den = int(math.Round(row.Quantity))
	}
	if den <= 0 {
		return 0, false
	}
	return roundDiv(row.PriceCents*1000, den), true
}

// rowTotal is what the row costs now: a weighed row's Price is already its total; a pack row's is per pack.
func rowTotal(row Row) (int, bool) {
	if row.PriceCents < 0 {
		return 0, false
	}
	if row.Weighed {
		return row.PriceCents, true
	}
	return row.PriceCents * row.Scans, true
}

func weighedPriceProposal(r int, row Row, lines []Line, text string) (Proposal, bool) {
	after, ok := weighedPerKg(lines)
	if !ok {
		return Proposal{}, false
	}
	before, haveBefore := rowPerKg(row)
	if haveBefore && before == after {
		return Proposal{}, false
	}
	var beforePtr *int
	if haveBefore {
		beforePtr = intPtr(before)
	}
	return Proposal{ID: pid("price", r), Kind: KindPrice, Row: r, Line: -1, Text: text, Checked: true,
		Before: Value{PriceCents: beforePtr, PerKg: true}, After: Value{PriceCents: intPtr(after), PerKg: true}}, true
}

// lineTotal is the sum of the lines' prices when every line has one.
func lineTotal(lines []Line) (int, bool) {
	sum := 0
	for _, l := range lines {
		if l.PriceCents == nil {
			return 0, false
		}
		sum += *l.PriceCents
	}
	return sum, true
}

// weightProposal: Σ grams differs from the scanned quantity by more than 1 % and more than 2 g. The new Price is the
// lines' total, else the printed per kg, else the row's own per kg, at the new weight.
func weightProposal(r int, row Row, lines []Line, text string) (Proposal, bool) {
	grams := 0
	for _, l := range lines {
		grams += l.Grams
	}
	if grams <= 0 {
		return Proposal{}, false
	}
	cur := row.Quantity
	if math.Abs(float64(grams)-cur) <= math.Max(0.01*cur, 2) {
		return Proposal{}, false
	}
	after := Value{Grams: intPtr(grams)}
	if total, ok := lineTotal(lines); ok {
		after.PriceCents = intPtr(total)
	} else if pk, ok := weighedPerKg(lines); ok {
		after.PriceCents = intPtr(roundDiv(pk*grams, 1000))
	} else if pk, ok := rowPerKg(row); ok {
		after.PriceCents = intPtr(roundDiv(pk*grams, 1000))
	}
	before := Value{Grams: intPtr(int(math.Round(cur)))}
	if total, ok := rowTotal(row); ok {
		before.PriceCents = intPtr(total)
	}
	return Proposal{ID: pid("weight", r), Kind: KindWeight, Row: r, Line: -1, Text: text, Checked: true,
		Before: before, After: after}, true
}

func quantityProposal(r int, row Row, lines []Line, text string) (Proposal, bool) {
	total := 0
	for _, l := range lines {
		total += lineCount(l)
	}
	if total == 0 || total == row.Scans {
		return Proposal{}, false
	}
	return Proposal{ID: pid("quantity", r), Kind: KindQuantity, Row: r, Line: -1, Text: text, Checked: true,
		Before: Value{Count: intPtr(row.Scans)}, After: Value{Count: intPtr(total)}}, true
}

func packSizeProposal(r int, row Row, lines []Line, text string) (Proposal, bool) {
	size := 0
	for _, l := range lines {
		if l.PackSize > 0 {
			size = l.PackSize
			break
		}
	}
	if size == 0 || size == row.PackSize {
		return Proposal{}, false
	}
	return Proposal{ID: pid("pack_size", r), Kind: KindPackSize, Row: r, Line: -1, Text: text,
		Before: Value{PackSize: intPtr(row.PackSize), PackUnit: row.BaseUnit},
		After:  Value{PackSize: intPtr(size), PackUnit: row.BaseUnit}}, true
}

func normName(s string) string {
	return strings.ToLower(strings.Join(strings.Fields(s), " "))
}

func nameProposal(r int, row Row, lines []Line, text string) (Proposal, bool) {
	nm := ""
	for _, l := range lines {
		if strings.TrimSpace(l.Name) != "" {
			nm = strings.TrimSpace(l.Name)
			break
		}
	}
	if nm == "" || normName(nm) == normName(row.Product) {
		return Proposal{}, false
	}
	return Proposal{ID: pid("name", r), Kind: KindName, Row: r, Line: -1, Text: text,
		Before: Value{Name: row.Product}, After: Value{Name: nm}}, true
}

func addProposal(i int, l Line) Proposal {
	name := l.Name
	if name == "" {
		name = l.Text
	}
	after := Value{Name: name, PriceCents: intPtr(*l.PriceCents), PackUnit: l.PackUnit}
	if l.Count > 0 {
		after.Count = intPtr(l.Count)
	}
	if l.Grams > 0 {
		after.Grams = intPtr(l.Grams)
	}
	if l.PackSize > 0 {
		after.PackSize = intPtr(l.PackSize)
	}
	return Proposal{ID: pid("add", i), Kind: KindAdd, Row: -1, Line: i, Text: l.Text, NeedsInput: true, After: after}
}

// shopCheck proposes the receipt's Shop when its name matches exactly one other saved Shop. A name that matches no
// saved Shop is a note only.
func shopCheck(ans Answer, ctx Context) (*Proposal, *Note) {
	printed := strings.TrimSpace(ans.ShopName)
	if printed == "" {
		return nil, nil
	}
	key := normName(printed)
	cands := append([]Shop(nil), ctx.Shops...)
	sessionListed := false
	for _, s := range cands {
		if s.ID == ctx.SessionShop.ID {
			sessionListed = true
		}
	}
	if !sessionListed {
		cands = append(cands, ctx.SessionShop)
	}
	var matches []Shop
	for _, s := range cands {
		if nameMatches(key, normName(s.Name)) {
			matches = append(matches, s)
		}
	}
	switch {
	case len(matches) == 0:
		return nil, &Note{Code: NoteShopUnknown, Text: printed}
	case len(matches) == 1 && matches[0].ID != ctx.SessionShop.ID:
		return &Proposal{ID: "shop", Kind: KindShop, Row: -1, Line: -1,
			Before: Value{Shop: ctx.SessionShop.Name, ShopID: ctx.SessionShop.ID},
			After:  Value{Shop: matches[0].Name, ShopID: matches[0].ID}}, nil
	}
	return nil, nil
}

// nameMatches: the printed name is the saved name, or starts with it as a word ("Esselunga S.p.A.").
func nameMatches(printed, saved string) bool {
	return saved != "" && (printed == saved || strings.HasPrefix(printed, saved+" "))
}

const sevenDays = 7

// dateProposal: the receipt's date differs from the session's and is within the last seven days.
func dateProposal(ans Answer, ctx Context) (Proposal, bool) {
	if ans.Date == "" || ans.Date == ctx.SessionDate {
		return Proposal{}, false
	}
	d, err1 := time.Parse(dateLayout, ans.Date)
	today, err2 := time.Parse(dateLayout, ctx.Today)
	if err1 != nil || err2 != nil {
		return Proposal{}, false
	}
	days := today.Sub(d).Hours() / 24
	if days < 0 || days > sevenDays {
		return Proposal{}, false
	}
	return Proposal{ID: "date", Kind: KindDate, Row: -1, Line: -1,
		Before: Value{Date: ctx.SessionDate}, After: Value{Date: ans.Date}}, true
}
