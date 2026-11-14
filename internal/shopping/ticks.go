package shopping

import (
	"math"
	"sort"
	"strings"
	"time"

	"github.com/fabbarix/feeder-ng/internal/stock"
)

// Addition is one tick of a Line that put a Stock Lot (or none) into Stock (B9-23, ADR 0024). A Line ticked twice has two.
// A Scan's tick is an addition with By "scan" and the scanned Lot.
type Addition struct {
	ClientUUID string // "" for a tick from before beta.9
	UserID     int64  // 0 = unknown
	Who        string // the User's display name; "" unknown. Filled by the service, never stored
	By         string // "hand" | "scan"
	LotID      int64  // 0 = no Stock Lot (Tick without adding, or taken back and not restored)
	// Quantity is what the addition put into Stock. +Inf for a tick from before migration 1560 that kept its Stock Lot
	// but not the quantity: Take back then takes what is left of the Lot, and the API shows it as unknown (null).
	Quantity float64
	Covers   float64   // the Line quantity the tick covered when it was made (Q0)
	TickedAt time.Time // when the User ticked (the phone's time for a queued tick)
	SyncedAt time.Time // zero when ticked online; the sync time of a queued tick
}

// PackPrice is a pack Price: cents, the date it was recorded on and the Shop it belongs to.
type PackPrice struct {
	Cents  int
	Date   stock.Date
	ShopID int64
}

// DeltaLine is a Line that a plan change added to the Shopping List or removed from it.
type DeltaLine struct {
	IngredientID   int64
	Name, BaseUnit string
	Quantity       float64 // the Line's quantity still to buy (Need for a ticked Line)
}

// Delta is what a plan change did to the Shopping List (PC-01 `shoppingDelta {added, removed}`).
type Delta struct{ Added, Removed []DeltaLine }

// Diff compares the Shopping List before and after a plan change: the Lines (Ingredient Lines, ticked or not) that are in
// one and not the other, each ordered by name (ignoring case), then id. A Line whose amount changed, or that got ticked,
// is neither; extras and Not needed Lines are not plan Lines and are ignored.
func Diff(before, after List) Delta {
	in := func(l List) map[int64]Line {
		m := make(map[int64]Line, len(l.Lines))
		for _, ln := range l.Lines {
			m[ln.IngredientID] = ln
		}
		return m
	}
	b, a := in(before), in(after)
	var d Delta
	for _, l := range after.Lines {
		if _, ok := b[l.IngredientID]; !ok {
			d.Added = append(d.Added, deltaLine(l))
		}
	}
	for _, l := range before.Lines {
		if _, ok := a[l.IngredientID]; !ok {
			d.Removed = append(d.Removed, deltaLine(l))
		}
	}
	sortDelta(d.Added)
	sortDelta(d.Removed)
	return d
}

func deltaLine(l Line) DeltaLine {
	q := l.Quantity
	if l.Ticked {
		q = l.Need
	}
	return DeltaLine{IngredientID: l.IngredientID, Name: l.Name, BaseUnit: l.BaseUnit, Quantity: q}
}

func sortDelta(ls []DeltaLine) {
	sort.SliceStable(ls, func(i, j int) bool {
		ni, nj := strings.ToLower(ls[i].Name), strings.ToLower(ls[j].Name)
		if ni != nj {
			return ni < nj
		}
		return ls[i].IngredientID < ls[j].IngredientID
	})
}

// moreSinceTick is what reappears in To get after a tick (SSP-02, ADR 0023). q0 is what the tick covered, added what it
// put into Stock and q2 the Line's quantity now (the need less all Stock, the tick's included). What the tick left
// uncovered, max(0, q0 - added), is still the tick's; anything of q2 past it is more. Float dust (<= eps) is none.
func moreSinceTick(q0, added, q2 float64) float64 {
	uncovered := math.Max(0, q0-added)
	more := q2 - uncovered
	if more <= eps || math.IsNaN(more) {
		return 0
	}
	return more
}

// CoversOfMore is the covers of a tick of a ticked Line's More row (SSP-02, ADR 0023): the More, stacked on what the
// tick already covered (what it covered or what it added, whichever is more). A tick of the More row therefore leaves no
// More whatever it adds: with Stock it bought the difference, without (Tick without adding) the User has it covered.
// An addition to a ticked Line with no More (RES 2: a second shopper's tick of the same need) keeps the covers it has.
func CoversOfMore(t Tick, more float64) float64 {
	return math.Max(t.Needed, t.addedForCover()) + math.Max(0, more)
}

// AddedOf is the sum of what the additions put into Stock, always finite: an addition that does not know its quantity
// (+Inf, a tick from before migration 1560) is left out of the sum and reported by unknown instead.
func AddedOf(as []Addition) (sum float64, unknown bool) {
	for _, a := range as {
		if math.IsInf(a.Quantity, 0) || math.IsNaN(a.Quantity) {
			unknown = true
			continue
		}
		sum += a.Quantity
	}
	return sum, unknown
}

// addedForCover is what the tick counts as added when it works out its More: Added, and for an addition that does not
// know its quantity, what it covered (a tick from before migration 1560 put the Line's need into Stock).
func (t Tick) addedForCover() float64 {
	added := t.Added
	for _, a := range t.Additions {
		if math.IsInf(a.Quantity, 0) || math.IsNaN(a.Quantity) {
			added += a.Covers
		}
	}
	return added
}

// ExtraTick is the tick of a ticked extra: its additions (none for a text extra), the first one's By ("hand" without one).
func ExtraTick(e Extra) *Tick {
	if !e.Ticked {
		return nil
	}
	t := &Tick{IngredientID: e.IngredientID, Needed: e.Quantity, By: "hand", Additions: e.Additions}
	t.Added, t.AddedUnknown = AddedOf(e.Additions)
	if len(e.Additions) > 0 {
		t.By = e.Additions[0].By
	}
	return t
}
