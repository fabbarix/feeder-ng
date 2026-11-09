package planner

import (
	"math"
	"sort"
	"time"
)

// eps is the tolerance for portion and quantity comparisons.
const eps = 1e-9

// noDay stands for "never goes off" and "never expires".
const noDay = math.MaxInt

const dateLayout = "2006-01-02"

// role says what the walk does with a slot.
type role int

const (
	roleEmpty           role = iota // the walk fills it
	rolePinned                      // Pinned: consumes, leaves a pending Leftover
	roleCooked                      // Cooked: history only (Stock already deducted)
	roleSkipped                     // skipped: no effect at all
	roleKept                        // a valid unpinned fresh Planned meal that Plan keeps
	rolePlannedLeftover             // a Planned meal served from a Leftover: checked at walk time
)

// fresh is one fresh cook (for cool-down, recency and Variety Rules). seq is the
// walk index of the slot, -1 for dates from before the horizon.
type fresh struct {
	day    int
	seq    int
	recipe RecipeID
}

// pending is a Leftover waiting to be served. Actual Leftovers come from
// Input.Leftovers; planned ones are the extra portions of a fresh meal at from.
type pending struct {
	actual   bool
	id       int64
	from     SlotKey
	seq      int
	recipe   RecipeID
	portions float64
	cookedOn int
	useBy    int
}

// lot is a projected Stock lot. Planned lots are pack remainders of planned
// purchases (the Ingredient Overlap source).
type projLot struct {
	id        int64
	ing       IngredientID
	qty       float64
	purchased int
	goesOff   int
	planned   bool
}

// state is one planning walk over the slots, in chronological order.
type state struct {
	in        Input
	cfg       Config
	w         Weights
	regen     bool
	swapIdx   int // index of the Swap target, -1 otherwise
	recipes   map[RecipeID]Recipe
	recipeIDs []RecipeID // ascending
	slots     []Slot     // sorted by (At, MealSlotID)
	days      []int
	roles     []role
	history   []fresh
	pend      []*pending
	lots      []*projLot
	nextLot   int64
	purchases map[IngredientID]*Purchase

	placements []Placement
	unfilled   []Unfilled
	kept       []SlotKey
}

// newState validates and prepares the walk. A non-nil target makes it a Swap
// walk: the target slot is treated as empty and must exist.
func newState(in Input, regen bool, target *SlotKey) (*state, error) {
	seen := make(map[SlotKey]bool, len(in.Slots))
	for _, s := range in.Slots {
		if seen[s.Key] {
			return nil, ErrDuplicateSlot
		}
		seen[s.Key] = true
	}
	slots := append([]Slot(nil), in.Slots...)
	sort.SliceStable(slots, func(a, b int) bool {
		x, y := slots[a], slots[b]
		if !x.At.Equal(y.At) {
			return x.At.Before(y.At)
		}
		if x.Key.MealSlotID != y.Key.MealSlotID {
			return x.Key.MealSlotID < y.Key.MealSlotID
		}
		return x.Key.Date < y.Key.Date
	})

	st := &state{
		in:        in,
		cfg:       in.Config,
		regen:     regen,
		swapIdx:   -1,
		recipes:   make(map[RecipeID]Recipe, len(in.Recipes)),
		slots:     slots,
		nextLot:   1 << 40,
		purchases: map[IngredientID]*Purchase{},
	}
	if in.Weights != nil {
		st.w = *in.Weights
	} else {
		st.w = WeightsFor(in.Style)
	}
	for _, r := range in.Recipes {
		st.recipes[r.ID] = r
	}
	for id := range st.recipes {
		st.recipeIDs = append(st.recipeIDs, id)
	}
	sort.Slice(st.recipeIDs, func(a, b int) bool { return st.recipeIDs[a] < st.recipeIDs[b] })

	if target != nil {
		for i, s := range slots {
			if s.Key == *target {
				st.swapIdx = i
				break
			}
		}
		if st.swapIdx < 0 {
			return nil, ErrUnknownSlot
		}
	}

	st.days = make([]int, len(slots))
	st.roles = make([]role, len(slots))
	for i, s := range slots {
		st.days[i] = slotDayOf(s)
	}
	for i := range slots {
		st.roles[i] = st.classify(i)
	}

	// Pre-seed the cool-down, recency and Variety history: the last dates from
	// before the horizon, and every fresh cook already fixed or kept, including
	// those later than the slot being planned.
	for rid, d := range in.LastPlanned {
		if day, ok := dayOf(d); ok {
			st.history = append(st.history, fresh{day: day, seq: -1, recipe: rid})
		}
	}
	for i, s := range slots {
		switch st.roles[i] {
		case rolePinned, roleCooked, roleKept:
			if s.Existing.From == nil {
				st.history = append(st.history, fresh{day: st.days[i], seq: i, recipe: s.Existing.RecipeID})
			}
		}
	}

	for _, l := range in.Lots {
		if l.Quantity <= eps {
			continue
		}
		st.lots = append(st.lots, &projLot{
			id:        l.ID,
			ing:       l.IngredientID,
			qty:       l.Quantity,
			purchased: dayOr(l.Purchased, 0),
			goesOff:   dayOr(l.GoesOff, noDay),
		})
	}
	for _, lf := range in.Leftovers {
		if lf.Portions <= eps {
			continue
		}
		st.pend = append(st.pend, &pending{
			actual:   true,
			id:       lf.ID,
			from:     lf.FromSlot,
			seq:      -1,
			recipe:   lf.RecipeID,
			portions: lf.Portions,
			cookedOn: dayOr(lf.CookedOn, 0),
			useBy:    dayOr(lf.UseBy, noDay),
		})
	}
	return st, nil
}

