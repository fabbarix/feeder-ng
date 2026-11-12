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

// role says what the walk does with a cell.
type role int

const (
	roleEmpty           role = iota // the walk fills it
	rolePinned                      // Pinned: consumes, leaves a pending Leftover
	roleCooked                      // Cooked: history only (Stock already deducted)
	roleSkipped                     // skipped: no effect at all
	roleKept                        // a valid unpinned fresh Planned meal that Plan keeps
	rolePlannedLeftover             // a Planned meal served from a Leftover: checked at walk time
	roleCovered                     // a Whole meal in the main Course covers it (spec 7.2 step 0)
	roleNotServed                   // every attendee opts out of this Course (spec 7.2 step 0b)
	roleNotServedDate               // the Meal Slot is Not served on this date (ADR 0014): left empty, no reason
)

// fresh is one fresh cook (for cool-down, recency and Variety Rules). seq is the
// walk index of the cell, -1 for dates from before the horizon.
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

// projLot is a projected Stock lot. Planned lots are pack remainders of planned
// purchases (the Ingredient Overlap source).
type projLot struct {
	id        int64
	ing       IngredientID
	qty       float64
	purchased int
	goesOff   int
	planned   bool
}

// state is one planning walk over the cells, in walk order.
type state struct {
	in        Input
	cfg       Config
	w         Weights
	regen     bool
	swapIdx   int // index of the Swap target, -1 otherwise
	recipes   map[RecipeID]Recipe
	recipeIDs []RecipeID // ascending
	slots     []Slot     // in walk order (cellBefore)
	days      []int
	roles     []role
	history   []fresh
	pend      []*pending
	lots      []*projLot
	nextLot   int64
	purchases map[IngredientID]*Purchase

	reservations []reservation // Slot Rule reservations (reserve.go)

	// placed is the Recipe each cell was planned with in this walk (fresh or from a Leftover).
	placed map[int]RecipeID
	// coveredBy is the main cell that covers a cell (-1 when none), preRole the role it had before.
	coveredBy []int
	preRole   []role

	placements   []Placement
	unfilled     []Unfilled
	kept         []SlotKey
	keptPortions map[SlotKey]float64
	notServed    []NotServed
	rechecks     []Recheck
	raised       []BatchRaise
}

// cellBefore is the walk order: chronological, then the Meal Slot, the date, the
// group (main Course, other required Courses, optional Courses), the Course's
// position in the slot, and the Course id. Every ordering ends on an id.
func cellBefore(x, y Slot) bool {
	if !x.At.Equal(y.At) {
		return x.At.Before(y.At)
	}
	if x.Key.MealSlotID != y.Key.MealSlotID {
		return x.Key.MealSlotID < y.Key.MealSlotID
	}
	if x.Key.Date != y.Key.Date {
		return x.Key.Date < y.Key.Date
	}
	if gx, gy := courseGroup(x), courseGroup(y); gx != gy {
		return gx < gy
	}
	if x.Position != y.Position {
		return x.Position < y.Position
	}
	return x.Key.CourseID < y.Key.CourseID
}

// courseGroup ranks a cell inside its Meal Slot on its date: main first, then the
// required Courses, then the optional ones.
func courseGroup(s Slot) int {
	switch {
	case s.Main:
		return 0
	case s.Optional:
		return 2
	default:
		return 1
	}
}

