package planner

import (
	"math"
	"sort"
)

// evalOpts adjusts candidate evaluation: Swap ignores Slot Rules and drops the
// cell's current Recipe; a Swap never offers a reserved Recipe.
type evalOpts struct {
	ignoreRules bool
	exclude     RecipeID
	hasExclude  bool
	swap        bool
}

// breakdown is one scored candidate for a cell.
type breakdown struct {
	recipe  Recipe
	batches int
	terms   []ScoreTerm // non-zero terms only
	total   float64
	chips   []chip // positive terms that can be why chips
}

// chip is a candidate why chip; value orders the chips.
type chip struct {
	value float64
	why   Why
}

// softCand is a candidate that passes every hard filter but a soft one (Cool-down or a
// Variety Rule), or is reserved for a later Slot Rule cell (the last resort, spec 7.2 step 2b).
type softCand struct {
	b        breakdown
	reserved bool
}

// brokenRule is a Variety Rule a Recipe would break at a cell. capHit: the weekly cap
// (week counts the cooks this week including the cell); otherwise adjHit: the earlier
// adjacent-day cook (adjacent).
type brokenRule struct {
	tag      Tag
	capHit   bool
	week     int
	adjHit   bool
	adjacent int
}

func (b *breakdown) addTerm(code TermCode, value float64) {
	if math.Abs(value) < 1e-12 {
		return
	}
	b.terms = append(b.terms, ScoreTerm{Term: code, Value: value})
	b.total += value
}

func (b *breakdown) addChip(c chip) {
	if c.value > 0 {
		b.chips = append(b.chips, c)
	}
}

// better reports whether a outranks b: higher total, then lower Recipe id.
func better(a, b breakdown) bool {
	if math.Abs(a.total-b.total) > 1e-12 {
		return a.total > b.total
	}
	return a.recipe.ID < b.recipe.ID
}

func sortCandidates(cands []breakdown) {
	sort.SliceStable(cands, func(a, b int) bool { return better(cands[a], cands[b]) })
}

// evaluate runs the filters of spec 7.2 step 2 on cell i. It returns the strict
// candidates (scored, passing every filter) and the soft ones (hard-passing but
// breaking a Cool-down or Variety Rule, or reserved for a later cell), plus the
// eliminations. Reserved Recipes are not counted and are not Considered.
func (st *state) evaluate(i int, portions float64, opts evalOpts) (strict []breakdown, soft []softCand, elim Eliminations) {
	slot := st.slots[i]
	for _, id := range st.recipeIDs {
		r := st.recipes[id]
		if r.Archived || r.Yield <= 0 {
			continue
		}
		if opts.hasExclude && opts.exclude == id {
			continue
		}
		if !st.fitsCourse(i, r) {
			continue
		}
		if !opts.ignoreRules && len(slot.Rules) > 0 {
			if _, ok := matchRule(slot.Rules, r); !ok {
				continue
			}
		}
		reserved := st.reservedFor(i, r)
		if reserved && opts.swap {
			continue
		}
		counts := &elim
		if reserved {
			counts = &Eliminations{}
		} else {
			elim.Considered++
		}
		if !st.tally(i, r, counts) {
			continue
		}
		b := st.score(i, r, portions)
		if reserved || st.breaks(i, r) {
			soft = append(soft, softCand{b: b, reserved: reserved})
		} else {
			strict = append(strict, b)
		}
	}
	return strict, soft, elim
}

// tally applies the hard filters to Recipe r for cell i, in order, and counts the
// first that removes it. One Recipe per slot and the Whole meal hold-back count in
// Considered only; Exclusion and Advance Step are counted. It reports whether r
// passes every hard filter. Cool-down and Variety Rules are soft and never counted.
func (st *state) tally(i int, r Recipe, e *Eliminations) (hardPass bool) {
	slot := st.slots[i]
	switch {
	case st.plannedInGroup(i, r.ID):
		return false
	case slot.Main && r.WholeMeal && st.fixedBeside(i):
		return false
	case st.excludes(slot.Attendance, r, true):
		countExclusion(e, i, r)
		return false
	case st.advanceBlocked(i, r):
		e.AdvanceStep++
		return false
	}
	return true
}