// classify decides the role of slot i from its existing meal.
func (st *state) classify(i int) role {
	if i == st.swapIdx {
		return roleEmpty
	}
	m := st.slots[i].Existing
	if m == nil {
		return roleEmpty
	}
	switch m.State {
	case MealPinned:
		return rolePinned
	case MealCooked:
		return roleCooked
	case MealSkipped:
		return roleSkipped
	}
	if st.regen {
		return roleEmpty
	}
	if m.From != nil {
		return rolePlannedLeftover
	}
	if st.validPlannedFresh(i) {
		return roleKept
	}
	return roleEmpty
}

func (st *state) validPlannedFresh(i int) bool {
	s := st.slots[i]
	r, ok := st.recipes[s.Existing.RecipeID]
	if !ok || r.Archived || r.Yield <= 0 {
		return false
	}
	if st.excludes(s.Attendance, r, true) {
		return false
	}
	return s.Existing.Batches*r.Yield >= PortionsNeeded(s.Attendance)-eps
}

// walk processes slots [0, upto) in order.
func (st *state) walk(upto int) {
	for i := 0; i < upto; i++ {
		st.step(i)
	}
}

func (st *state) step(i int) {
	s := st.slots[i]
	switch st.roles[i] {
	case roleEmpty:
		st.fill(i)
	case roleCooked, roleSkipped:
		// Nothing to do: Stock was deducted at Cooked (ADR 0003); skipped has no effect.
	case rolePinned:
		st.applyFixed(i, *s.Existing)
	case roleKept:
		st.kept = append(st.kept, s.Key)
		st.applyFixed(i, *s.Existing)
	case rolePlannedLeftover:
		if st.leftoverValid(i) {
			st.kept = append(st.kept, s.Key)
			st.consumeLeftover(*s.Existing.From, PortionsNeeded(s.Attendance))
		} else {
			st.roles[i] = roleEmpty
			st.fill(i)
		}
	}
}

// applyFixed applies a Pinned or kept fresh meal, or one served from a Leftover:
// it consumes Stock (or its source) and leaves its extra portions pending.
func (st *state) applyFixed(i int, m ExistingMeal) {
	s := st.slots[i]
	portions := PortionsNeeded(s.Attendance)
	if m.From != nil {
		st.consumeLeftover(*m.From, portions)
		return
	}
	r, ok := st.recipes[m.RecipeID]
	if !ok {
		return
	}
	day := st.days[i]
	st.consumeNeeds(r, m.Batches, day)
	if extra := m.Batches*r.Yield - portions; extra > eps {
		st.addPending(i, r, extra, day)
	}
}