// newState validates and prepares the walk. A non-nil target makes it a Swap
// walk: the target cell is treated as empty and must exist.
func newState(in Input, regen bool, target *SlotKey) (*state, error) {
	seen := make(map[SlotKey]bool, len(in.Slots))
	for _, s := range in.Slots {
		if seen[s.Key] {
			return nil, ErrDuplicateSlot
		}
		seen[s.Key] = true
	}
	slots := append([]Slot(nil), in.Slots...)
	sort.SliceStable(slots, func(a, b int) bool { return cellBefore(slots[a], slots[b]) })

	st := &state{
		in:           in,
		cfg:          in.Config,
		regen:        regen,
		swapIdx:      -1,
		recipes:      make(map[RecipeID]Recipe, len(in.Recipes)),
		slots:        slots,
		nextLot:      1 << 40,
		purchases:    map[IngredientID]*Purchase{},
		placed:       map[int]RecipeID{},
		keptPortions: map[SlotKey]float64{},
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
	st.coveredBy = make([]int, len(slots))
	st.preRole = make([]role, len(slots))
	for i, s := range slots {
		st.days[i] = slotDayOf(s)
		st.coveredBy[i] = -1
	}
	for i := range slots {
		st.roles[i] = st.classify(i)
	}
	// Step 0, before the history: cells nobody eats are not served; a Whole meal
	// already in a main Course covers the rest of its Meal Slot.
	for i, s := range slots {
		// Guests eat every Course the slot serves, so a Course every Member opts out of is served for them (U3).
		if s.AllOptedOut && s.Guests == 0 && (st.roles[i] == roleEmpty || st.roles[i] == roleKept || st.roles[i] == rolePlannedLeftover) {
			st.roles[i] = roleNotServed
		}
	}
	st.dropDuplicateKept()
	// A Whole meal main that is already fixed or kept covers now; a Leftover-served one covers once it passes its check
	// at walk time (step).
	for i, s := range slots {
		if !s.Main || s.Existing == nil || !st.isWholeMeal(s.Existing.RecipeID) {
			continue
		}
		switch st.roles[i] {
		case rolePinned, roleCooked, roleSkipped, roleKept:
			st.coverGroup(i)
		}
	}

	// Pre-seed the cool-down, recency and Variety history: the last dates from
	// before the horizon, and every fresh cook already fixed or kept, including
	// those later than the cell being planned.
	for rid, d := range in.LastPlanned {
		if day, ok := dayOf(d); ok {
			st.history = append(st.history, fresh{day: day, seq: -1, recipe: rid})
		}
	}
	for i, s := range slots {
		switch st.roles[i] {
		case rolePinned, roleCooked:
			if s.Existing.From == nil {
				st.addHistory(i)
			}
		}
	}
	// Reservations are computed before the kept meals join the history; a kept
	// meal that falls inside one is replanned, the rest are history.
	st.computeReservations()
	st.dropBlockedKept()
	for i := range slots {
		if st.roles[i] == roleKept && slots[i].Existing.From == nil {
			st.addHistory(i)
		}
	}
	st.keepCheck()

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

func (st *state) isWholeMeal(id RecipeID) bool {
	r, ok := st.recipes[id]
	return ok && r.WholeMeal
}

// classify decides the role of cell i from its existing meal.
func (st *state) classify(i int) role {
	if i == st.swapIdx {
		return roleEmpty
	}
	m := st.slots[i].Existing
	if m == nil {
		if st.slots[i].NotServed {
			return roleNotServedDate
		}
		return roleEmpty
	}
	switch m.State {
	case MealCooked:
		return roleCooked
	case MealSkipped:
		return roleSkipped
	}
	// Not served drops the unresolved Planned Meal, Pinned ones too (ADR 0014); Cooked and Not cooked ones are history.
	if st.slots[i].NotServed {
		return roleNotServedDate
	}
	if m.State == MealPinned {
		return rolePinned
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
	if !ok || r.Archived || r.Yield <= 0 || !st.fitsCourse(i, r) {
		return false
	}
	if st.excludes(s.Attendance, r, true) {
		return false
	}
	// Batches that no longer cover the portions do not drop the meal: it is kept and raised (ADR 0014 point 6, raise).
	return true
}

// sameGroup: cells i and j are two Courses of one Meal Slot on one date.
func (st *state) sameGroup(i, j int) bool {
	a, b := st.slots[i].Key, st.slots[j].Key
	return a.Date == b.Date && a.MealSlotID == b.MealSlotID
}

// fitsCourse is Course fit (spec 7.2 step 2): a cell with Course 0 skips it.
func (st *state) fitsCourse(i int, r Recipe) bool {
	c := st.slots[i].Key.CourseID
	return c == 0 || containsCourse(r.CourseIDs, c)
}

// plannedInGroup reports whether Recipe id is already planned in another Course of
// cell i's Meal Slot on its date: a fixed, kept or Leftover-served meal, or one
// placed earlier in this walk.
func (st *state) plannedInGroup(i int, id RecipeID) bool {
	for j := range st.slots {
		if j == i || !st.sameGroup(i, j) {
			continue
		}
		if rid, ok := st.placed[j]; ok && rid == id {
			return true
		}
		switch st.roles[j] {
		case rolePinned, roleCooked, roleSkipped, roleKept, rolePlannedLeftover:
			if st.slots[j].Existing.RecipeID == id {
				return true
			}
		}
	}
	return false
}

// fixedBeside: another Course of cell i's Meal Slot holds a Pinned, Cooked or Skipped meal.
func (st *state) fixedBeside(i int) bool {
	for j := range st.slots {
		if j == i || !st.sameGroup(i, j) {
			continue
		}
		switch st.roles[j] {
		case rolePinned, roleCooked, roleSkipped:
			return true
		}
	}
	return false
}

// coverGroup covers the other Courses of main cell i's Meal Slot with its Whole
// meal: empty, kept and Leftover-served cells become roleCovered. A kept cell's
// fresh cook leaves the history. The covering is recorded so a dropped main can
// uncover them.
func (st *state) coverGroup(main int) {
	for j := range st.slots {
		if j == main || !st.sameGroup(main, j) {
			continue
		}
		switch st.roles[j] {
		case roleEmpty, roleKept, rolePlannedLeftover:
			if st.roles[j] == roleKept {
				st.dropHistory(j)
			}
			st.coveredBy[j] = main
			st.preRole[j] = st.roles[j]
			st.roles[j] = roleCovered
		}
	}
}

// uncover undoes the covering of the cells a main cell covered, once that main
// cell is dropped by the keep check. Restored kept cells join the history.
func (st *state) uncover(main int) {
	for _, j := range st.uncoverCells(main) {
		if st.roles[j] == roleKept {
			st.addHistory(j)
		}
	}
}

// uncoverCells restores the roles the cells main covered had before the covering,
// and returns them. The caller decides about the history of restored kept cells.
func (st *state) uncoverCells(main int) []int {
	var restored []int
	for j := range st.slots {
		if st.coveredBy[j] != main {
			continue
		}
		st.coveredBy[j] = -1
		st.roles[j] = st.preRole[j]
		restored = append(restored, j)
	}
	return restored
}

// dropDuplicateKept drops a kept fresh meal whose Recipe is already served by another Course of its slot and date
// that the walk settles first: a fixed meal, or an earlier kept or Leftover-served cell. The walk refills the cell.
func (st *state) dropDuplicateKept() {
	for i := range st.slots {
		if st.roles[i] == roleKept && st.servedElsewhere(i) {
			st.roles[i] = roleEmpty
		}
	}
}

// servedElsewhere: the Recipe of kept cell i is planned in another Course of its slot and date (see dropDuplicateKept).
func (st *state) servedElsewhere(i int) bool {
	id := st.slots[i].Existing.RecipeID
	for j := range st.slots {
		if j == i || !st.sameGroup(i, j) || st.slots[j].Existing == nil || st.slots[j].Existing.RecipeID != id {
			continue
		}
		switch st.roles[j] {
		case rolePinned, roleCooked, roleSkipped:
			return true
		case roleKept, rolePlannedLeftover:
			if j < i {
				return true
			}
		}
	}
	return false
}

// drop turns a kept or planned cell back into an empty one for the walk to fill.
func (st *state) drop(i int) {
	st.roles[i] = roleEmpty
	st.uncover(i)
}

func (st *state) addHistory(i int) {
	st.history = append(st.history, fresh{day: st.days[i], seq: i, recipe: st.slots[i].Existing.RecipeID})
}

func (st *state) dropHistory(i int) {
	kept := st.history[:0]
	for _, h := range st.history {
		if h.seq != i {
			kept = append(kept, h)
		}
	}
	st.history = kept
}

// keepCheck runs the keep check (spec 7.2 step 2b, ADR 0009 point 4) over the kept
// fresh Planned meals in walk order. Each is checked against the history without its
// own cook: kept as it is, kept relaxed with its chip, or dropped for the walk to refill.
func (st *state) keepCheck() {
	for i := range st.slots {
		if st.roles[i] != roleKept || st.slots[i].Existing.From != nil {
			continue
		}
		s := st.slots[i]
		r := st.recipes[s.Existing.RecipeID]
		st.dropHistory(i)
		if !st.breaks(i, r) {
			st.addHistory(i)
			st.rechecks = append(st.rechecks, Recheck{Key: s.Key})
			continue
		}
		strict, _, _, _ := st.evaluate(i, s.Portions(), evalOpts{})
		if len(strict) > 0 || s.Optional {
			st.drop(i)
			continue
		}
		chip := st.relaxedChip(i, r)
		st.addHistory(i)
		st.rechecks = append(st.rechecks, Recheck{Key: s.Key, Relaxed: true, Why: &chip})
	}
}

// walk processes cells [0, upto) in order.
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
		// Cooked: stock was deducted and a Leftover's portions were reduced at
		// Cooked time (ADR 0003), so Input.Leftovers already reflects them.
		// Skipped has no effect.
	case rolePinned:
		st.applyFixed(i, st.raise(i, *s.Existing))
	case roleKept:
		st.keep(i)
		st.applyFixed(i, st.raise(i, *s.Existing))
	case roleNotServedDate:
		st.notServed = append(st.notServed, NotServed{Key: s.Key, Cause: NotServedDate})
	case rolePlannedLeftover:
		if st.leftoverValid(i) {
			st.keep(i)
			st.consumeLeftover(*s.Existing.From, s.Portions())
			if s.Main && st.isWholeMeal(s.Existing.RecipeID) {
				st.coverGroup(i)
			}
		} else {
			st.roles[i] = roleEmpty
			st.fill(i)
		}
	case roleCovered:
		st.notServed = append(st.notServed, NotServed{Key: s.Key, Cause: NotServedCovered})
	case roleNotServed:
		st.notServed = append(st.notServed, NotServed{Key: s.Key, Cause: NotServedNoCourseAttendance})
	}
}

// keep records cell i as an unpinned Planned meal that Plan leaves unchanged, with the portions its cell needs.
func (st *state) keep(i int) {
	st.kept = append(st.kept, st.slots[i].Key)
	st.keptPortions[st.slots[i].Key] = st.slots[i].Portions()
}

// raise gives a fresh Planned Meal, unpinned or Pinned, the Batches its cell needs (ADR 0014 point 6): when its stored
// Batches no longer cover the cell's portions (Guests, a new Member, a Portion Factor, an opt-out removed), the Recipe
// stays and the Batches become ceil(portions / Yield). Fewer portions never lower Batches. A meal served from a
// Leftover is not a fresh cook and is not raised.
func (st *state) raise(i int, m ExistingMeal) ExistingMeal {
	if m.From != nil {
		return m
	}
	r, ok := st.recipes[m.RecipeID]
	if !ok || r.Yield <= 0 {
		return m
	}
	portions := st.slots[i].Portions()
	if m.Batches*r.Yield >= portions-eps {
		return m
	}
	n := BatchesFor(portions, r.Yield)
	st.raised = append(st.raised, BatchRaise{Key: st.slots[i].Key, Batches: n, Portions: portions})
	m.Batches = float64(n)
	return m
}

// applyFixed applies a Pinned or kept fresh meal, or one served from a Leftover:
// it consumes Stock (or its source) and leaves its extra portions pending.
func (st *state) applyFixed(i int, m ExistingMeal) {
	s := st.slots[i]
	portions := s.Portions()
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
// cell of an actual Leftover (its recorded FromSlot) or of a planned extra.
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
// nobody attending excludes its Recipe, the Recipe fits the Course and is not
// already planned in another Course of the slot.
func (st *state) leftoverValid(i int) bool {
	s := st.slots[i]
	portions := s.Portions()
	p := st.findSource(*s.Existing.From)
	if p == nil || p.portions < portions-eps || st.days[i] > p.useBy {
		return false
	}
	if p.recipe != s.Existing.RecipeID {
		return false
	}
	r, ok := st.recipes[p.recipe]
	return ok && st.fitsCourse(i, r) && !st.plannedInGroup(i, r.ID) && !st.excludes(s.Attendance, r, true)
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

// fill plans an empty cell: a pending Leftover first, then a strict candidate, then
// (required Courses only) a relaxed pick. A cell with nothing left is Couldn't plan,
// or not served when it is optional.
func (st *state) fill(i int) {
	s := st.slots[i]
	portions := s.Portions()
	if portions <= eps {
		if s.Optional {
			st.skipOptional(i)
			return
		}
		st.unfilled = append(st.unfilled, Unfilled{Key: s.Key, Reason: UnfilledNoAttendance})
		return
	}
	if st.takeLeftover(i, portions) {
		return
	}
	if s.Key.CourseID != 0 && !st.courseHasRecipe(i) {
		st.noFit(i, UnfilledNoCourseRecipes, Eliminations{}, false)
		return
	}
	strict, soft, elim, removed := st.evaluate(i, portions, evalOpts{})
	if len(strict) > 0 {
		best := strict[0]
		for _, c := range strict[1:] {
			if better(c, best) {
				best = c
			}
		}
		st.commitFresh(i, best, portions)
		return
	}
	if len(soft) > 0 && !s.Optional {
		st.commitFresh(i, st.bestRelaxed(i, soft).b, portions)
		return
	}
	claimed := len(s.Rules) > 0
	if s.Optional || elim.Exclusion == 0 {
		st.noFit(i, UnfilledNoCandidates, elim, claimed)
		return
	}
	exclusions, more := st.explainExclusions(i, removed)
	st.unfilled = append(st.unfilled, Unfilled{Key: s.Key, Reason: UnfilledNoCandidates, SlotRuleClaimed: claimed,
		Eliminated: elim, Exclusions: exclusions, MoreExclusions: more})
}

// noFit leaves a cell with nothing to plan: a Couldn't plan reason for a required
// Course, nothing (not served) for an optional one.
func (st *state) noFit(i int, reason UnfilledReason, elim Eliminations, claimed bool) {
	s := st.slots[i]
	if s.Optional {
		st.skipOptional(i)
		return
	}
	st.unfilled = append(st.unfilled, Unfilled{Key: s.Key, Reason: reason, SlotRuleClaimed: claimed, Eliminated: elim})
}

func (st *state) skipOptional(i int) {
	st.notServed = append(st.notServed, NotServed{Key: st.slots[i].Key, Cause: NotServedOptional})
}

// commitFresh places a fresh candidate in cell i. A Whole meal in the main Course covers the rest of the slot.
func (st *state) commitFresh(i int, b breakdown, portions float64) {
	s := st.slots[i]
	var rule *Why
	if sr, ok := matchRule(s.Rules, b.recipe); ok {
		w := ruleWhy(sr)
		rule = &w
	}
	st.placed[i] = b.recipe.ID
	st.placements = append(st.placements, st.placeFresh(i, b, portions, rule))
	if s.Main && b.recipe.WholeMeal {
		st.coverGroup(i)
	}
}

// takeLeftover serves cell i from the pending Leftover with the soonest Use-by
// (ties: actual before planned, then lowest id / earliest source), if one fits.
// A Leftover needs Course fit, a Recipe not already planned in the slot, and, for a
// Whole meal in the main Course, no fixed meal beside it.
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
		if !ok || !st.fitsCourse(i, r) {
			continue
		}
		rule, matched := matchRule(s.Rules, r)
		if len(s.Rules) > 0 && !matched {
			continue
		}
		if st.excludes(s.Attendance, r, true) {
			continue
		}
		if st.plannedInGroup(i, r.ID) {
			continue
		}
		if s.Main && r.WholeMeal && st.fixedBeside(i) {
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
	st.placed[i] = p.recipe
	st.placements = append(st.placements, Placement{
		Key:      s.Key,
		Source:   SourceLeftover,
		RecipeID: p.recipe,
		Portions: portions,
		From:     &from,
		Why:      why,
	})
	if s.Main && st.isWholeMeal(p.recipe) {
		st.coverGroup(i)
	}
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
	c.placements, c.unfilled, c.kept, c.notServed = nil, nil, nil, nil
	c.keptPortions = map[SlotKey]float64{}
	return &c
}

// placeFresh cooks breakdown b in cell i: it deducts Stock, records the
// purchases, leaves the extra portions pending and adds the fresh cook to the
// history. A relaxed pick (it breaks a Cool-down or Variety Rule at this cell)
// carries its relaxed chip last. The caller appends the returned Placement.
func (st *state) placeFresh(i int, b breakdown, portions float64, rule *Why) Placement {
	s := st.slots[i]
	day := st.days[i]
	r := b.recipe
	relaxed := st.breaks(i, r)
	why := buildWhy(b.chips, rule)
	if relaxed {
		why = append(why, st.relaxedChip(i, r))
	}
	pl := Placement{
		Key:      s.Key,
		Source:   SourceRecipe,
		RecipeID: r.ID,
		Batches:  b.batches,
		Portions: portions,
		Score:    b.total,
		Terms:    b.terms,
		Why:      why,
		Relaxed:  relaxed,
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
	kept := make(map[SlotKey]bool, len(st.kept))
	for _, k := range st.kept {
		kept[k] = true
	}
	var rechecks []Recheck
	for _, c := range st.rechecks {
		if kept[c.Key] {
			rechecks = append(rechecks, c)
		}
	}
	return Result{
		Placements:   st.placements,
		Unfilled:     st.unfilled,
		Kept:         st.kept,
		KeptPortions: st.keptPortions,
		Rechecks:     rechecks,
		NotServed:    st.notServed,
		Raised:       st.raised,
		Purchases:    purchases,
	}
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