// countExclusion counts one Exclusion elimination of Recipe r at cell i. It is the
// only place Exclusion is counted; the Review Exclusions follow-up extends it.
func countExclusion(e *Eliminations, i int, r Recipe) {
	e.Exclusion++
}

// courseHasRecipe: a non-archived Recipe with Yield > 0 is marked with the cell's Course.
func (st *state) courseHasRecipe(i int) bool {
	for _, id := range st.recipeIDs {
		r := st.recipes[id]
		if r.Archived || r.Yield <= 0 {
			continue
		}
		if st.fitsCourse(i, r) {
			return true
		}
	}
	return false
}

// excludes: an attending Member (Portion Factor > 0) excludes the Recipe or,
// when withIngredients is set, any of its Ingredient lines (optional included).
func (st *state) excludes(att []Attendee, r Recipe, withIngredients bool) bool {
	for _, a := range att {
		if a.PortionFactor <= eps {
			continue
		}
		p := st.in.Members[a.MemberID]
		if containsRecipe(p.ExcludedRecipes, r.ID) {
			return true
		}
		if !withIngredients {
			continue
		}
		for _, n := range r.Needs {
			if containsIngredient(p.ExcludedIngredients, n.IngredientID) {
				return true
			}
		}
	}
	return false
}

func (st *state) inCooldown(i int, r Recipe) bool {
	cd := st.cooldownDays(r)
	day := st.days[i]
	for _, h := range st.history {
		if h.recipe == r.ID && absInt(h.day-day) < cd {
			return true
		}
	}
	return false
}

// breaks: placing r at cell i would break its Cool-down or a Variety Rule (the soft filters).
func (st *state) breaks(i int, r Recipe) bool {
	return st.inCooldown(i, r) || len(st.brokenRules(i, r)) > 0
}

// brokenRules lists the Variety Rules that r would break at cell i, in rule order.
// Same-day meals count towards the weekly cap only.
func (st *state) brokenRules(i int, r Recipe) []brokenRule {
	day := st.days[i]
	var out []brokenRule
	for _, vr := range st.in.VarietyRules {
		if !hasTag(r.Tags, vr.Tag) {
			continue
		}
		var b brokenRule
		b.tag = vr.Tag
		hit := false
		if vr.MaxPerWeek > 0 {
			n := 0
			for _, h := range st.history {
				if st.recipeHasTag(h.recipe, vr.Tag) && weekStart(h.day) == weekStart(day) {
					n++
				}
			}
			if n >= vr.MaxPerWeek {
				b.capHit, b.week, hit = true, n+1, true
			}
		}
		if vr.NotConsecutiveDays {
			for _, h := range st.history {
				if st.recipeHasTag(h.recipe, vr.Tag) && absInt(h.day-day) == 1 {
					if !b.adjHit || h.day < b.adjacent {
						b.adjHit, b.adjacent = true, h.day
					}
					hit = true
				}
			}
		}
		if hit {
			out = append(out, b)
		}
	}
	return out
}

func (st *state) recipeHasTag(id RecipeID, tag Tag) bool {
	r, ok := st.recipes[id]
	return ok && hasTag(r.Tags, tag)
}

// nearestCook is the fresh cook of Recipe id nearest to day (before or after, any
// Course): its distance in days and its day number. Ties go to the earlier cook.
func (st *state) nearestCook(id RecipeID, day int) (gap, date int, ok bool) {
	for _, h := range st.history {
		if h.recipe != id {
			continue
		}
		g := absInt(h.day - day)
		if !ok || g < gap || (g == gap && h.day < date) {
			gap, date, ok = g, h.day, true
		}
	}
	return gap, date, ok
}

func (st *state) advanceBlocked(i int, r Recipe) bool {
	at := st.slots[i].At
	for _, a := range r.AdvanceSteps {
		if at.Add(-a.Lead).Before(st.in.Now) {
			return true
		}
	}
	return false
}