func (st *state) addPending(i int, r Recipe, portions float64, day int) {
	st.pend = append(st.pend, &pending{
		from:     st.slots[i].Key,
		seq:      i,
		recipe:   r.ID,
		portions: portions,
		cookedOn: day,
		useBy:    day + st.useByDays(r),
	})
}

// findSource returns the pending Leftover a meal is served from, if it still exists.
// A LeftoverID names an actual Leftover; otherwise FromSlot matches the source
// slot of an actual Leftover (its recorded FromSlot) or of a planned extra.
func (st *state) findSource(src LeftoverSource) *pending {
	for _, p := range st.pend {
		if src.LeftoverID != 0 {
			if p.actual && p.id == src.LeftoverID {
				return p
			}
		} else if src.FromSlot != (SlotKey{}) && p.from == src.FromSlot {
			return p
		}
	}
	return nil
}

// consumeLeftover takes up to portions from the source Leftover (clamped at 0).
func (st *state) consumeLeftover(src LeftoverSource, portions float64) {
	p := st.findSource(src)
	if p == nil {
		return
	}
	p.portions -= math.Min(p.portions, portions)
	st.prunePending()
}

// leftoverValid: a Planned meal served from a Leftover is still valid when its
// source holds the same Recipe, covers the portions, is not past its Use-by,
// and nobody attending excludes its Recipe.
func (st *state) leftoverValid(i int) bool {
	s := st.slots[i]
	portions := PortionsNeeded(s.Attendance)
	p := st.findSource(*s.Existing.From)
	if p == nil || p.portions < portions-eps || st.days[i] > p.useBy {
		return false
	}
	if p.recipe != s.Existing.RecipeID {
		return false
	}
	r, ok := st.recipes[p.recipe]
	return ok && !st.excludes(s.Attendance, r, true)
}

func (st *state) prunePending() {
	kept := st.pend[:0]
	for _, p := range st.pend {
		if p.portions > eps {
			kept = append(kept, p)
		}
	}
	st.pend = kept
}

// fill plans an empty slot: a pending Leftover first, otherwise a fresh Recipe.
func (st *state) fill(i int) {
	s := st.slots[i]
	portions := PortionsNeeded(s.Attendance)
	if portions <= eps {
		st.unfilled = append(st.unfilled, Unfilled{Key: s.Key, Reason: UnfilledNoAttendance})
		return
	}
	if st.takeLeftover(i, portions) {
		return
	}
	cands, elim := st.evaluate(i, portions, evalOpts{})
	if len(cands) == 0 {
		st.unfilled = append(st.unfilled, Unfilled{
			Key:             s.Key,
			Reason:          UnfilledNoCandidates,
			SlotRuleClaimed: len(s.Rules) > 0,
			Eliminated:      elim,
		})
		return
	}
	best := cands[0]
	for _, c := range cands[1:] {
		if better(c, best) {
			best = c
		}
	}
	var rule *Why
	if sr, ok := matchRule(s.Rules, best.recipe); ok {
		w := ruleWhy(sr)
		rule = &w
	}
	st.placements = append(st.placements, st.placeFresh(i, best, portions, rule))
}

// takeLeftover serves slot i from the pending Leftover with the soonest Use-by
// (ties: actual before planned, then lowest id / earliest source), if one fits.
func (st *state) takeLeftover(i int, portions float64) bool {
	s := st.slots[i]
	day := st.days[i]
	best := -1
	var bestRule SlotRule
	var bestMatched bool
	for k, p := range st.pend {
		if p.portions < portions-eps || day > p.useBy {
			continue
		}
		r, ok := st.recipes[p.recipe]
		if !ok {
			continue
		}
		rule, matched := matchRule(s.Rules, r)
		if len(s.Rules) > 0 && !matched {
			continue
		}
		if st.excludes(s.Attendance, r, true) {
			continue
		}
		if best < 0 || pendingBefore(p, st.pend[best]) {
			best, bestRule, bestMatched = k, rule, matched
		}
	}
	if best < 0 {
		return false
	}
	p := st.pend[best]
	p.portions -= portions
	st.prunePending()

	from := LeftoverSource{}
	if p.actual {
		from.LeftoverID = p.id
	} else {
		from.FromSlot = p.from
	}
	why := []Why{{Code: ReasonLeftover, Date: dateOf(p.cookedOn), RecipeID: p.recipe}}
	if bestMatched {
		why = append(why, ruleWhy(bestRule))
	}
	st.placements = append(st.placements, Placement{
		Key:      s.Key,
		Source:   SourceLeftover,
		RecipeID: p.recipe,
		Portions: portions,
		From:     &from,
		Why:      why,
	})
	return true
}

