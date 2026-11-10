package planner

import (
	"math"
	"sort"
)

// evalOpts adjusts candidate evaluation: Swap ignores Slot Rules and drops the
// slot's current Recipe.
type evalOpts struct {
	ignoreRules bool
	exclude     RecipeID
	hasExclude  bool
}

// breakdown is one scored candidate for a slot.
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

// evaluate returns the scored candidates for slot i that survive the filters,
// in ascending Recipe id order, and how many each filter removed.
func (st *state) evaluate(i int, portions float64, opts evalOpts) ([]breakdown, Eliminations) {
	slot := st.slots[i]
	var elim Eliminations
	var out []breakdown
	for _, id := range st.recipeIDs {
		r := st.recipes[id]
		if r.Archived || r.Yield <= 0 {
			continue
		}
		if !opts.ignoreRules && len(slot.Rules) > 0 {
			if _, ok := matchRule(slot.Rules, r); !ok {
				continue
			}
		}
		if opts.hasExclude && opts.exclude == id {
			continue
		}
		if st.reservedFor(i, r) {
			continue
		}
		elim.Considered++
		switch {
		case st.excludes(slot.Attendance, r, true):
			elim.Exclusion++
		case st.inCooldown(i, r):
			elim.CoolDown++
		case st.varietyBlocked(i, r):
			elim.VarietyRule++
		case st.advanceBlocked(i, r):
			elim.AdvanceStep++
		default:
			out = append(out, st.score(i, r, portions))
		}
	}
	return out, elim
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

// varietyBlocked: the Recipe carries a Tag with a Variety Rule that this fresh
// cook would break. Same-day meals count towards the weekly cap only.
func (st *state) varietyBlocked(i int, r Recipe) bool {
	day := st.days[i]
	for _, vr := range st.in.VarietyRules {
		if !hasTag(r.Tags, vr.Tag) {
			continue
		}
		if vr.MaxPerWeek > 0 {
			n := 0
			for _, h := range st.history {
				if st.recipeHasTag(h.recipe, vr.Tag) && weekStart(h.day) == weekStart(day) {
					n++
				}
			}
			if n >= vr.MaxPerWeek {
				return true
			}
		}
		if vr.NotConsecutiveDays {
			for _, h := range st.history {
				if st.recipeHasTag(h.recipe, vr.Tag) && absInt(h.day-day) == 1 {
					return true
				}
			}
		}
	}
	return false
}

func (st *state) recipeHasTag(id RecipeID, tag Tag) bool {
	r, ok := st.recipes[id]
	return ok && hasTag(r.Tags, tag)
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

// score computes the weighted terms of a candidate for slot i.
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

	// Extra portions: fits a later slot, or is wasted.
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

// fitsLater reports the first later slot that can be served the extra of
// recipe r cooked at slot i: still empty, not past r's Use-by, needing no more
// than the extra, matching its Slot Rules, and with no attendee excluding r.
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
// earlier slot than i (or before the horizon).
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