// relaxedBefore is the relaxed order (spec 7.2 step 2b), keys 1 to 6: not reserved
// first; outside its Cool-down first; among those inside, the longest gap to the
// nearest fresh cook, then the fewest days of Cool-down left; then the fewest Variety
// Rules broken; then the score and the Recipe id (better).
func (st *state) relaxedBefore(i int, a, b softCand) bool {
	if a.reserved != b.reserved {
		return !a.reserved
	}
	ina, inb := st.inCooldown(i, a.b.recipe), st.inCooldown(i, b.b.recipe)
	if ina != inb {
		return !ina
	}
	if ina {
		ga, _, _ := st.nearestCook(a.b.recipe.ID, st.days[i])
		gb, _, _ := st.nearestCook(b.b.recipe.ID, st.days[i])
		if ga != gb {
			return ga > gb
		}
		la := st.cooldownDays(a.b.recipe) - ga
		lb := st.cooldownDays(b.b.recipe) - gb
		if la != lb {
			return la < lb
		}
	}
	ba, bb := len(st.brokenRules(i, a.b.recipe)), len(st.brokenRules(i, b.b.recipe))
	if ba != bb {
		return ba < bb
	}
	return better(a.b, b.b)
}

// bestRelaxed returns the first soft candidate in the relaxed order. soft is not empty.
func (st *state) bestRelaxed(i int, soft []softCand) softCand {
	best := soft[0]
	for _, c := range soft[1:] {
		if st.relaxedBefore(i, c, best) {
			best = c
		}
	}
	return best
}

// relaxedChip is the chip of a relaxed pick of r at cell i, from the history now:
// Cool-down (the nearest fresh cook) when inside its Cool-down, else the first Variety
// Rule broken, with the count this week (cap) or the adjacent day's cook.
func (st *state) relaxedChip(i int, r Recipe) Why {
	if st.inCooldown(i, r) {
		_, date, _ := st.nearestCook(r.ID, st.days[i])
		return Why{Code: ReasonCooldownRelaxed, RecipeID: r.ID, Date: dateOf(date)}
	}
	b := st.brokenRules(i, r)[0]
	if b.capHit {
		return Why{Code: ReasonVarietyRelaxed, Tag: b.tag, Value: float64(b.week)}
	}
	return Why{Code: ReasonVarietyRelaxed, Tag: b.tag, Date: dateOf(b.adjacent)}
}

// score computes the weighted terms of a candidate for cell i.
func (st *state) score(i int, r Recipe, portions float64) breakdown {
	s := st.slots[i]
	day := st.days[i]
	batches := BatchesFor(portions, r.Yield)
	b := breakdown{recipe: r, batches: batches}
	w := st.w

	// Favourites and Dislikes of the attending Members.
	var favs []MemberID
	dislikes := 0
	for _, a := range s.Attendance {
		if a.PortionFactor <= eps {
			continue
		}
		p := st.in.Members[a.MemberID]
		if containsRecipe(p.Favourites, r.ID) {
			favs = append(favs, a.MemberID)
		}
		if containsRecipe(p.Dislikes, r.ID) {
			dislikes++
		}
	}
	sort.Slice(favs, func(x, y int) bool { return favs[x] < favs[y] })
	if len(favs) > 0 {
		v := w.Favourite * float64(len(favs))
		b.addTerm(TermFavourite, v)
		b.addChip(chip{value: v, why: Why{Code: ReasonFavourite, Value: v, MemberIDs: favs}})
	}
	b.addTerm(TermDislike, w.Dislike*float64(dislikes))

	// Stock shares over the non-optional lines. A line with nothing to cook
	// has no share and is skipped.
	var perishSum, overlapSum, coverSum float64
	lines := 0
	var perishBest, overlapBest *lineFact
	for _, n := range r.Needs {
		if n.Optional {
			continue
		}
		need := n.Quantity * float64(batches)
		if need <= eps {
			continue
		}
		lines++
		ls := st.lotStats(n.IngredientID, day)
		pf := math.Min(1, ls.atRisk/need)
		of := math.Min(1, ls.planned/need)
		cf := math.Min(1, ls.all/need)
		perishSum += pf
		overlapSum += of
		coverSum += cf
		if pf > 0 && (perishBest == nil || pf > perishBest.frac) {
			perishBest = &lineFact{ing: n.IngredientID, frac: pf, day: ls.atRiskDay}
		}
		if of > 0 && (overlapBest == nil || of > overlapBest.frac) {
			overlapBest = &lineFact{ing: n.IngredientID, frac: of, day: ls.plannedDay}
		}
	}
	if lines > 0 {
		n := float64(lines)
		v := w.PerishableUse * perishSum / n
		b.addTerm(TermPerishableUse, v)
		if perishBest != nil {
			b.addChip(chip{value: v, why: Why{Code: ReasonPerishableUse, Value: v, IngredientID: perishBest.ing, Date: dateOf(perishBest.day)}})
		}
		v = w.IngredientOverlap * overlapSum / n
		b.addTerm(TermIngredientOverlap, v)
		if overlapBest != nil {
			b.addChip(chip{value: v, why: Why{Code: ReasonIngredientOverlap, Value: v, IngredientID: overlapBest.ing, Date: dateOf(overlapBest.day)}})
		}
		v = w.StockCoverage * coverSum / n
		b.addTerm(TermStockCoverage, v)
		b.addChip(chip{value: v, why: Why{Code: ReasonStockCoverage, Value: v}})
	}

	// Extra portions: fits a later cell, or is wasted.
	if extra := float64(batches)*r.Yield - portions; extra > eps {
		if fit, ok := st.fitsLater(i, r, extra); ok {
			v := w.LeftoverFits
			b.addTerm(TermLeftoverFits, v)
			b.addChip(chip{value: v, why: Why{Code: ReasonLeftoverFits, Value: v, Date: dateOf(fit)}})
		} else {
			b.addTerm(TermLeftoverWasted, w.LeftoverWasted)
		}
	}

	// Recency: 0 when never cooked, otherwise 1 - days/RecencyDays, floored at 0.
	if last, ok := st.lastFreshBefore(i, r.ID); ok && st.cfg.RecencyDays > 0 {
		gap := day - last
		if gap < 0 {
			gap = 0
		}
		if gap > st.cfg.RecencyDays {
			gap = st.cfg.RecencyDays
		}
		recentness := 1 - float64(gap)/float64(st.cfg.RecencyDays)
		b.addTerm(TermRecency, w.Recency*recentness)
	}

	b.addTerm(TermJitter, JitterFor(st.in.Seed, s.Key, r.ID, w.Jitter))
	return b
}