func pendingBefore(a, b *pending) bool {
	if a.useBy != b.useBy {
		return a.useBy < b.useBy
	}
	if a.actual != b.actual {
		return a.actual
	}
	if a.actual {
		return a.id < b.id
	}
	return a.seq < b.seq
}

// clone copies the mutable parts of the walk so a preview cannot change st.
func (st *state) clone() *state {
	c := *st
	c.lots = make([]*projLot, len(st.lots))
	for k, l := range st.lots {
		cp := *l
		c.lots[k] = &cp
	}
	c.pend = make([]*pending, len(st.pend))
	for k, p := range st.pend {
		cp := *p
		c.pend[k] = &cp
	}
	c.history = append([]fresh(nil), st.history...)
	c.purchases = map[IngredientID]*Purchase{}
	c.placements, c.unfilled, c.kept = nil, nil, nil
	return &c
}

// placeFresh cooks breakdown b in slot i: it deducts Stock, records the
// purchases, leaves the extra portions pending and adds the fresh cook to the
// history. The caller appends the returned Placement.
func (st *state) placeFresh(i int, b breakdown, portions float64, rule *Why) Placement {
	s := st.slots[i]
	day := st.days[i]
	r := b.recipe
	pl := Placement{
		Key:      s.Key,
		Source:   SourceRecipe,
		RecipeID: r.ID,
		Batches:  b.batches,
		Portions: portions,
		Score:    b.total,
		Terms:    b.terms,
		Why:      buildWhy(b.chips, rule),
	}
	pl.Purchases = st.consumeNeeds(r, float64(b.batches), day)
	if extra := float64(b.batches)*r.Yield - portions; extra > eps {
		useBy := day + st.useByDays(r)
		pl.NewLeftover = &NewLeftover{Portions: extra, UseBy: dateOf(useBy)}
		st.addPending(i, r, extra, day)
	}
	st.history = append(st.history, fresh{day: day, seq: i, recipe: r.ID})
	return pl
}

func (st *state) result() Result {
	ids := make([]IngredientID, 0, len(st.purchases))
	for id := range st.purchases {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(a, b int) bool { return ids[a] < ids[b] })
	var purchases []Purchase
	for _, id := range ids {
		purchases = append(purchases, *st.purchases[id])
	}
	return Result{Placements: st.placements, Unfilled: st.unfilled, Kept: st.kept, Purchases: purchases}
}

func (st *state) useByDays(r Recipe) int {
	if r.UseByDays != nil {
		return *r.UseByDays
	}
	return st.cfg.DefaultUseByDays
}

func (st *state) cooldownDays(r Recipe) int {
	if r.CooldownDays != nil {
		return *r.CooldownDays
	}
	return st.cfg.DefaultCooldownDays
}

// --- day helpers -----------------------------------------------------------

// dayOf is the day number (days since 1970-01-01) of a Date.
func dayOf(d Date) (int, bool) {
	t, err := time.Parse(dateLayout, string(d))
	if err != nil {
		return 0, false
	}
	return int(t.Unix() / 86400), true
}

func dayOr(d Date, fallback int) int {
	if n, ok := dayOf(d); ok {
		return n
	}
	return fallback
}

func dateOf(day int) Date {
	return Date(time.Unix(int64(day)*86400, 0).UTC().Format(dateLayout))
}

func slotDayOf(s Slot) int {
	if n, ok := dayOf(s.Key.Date); ok {
		return n
	}
	y, m, d := s.At.Date()
	return int(time.Date(y, m, d, 0, 0, 0, 0, time.UTC).Unix() / 86400)
}
