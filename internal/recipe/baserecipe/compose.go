package baserecipe

import (
	"math"
	"strconv"
	"strings"
	"unicode"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// item is one Step while a Recipe's list is composed. deps are the items it waits for. They are pointers, so an
// insertion never renumbers them. factor is the product of the line factors down to the Step (its Uses scale);
// frac is the product of the made fractions (Stock) down to it.
type item struct {
	text   string
	kind   schedule.Kind
	dur    int
	lead   int
	uses   []schedule.Use
	deps   []*item
	origin *Origin
	factor float64
	frac   float64
}

type composer struct {
	cat  Catalog
	made func(Path) float64
}

// ComposeSteps builds the Step list for one Batch-independent Recipe, Base recipes included (§4.4). made(path)
// is the fraction (0..1) of that Base recipe line still to make *of what its parent asks* (relative, like
// Resolve): 1 with no Stock, 0 when Stock covers it; the effective fraction multiplies down the path. A nil
// made means 1 everywhere. Positions are chosen as if nothing were in Stock, so Stock never moves an index.
func ComposeSteps(cat Catalog, recipeID int64, made func(Path) float64) (Composed, error) {
	r, ok := cat.Recipe(recipeID)
	if !ok {
		return Composed{}, ErrNotFound
	}
	c := composer{cat: cat, made: made}
	list, err := c.compose(r, "", nil, 1, 1, []frame{{r.ID, r.Name}})
	if err != nil {
		return Composed{}, err
	}
	return finish(list)
}

// compose returns the items of r's own Steps with its Base recipe blocks placed in. path is "" for the root
// Recipe; chain is the Base recipe names down to r (nil for the root).
func (c composer) compose(r Recipe, path string, chain []string, factor, frac float64, stack []frame) ([]*item, error) {
	steps := make([]schedule.Step, len(r.Steps))
	for i, s := range r.Steps {
		steps[i] = schedule.Step{Kind: s.Kind, DurationMinutes: s.DurationMinutes, LeadTimeMinutes: s.LeadTimeMinutes, After: s.After}
	}
	if errs := schedule.Validate(steps); len(errs) > 0 {
		return nil, errs
	}
	var origin *Origin
	if path != "" {
		origin = &Origin{BaseRecipeID: r.ID, Names: chain, Path: Path(path)}
	}
	own := make([]*item, len(r.Steps))
	for i, s := range r.Steps {
		own[i] = &item{text: s.Text, kind: s.Kind, dur: s.DurationMinutes, lead: s.LeadTimeMinutes, uses: s.Uses,
			origin: origin, factor: factor, frac: frac}
	}
	for i, s := range r.Steps {
		for _, j := range s.After {
			own[i].deps = append(own[i].deps, own[j])
		}
	}

	list := append([]*item(nil), own...)
	var placed [][]*item // the blocks already placed at this level: each one stays one unbroken run
	for i, ln := range r.Lines {
		q, ok := qtyOf(c.cat, ln)
		if !ok {
			continue
		}
		child, yield, isBlock := blockOf(c.cat, ln.IngredientID)
		if !isBlock || !hasConvertingLine(c.cat, child) {
			// A Base recipe with no converting line is empty (§4.6): it counts as its own Ingredient, its Steps
			// stay off the timeline.
			continue
		}
		if err := cycleFor(stack, child); err != nil {
			return nil, err
		}
		childPath := strconv.Itoa(i)
		if path != "" {
			childPath = path + "/" + childPath
		}
		childChain := append(append([]string(nil), chain...), child.Name)
		block, err := c.compose(child, childPath, childChain, factor*q/yield, frac*c.madeOf(childPath),
			append(stack, frame{child.ID, child.Name}))
		if err != nil {
			return nil, err
		}
		if len(block) == 0 {
			continue
		}
		// No anchor (no non-Advance Step): the block goes at the end, in line order.
		var anchor *item
		if k := NeededAt(r, i, child.Name); k >= 0 && k < len(own) {
			anchor = own[k]
		}
		sinks := sinksOf(block)
		p, err := bestPosition(list, anchor, block, sinks, placed)
		if err != nil {
			return nil, err
		}
		list = insertAt(list, p, block)
		placed = append(placed, block)
		if anchor != nil {
			anchor.deps = appendNew(anchor.deps, sinks)
		}
	}
	return list, nil
}

// hasConvertingLine reports whether a Recipe has any line that converts; without one its Base recipe is empty.
func hasConvertingLine(cat Catalog, r Recipe) bool {
	for _, ln := range r.Lines {
		if _, ok := qtyOf(cat, ln); ok {
			return true
		}
	}
	return false
}

// madeOf is the made fraction of the Base recipe line at path, clamped to 0..1; 1 without a made function. NaN
// means "make it" (1).
func (c composer) madeOf(path string) float64 {
	if c.made == nil {
		return 1
	}
	v := c.made(Path(path))
	switch {
	case math.IsNaN(v):
		return 1
	case !(v >= 0):
		return 0
	case v > 1:
		return 1
	}
	return v
}

// sinksOf returns the non-Advance items of a block that no other item of the block waits for.
func sinksOf(block []*item) []*item {
	waited := map[*item]bool{}
	for _, it := range block {
		for _, d := range it.deps {
			waited[d] = true
		}
	}
	var out []*item
	for _, it := range block {
		if it.kind != schedule.Advance && !waited[it] {
			out = append(out, it)
		}
	}
	return out
}

// bestPosition picks where a block goes in the list: the position p <= the anchor's index that gives the
// shortest total with full durations, the latest on a tie. A position strictly inside an already placed sibling
// block is not allowed, so sibling blocks never interleave. With no anchor (a Recipe without a non-Advance
// Step) the block goes at the end.
func bestPosition(list []*item, anchor *item, block, sinks []*item, placed [][]*item) (int, error) {
	if anchor == nil {
		return len(list), nil
	}
	var spans [][2]int // [first, end) of each placed sibling in the current list
	for _, b := range placed {
		first, last := len(list), -1
		for _, it := range b {
			i := indexOf(list, it)
			first = min(first, i)
			last = max(last, i)
		}
		if last >= 0 {
			spans = append(spans, [2]int{first, last + 1})
		}
	}
	inside := func(p int) bool {
		for _, sp := range spans {
			if sp[0] < p && p < sp[1] {
				return true
			}
		}
		return false
	}
	pos := indexOf(list, anchor)
	best, bestTotal := -1, 0
	for p := pos; p >= 0; p-- {
		if inside(p) {
			continue
		}
		total, err := totalOf(insertAt(list, p, block), anchor, sinks)
		if err != nil {
			return 0, err
		}
		if best < 0 || total < bestTotal {
			best, bestTotal = p, total
		}
	}
	if best < 0 {
		return pos, nil // unreachable: the anchor is never inside a sibling's run
	}
	return best, nil
}

// totalOf is the schedule total of a list, with the anchor additionally waiting for sinks.
func totalOf(list []*item, anchor *item, sinks []*item) (int, error) {
	idx := make(map[*item]int, len(list))
	for i, it := range list {
		idx[it] = i
	}
	steps := make([]schedule.Step, len(list))
	for i, it := range list {
		after := make([]int, 0, len(it.deps))
		for _, d := range it.deps {
			after = append(after, idx[d])
		}
		if it == anchor {
			for _, s := range sinks {
				after = append(after, idx[s])
			}
		}
		steps[i] = schedule.Step{Kind: it.kind, DurationMinutes: it.dur, LeadTimeMinutes: it.lead, After: after}
	}
	sch, err := schedule.Compute(steps)
	return sch.TotalMinutes, err
}

func indexOf(list []*item, it *item) int {
	for i, x := range list {
		if x == it {
			return i
		}
	}
	return -1
}

func insertAt(list []*item, p int, block []*item) []*item {
	out := make([]*item, 0, len(list)+len(block))
	out = append(out, list[:p]...)
	out = append(out, block...)
	return append(out, list[p:]...)
}

func appendNew(deps, add []*item) []*item {
	for _, a := range add {
		dup := false
		for _, d := range deps {
			if d == a {
				dup = true
				break
			}
		}
		if !dup {
			deps = append(deps, a)
		}
	}
	return deps
}

// finish turns the item list into the Composed result. A fully covered block's Step becomes a zero-length Active
// Step; Uses are scaled by the line factors and the made fraction; the total is taken with those durations.
func finish(list []*item) (Composed, error) {
	idx := make(map[*item]int, len(list))
	for i, it := range list {
		idx[it] = i
	}
	out := Composed{Steps: make([]ComposedStep, len(list))}
	timing := make([]schedule.Step, len(list))
	for i, it := range list {
		cs := ComposedStep{Origin: it.origin, Covered: it.origin != nil && it.frac <= 0}
		cs.Text = it.text
		cs.Kind, cs.DurationMinutes, cs.LeadTimeMinutes = it.kind, it.dur, it.lead
		if cs.Covered {
			cs.Kind, cs.DurationMinutes, cs.LeadTimeMinutes = schedule.Active, 0, 0
		}
		for _, d := range it.deps {
			cs.After = append(cs.After, idx[d])
		}
		cs.Uses = scaleUses(it.uses, it.factor*it.frac)
		out.Steps[i] = cs
		timing[i] = schedule.Step{Kind: cs.Kind, DurationMinutes: cs.DurationMinutes, LeadTimeMinutes: cs.LeadTimeMinutes, After: cs.After}
	}
	sch, err := schedule.Compute(timing)
	if err != nil {
		return Composed{}, err
	}
	out.TotalMinutes = sch.TotalMinutes
	return out, nil
}

func scaleUses(uses []schedule.Use, f float64) []schedule.Use {
	if uses == nil {
		return nil
	}
	out := make([]schedule.Use, len(uses))
	for i, u := range uses {
		u.Quantity *= f
		out[i] = u
	}
	return out
}

// NeededAt is the default Needed at Step of the Base recipe line lineIndex of r (§3.3): the stored override
// when it points at a non-Advance Step; else the first non-Advance Step whose Uses name the line's Ingredient;
// else the first non-Advance Step whose text names baseName (whole words, case and accents folded); else the
// first non-Advance Step. -1 when the Recipe has no non-Advance Step: ComposeSteps then puts the block at the end.
func NeededAt(r Recipe, lineIndex int, baseName string) int {
	if lineIndex < 0 || lineIndex >= len(r.Lines) {
		return 0
	}
	ln := r.Lines[lineIndex]
	usable := func(k int) bool { return k >= 0 && k < len(r.Steps) && r.Steps[k].Kind != schedule.Advance }
	if ln.NeededAtStep != nil && usable(*ln.NeededAtStep) {
		return *ln.NeededAtStep
	}
	for k, s := range r.Steps {
		if s.Kind == schedule.Advance {
			continue
		}
		for _, u := range s.Uses {
			if u.IngredientID != 0 && u.IngredientID == ln.IngredientID {
				return k
			}
		}
	}
	name := words(baseName)
	if len(name) > 0 {
		for k, s := range r.Steps {
			if s.Kind != schedule.Advance && containsWords(words(s.Text), name) {
				return k
			}
		}
	}
	for k, s := range r.Steps {
		if s.Kind != schedule.Advance {
			return k
		}
	}
	return -1
}

// words splits a text into lower-case, accent-folded words.
func words(s string) []string {
	return strings.FieldsFunc(ingredient.FoldAccents(s), func(r rune) bool {
		return !unicode.IsLetter(r) && !unicode.IsDigit(r)
	})
}

// containsWords reports whether name occurs as a run of whole words in text.
func containsWords(text, name []string) bool {
	for i := 0; i+len(name) <= len(text); i++ {
		match := true
		for j := range name {
			if text[i+j] != name[j] {
				match = false
				break
			}
		}
		if match {
			return true
		}
	}
	return false
}