// lineFact is the best Ingredient for a why chip: its covered fraction and date.
type lineFact struct {
	ing  IngredientID
	frac float64
	day  int
}

// fitsLater reports the first later empty cell that can be served the extra of
// Recipe r cooked at cell i: not past r's Use-by, needing no more than the extra,
// Course fit, not in the same Meal Slot as r, not already planned in its own slot,
// no Whole meal beside a fixed meal in the main Course, matching its Slot Rules, and
// with no attendee excluding r.
func (st *state) fitsLater(i int, r Recipe, extra float64) (int, bool) {
	useBy := st.days[i] + st.useByDays(r)
	for j := i + 1; j < len(st.slots); j++ {
		if st.roles[j] != roleEmpty || st.days[j] > useBy {
			continue
		}
		s := st.slots[j]
		portions := PortionsNeeded(s.Attendance)
		if portions <= eps || portions > extra+eps {
			continue
		}
		if !st.fitsCourse(j, r) || st.sameGroup(i, j) {
			continue
		}
		if s.Main && r.WholeMeal && st.fixedBeside(j) {
			continue
		}
		if st.plannedInGroup(j, r.ID) {
			continue
		}
		if len(s.Rules) > 0 {
			if _, ok := matchRule(s.Rules, r); !ok {
				continue
			}
		}
		if st.excludes(s.Attendance, r, true) {
			continue
		}
		return st.days[j], true
	}
	return 0, false
}

// lastFreshBefore is the day of the most recent fresh cook of the Recipe in an
// earlier cell than i (or before the horizon).
func (st *state) lastFreshBefore(i int, id RecipeID) (int, bool) {
	best, found := 0, false
	for _, h := range st.history {
		if h.recipe == id && h.seq < i && (!found || h.day > best) {
			best, found = h.day, true
		}
	}
	return best, found
}

func containsRecipe(ids []RecipeID, id RecipeID) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

func containsIngredient(ids []IngredientID, id IngredientID) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

func containsCourse(ids []int64, id int64) bool {
	for _, x := range ids {
		if x == id {
			return true
		}
	}
	return false
}

func hasTag(tags []Tag, t Tag) bool {
	for _, x := range tags {
		if x == t {
			return true
		}
	}
	return false
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// weekStart is the day number of the Monday of the ISO week containing day.
// Day 0 (1970-01-01) was a Thursday.
func weekStart(day int) int {
	wd := ((day+3)%7 + 7) % 7 // Monday = 0
	return day - wd
}
