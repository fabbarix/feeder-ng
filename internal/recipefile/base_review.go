package recipefile

import (
	"fmt"
	"unicode"
	"unicode/utf8"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipe/baserecipe"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Base recipe tiles of Import Review (beta.6, BR-C; docs/dev/design/base-recipes.md §11.3, ADR 0015 P3 and P7).
//
// A tile is made for a line of a kept Recipe that the model marked as calling for another recipe (`recipe`), or whose
// Ingredient name matches a Recipe by name: an existing Base recipe, an existing plannable Recipe, or a Recipe of the
// same file. A marked line matches on the mark's name, close names included; an unmarked line matches on exact name
// only. Matching is baserecipe.MatchReference: case, accents and a plural "s" are ignored. Only an exact match to a Base
// recipe (existing, or a Base recipe of the file) is preselected, and a Base recipe is preferred over a plain
// Ingredient of the same name. A preselected answer still needs the User's confirmation of the review.
//
// The answers become the write set (Commit): a Base recipe line points at its Base recipe's Ingredient, so the plain
// Ingredient row of that name is dropped unless a kept line still uses it.

// maxBaseYield bounds a Base recipe's Yield: an amount in its yield unit (1000 g must fit), not portions.
const maxBaseYield = 100000

// virtualBase is the first placeholder id of a Base recipe Ingredient that a Recipe is validated against before the
// store has written it (negative, far from the ids of created Ingredients).
const virtualBase int64 = -(1 << 40)

// baseRow is one Base recipe tile, with the answer in force.
type baseRow struct {
	path      string
	recipeIdx int
	lineIdx   int
	line      Line
	cands     []BaseRecipeSuggestion
	keep      *ExistingRef
	effective *BaseRecipeLineDecision
	resolved  bool
}

// baseEdge is a file answer "this Recipe calls for that one" (BaseFile), made by the line at path.
type baseEdge struct {
	to   int
	path string
}

// baseTarget is the Base recipe Ingredient a Base recipe line calls: an existing one (use), or a placeholder while the
// Recipe is validated (file, create, convert). Conversions answered for it are added to ing.
type baseTarget struct {
	ref  BaseRef
	id   int64
	ing  units.Ingredient
	name string
}

// baseLine is a line answered with a Base recipe. unit is the unit the line is written with (create may turn a unit
// outside the families into batch); target is the Ingredient it calls.
type baseLine struct {
	path   string
	key    string // units.NormalizeName of the line's Ingredient
	name   string // the Recipe's name (create) or the Ingredient's display name
	unit   string
	ref    BaseRef
	target *baseTarget
	create bool
	yield  yieldOf // create: the Yield the new Base recipe gets
}

// yieldOf is a Yield and its unit.
type yieldOf struct {
	yield float64
	unit  string
}

// baseSets is what the tiles need from the household: which Recipes are Base recipes, and which Ingredients belong to
// them (those are never matched by their plain name).
func baseSets(ex Existing) (ingredients map[int64]bool, recipes map[int64]bool) {
	ingredients, recipes = map[int64]bool{}, map[int64]bool{}
	for _, b := range ex.BaseRecipes {
		ingredients[b.IngredientID] = true
		recipes[b.RecipeID] = true
	}
	return ingredients, recipes
}

// linePath is the JSON path of line j of Recipe i.
func linePath(i, j int) string { return fmt.Sprintf("$.recipes[%d].ingredients[%d]", i, j) }

// buildBaseRows builds the tiles of the kept Recipes, in document order, then checks the file's own answers for cycles
// and binds the answers that create or name a Base recipe.
func (r *review) buildBaseRows() {
	r.stepBase = make([]map[string]*baseLine, len(r.f.Recipes))
	r.asBase = make([]bool, len(r.f.Recipes))
	r.baseYield = make([]yieldOf, len(r.f.Recipes))
	for i, rec := range r.f.Recipes {
		if !r.kept[i] {
			continue
		}
		for j, l := range rec.Ingredients {
			cands := r.baseCandidates(i, l)
			path := linePath(i, j)
			// A line with no Recipe to match has no tile. An answer other than keep still applies to it (keep is the plain
			// line it already is, so it is ignored there).
			if d, answered := r.baseAnswer(path); l.Recipe == nil && len(cands) == 0 && (!answered || d.Action == BaseKeep) {
				continue
			}
			row := &baseRow{
				path:      path,
				recipeIdx: i, lineIdx: j, line: l, cands: cands,
				keep: r.plainIngredient(l.Ingredient),
			}
			if d, ok := r.baseAnswer(row.path); ok {
				row.effective = &d
				if msg := r.checkBaseAnswer(d); msg != "" {
					r.problem(row.path, ProblemBaseRecipeAnswer, msg)
				} else {
					row.resolved = true
				}
			} else if pre := r.preselect(cands); pre != nil {
				row.effective, row.resolved = pre, true
			}
			r.baseRows = append(r.baseRows, row)
		}
	}
	r.checkConvertGroups()
	r.markBaseRecipes()
	r.bindBaseLines()
}

// checkConvertGroups says one Recipe is turned into a Base recipe once, however many tiles answer convert to it (round 6:
// Lasagne's and Gnocchi's "pesto"). The first tile in document order makes the Yield; a later tile whose answer gives
// another Yield or unit is base_recipe_answer_invalid on its own tile, and it stays open.
func (r *review) checkConvertGroups() {
	first := map[int64]*baseRow{}
	for _, row := range r.baseRows {
		if !row.resolved || row.effective == nil || row.effective.Action != BaseConvert {
			continue
		}
		id := row.effective.RecipeID
		f, seen := first[id]
		if !seen {
			first[id] = row
			continue
		}
		if f.effective.Yield == row.effective.Yield && f.effective.YieldUnit == row.effective.YieldUnit {
			continue
		}
		row.resolved = false
		r.problem(row.path, ProblemBaseRecipeAnswer, fmt.Sprintf("%s is turned into a Base recipe once: the tile at %s makes it %g %s, so this answer must give the same Yield",
			r.recipeNameOf(id), f.path, f.effective.Yield, f.effective.YieldUnit))
	}
}

// recipeNameOf is the name of a stored Recipe, for a message.
func (r *review) recipeNameOf(id int64) string {
	for _, e := range r.ex.Recipes {
		if e.ID == id {
			return e.Name
		}
	}
	return "this Recipe"
}

// baseAnswer is the User's answer for the tile at path, if there is one.
func (r *review) baseAnswer(path string) (BaseRecipeLineDecision, bool) {
	d, ok := r.d.BaseRecipeLines[path]
	return d, ok
}

// baseCandidates are the Recipes a line may be, ranked by baserecipe.MatchReference (the picker's matcher too): exact
// matches first, then Base recipes, Recipes of the file and plannable Recipes. A marked line keeps the close matches;
// an unmarked one only the exact ones. The Recipe the line sits in is never a candidate: a Recipe does not call for
// itself.
func (r *review) baseCandidates(i int, l Line) []BaseRecipeSuggestion {
	name, marked := l.Ingredient, l.Recipe != nil
	if marked {
		name = l.Recipe.Name
	}
	own := r.f.Recipes[i].Name
	var cands []baserecipe.RefCandidate
	for _, e := range r.ex.Recipes {
		if sameRecipeName(e.Name, own) || e.ReadyMeal {
			continue // a Ready Meal can never be a Base recipe (ADR 0015)
		}
		kind := baserecipe.KindPlannable
		if r.baseRecipes[e.ID] {
			kind = baserecipe.KindBase
		}
		cands = append(cands, baserecipe.RefCandidate{Kind: kind, RecipeID: e.ID, Name: e.Name})
	}
	for j, fr := range r.f.Recipes {
		if !r.kept[j] || j == i || sameRecipeName(fr.Name, own) || fr.ReadyMeal {
			continue
		}
		cands = append(cands, baserecipe.RefCandidate{Kind: baserecipe.KindFile, FileIndex: j, Name: fr.Name})
	}
	var out []BaseRecipeSuggestion
	// The cue of a marked line ("the previous recipe") picks the neighbouring Recipe of this file; it never preselects
	// (only an exact name match does, P3).
	ref := baserecipe.Reference{Name: name, FileIndex: i}
	if marked {
		ref.Cue = l.Recipe.Cue
	}
	for _, s := range baserecipe.MatchReference(ref, cands) {
		if !marked && !s.Exact {
			continue
		}
		sg := BaseRecipeSuggestion{Kind: s.Kind, Name: s.Name, Exact: s.Exact}
		if s.Kind == baserecipe.KindFile {
			idx := s.FileIndex
			sg.RecipeIndex = &idx
		} else {
			sg.RecipeID = s.RecipeID
		}
		out = append(out, sg)
	}
	return out
}

// sameRecipeName reports whether two Recipe names are the same for Base recipe matching.
func sameRecipeName(a, b string) bool {
	m := baserecipe.MatchReference(baserecipe.Reference{Name: a, FileIndex: -1}, []baserecipe.RefCandidate{{Kind: baserecipe.KindFile, Name: b}})
	return len(m) == 1 && m[0].Exact
}

// preselect is the answer a line starts with: only an exact match to a Base recipe (existing first, then one of the
// file). Anything else waits for the User.
func (r *review) preselect(cands []BaseRecipeSuggestion) *BaseRecipeLineDecision {
	for _, c := range cands {
		if c.Exact && c.Kind == SuggestBase {
			return &BaseRecipeLineDecision{Action: BaseUse, RecipeID: c.RecipeID}
		}
	}
	for _, c := range cands {
		if c.Exact && c.Kind == SuggestFile && r.fileBase(*c.RecipeIndex) {
			idx := *c.RecipeIndex
			return &BaseRecipeLineDecision{Action: BaseFile, RecipeIndex: &idx}
		}
	}
	return nil
}

// checkBaseAnswer says why an answer does not fit its tile, or "" when it does.
func (r *review) checkBaseAnswer(d BaseRecipeLineDecision) string {
	const fit = "this answer does not fit the line: "
	switch d.Action {
	case BaseUse:
		if !r.baseRecipes[d.RecipeID] {
			return fit + "that Recipe is not a Base recipe of the Household"
		}
	case BaseFile:
		if d.RecipeIndex == nil || *d.RecipeIndex < 0 || *d.RecipeIndex >= len(r.f.Recipes) || !r.kept[*d.RecipeIndex] {
			return fit + "choose a Recipe of this file"
		}
		if r.f.Recipes[*d.RecipeIndex].ReadyMeal {
			return fit + "a Ready Meal can never be a Base recipe"
		}
		if !r.fileBase(*d.RecipeIndex) && (d.Yield <= 0 || !ValidYieldUnit(d.YieldUnit)) {
			return fit + "a Recipe that is not marked as a Base recipe needs a Yield and its unit"
		}
	case BaseConvert:
		if !r.isPlannable(d.RecipeID) {
			return fit + "only a plannable Recipe of the Household can be turned into a Base recipe"
		}
		if r.isReadyMeal(d.RecipeID) {
			return fit + "a Ready Meal can never be a Base recipe"
		}
		if d.Yield <= 0 || !ValidYieldUnit(d.YieldUnit) {
			return fit + "turning it into a Base recipe needs a Yield and its unit"
		}
	case BaseCreate, BaseKeep:
	default:
		return fit + "the answer is not one the tile offers"
	}
	return ""
}

// checkBaseGraph reports every cycle among the file's Base recipes. Only a line answered "file" is an edge: that Recipe
// calls for the other. A kept line is no edge: it goes on a new plain Ingredient keyed by its name, and a Base recipe's
// Ingredient is keyed base-recipe:<id>, so a kept line named after another Base recipe depends on nothing. A Recipe
// calling for itself is a cycle of one.
func (r *review) checkBaseGraph() {
	adj := map[int][]baseEdge{}
	for _, row := range r.baseRows {
		if row.resolved && row.effective.Action == BaseFile {
			adj[row.recipeIdx] = append(adj[row.recipeIdx], baseEdge{to: *row.effective.RecipeIndex, path: row.path})
		}
	}
	state := map[int]int{} // 0 unvisited, 1 on the stack, 2 done
	var stack []int
	var visit func(u int)
	visit = func(u int) {
		state[u] = 1
		stack = append(stack, u)
		for _, e := range adj[u] {
			switch state[e.to] {
			case 0:
				visit(e.to)
			case 1:
				k := len(stack) - 1
				for stack[k] != e.to {
					k--
				}
				cycle := append(append([]int{}, stack[k:]...), e.to)
				r.problem(e.path, ProblemBaseRecipeCycle, r.cycleMessage(cycle))
			}
		}
		stack = stack[:len(stack)-1]
		state[u] = 2
	}
	for i := range r.f.Recipes {
		if state[i] == 0 && len(adj[i]) > 0 {
			visit(i)
		}
	}
}

// nameOf is the name a Recipe of the file gets in the store: its imported name, or its own name when it has none yet.
func (r *review) nameOf(i int) string {
	if n := r.recipes[i].ImportedAs; n != "" {
		return n
	}
	return r.f.Recipes[i].Name
}

func (r *review) cycleMessage(cycle []int) string {
	names := make([]string, len(cycle))
	for k, idx := range cycle {
		names[k] = r.nameOf(idx)
	}
	return CycleMessage(names)
}

// CycleMessage says a closed path of Recipe names: "A cannot call for itself", or "A calls for B, which calls for C, which
// calls for A". The review and the Confirm answer both use it.
func CycleMessage(path []string) string {
	switch {
	case len(path) < 2:
		return "base recipe cycle"
	case len(path) == 2:
		return path[0] + " cannot call for itself"
	}
	// the path starts and ends with the same Recipe
	msg := path[0] + " calls for " + path[1]
	for _, name := range path[2:] {
		msg += ", which calls for " + name
	}
	return msg
}

// markBaseRecipes says which kept Recipes of the file are created as Base recipes: the ones the file marks, and the ones
// a file answer points at (with the Yield the answer gives). A Recipe that replaces a plannable one cannot be a Base
// recipe (its kind cannot change in a replace).
func (r *review) markBaseRecipes() {
	for i, rec := range r.f.Recipes {
		if r.kept[i] && r.fileBase(i) {
			r.asBase[i] = true
			r.baseYield[i] = yieldOf{yield: rec.Yield, unit: rec.YieldUnit}
		}
	}
	for _, row := range r.baseRows {
		if !row.resolved || row.effective.Action != BaseFile {
			continue
		}
		idx := *row.effective.RecipeIndex
		if !r.asBase[idx] {
			r.asBase[idx] = true
			r.baseYield[idx] = yieldOf{yield: row.effective.Yield, unit: row.effective.YieldUnit}
		}
	}
}

// bindBaseLines makes the Base recipe lines of the resolved tiles: what each one calls, and the Step uses named like it.
// A create answer whose name is held (a Base recipe, a Ready Meal, a plannable Recipe) is a Problem on its tile, which
// stays open.
func (r *review) bindBaseLines() {
	r.baseAt = map[string]*baseLine{}
	for _, row := range r.baseRows {
		if !row.resolved || row.effective == nil {
			continue
		}
		d := row.effective
		name := baseRecipeName(row.line.Ingredient)
		bl := &baseLine{path: row.path, key: units.NormalizeName(row.line.Ingredient), name: name, unit: row.line.Unit}
		switch d.Action {
		case BaseUse:
			ing, ok := r.baseIngOf[d.RecipeID]
			if !ok {
				continue
			}
			e := r.existingByID[ing].Units()
			bl.target = r.target(BaseRef{Kind: BaseRefRecipe, ID: d.RecipeID}, name, yieldOf{}, &e, ing)
			bl.ref = BaseRef{Kind: BaseRefRecipe, ID: d.RecipeID}
		case BaseFile:
			idx := *d.RecipeIndex
			bl.ref = BaseRef{Kind: BaseRefFile, Index: idx}
			bl.target = r.target(bl.ref, name, r.baseYield[idx], nil, 0)
		case BaseCreate:
			if first, shared := r.sharedCreate(name); shared {
				// Another create answer of the same name (case, accents and a plural s ignored) makes the one Base recipe.
				fb := r.baseAt[first]
				bl.create, bl.yield, bl.unit = true, fb.yield, lineUnitOf(row.line, fb.yield.unit)
				bl.ref, bl.target = fb.ref, fb.target
				break
			}
			if !r.checkBaseName(row.path, name, true) {
				row.resolved = false
				continue
			}
			y, unit := createYield(row.line)
			bl.create, bl.yield, bl.unit = true, yieldOf{yield: y, unit: unit}, lineUnitOf(row.line, unit)
			bl.ref = BaseRef{Kind: BaseRefLine, Line: row.path}
			bl.target = r.target(bl.ref, name, bl.yield, nil, 0)
			r.createNames = append(r.createNames, createName{name: name, path: row.path})
		case BaseConvert:
			y := yieldOf{yield: d.Yield, unit: d.YieldUnit}
			bl.ref = BaseRef{Kind: BaseRefRecipe, ID: d.RecipeID}
			bl.target = r.target(bl.ref, name, y, nil, 0)
		default: // keep: a plain line
			continue
		}
		r.baseAt[row.path] = bl
		if r.stepBase[row.recipeIdx] == nil {
			r.stepBase[row.recipeIdx] = map[string]*baseLine{}
		}
		if _, dup := r.stepBase[row.recipeIdx][bl.key]; !dup {
			r.stepBase[row.recipeIdx][bl.key] = bl
		}
	}
}

// stepBaseOf is the Base recipe line that a Step use named name stands for in Recipe i, or nil. Edge case: a Recipe with two
// Base recipe lines of one name (answered differently) gives its Step uses the first of them; a Step use names only the
// Ingredient, not the line, so the first answer wins.
func (r *review) stepBaseOf(i int, name string) *baseLine {
	if r.stepBase[i] == nil {
		return nil
	}
	return r.stepBase[i][units.NormalizeName(name)]
}

// target is the Base recipe Ingredient for ref, made once per ref: a placeholder id for a Base recipe the import writes
// (its units come from y), or the existing Ingredient (existing non-nil units).
func (r *review) target(ref BaseRef, name string, y yieldOf, existing *units.Ingredient, existingID int64) *baseTarget {
	key := fmt.Sprintf("%s|%d|%d|%s", ref.Kind, ref.ID, ref.Index, ref.Line)
	if r.targets == nil {
		r.targets = map[string]*baseTarget{}
		r.targetByID = map[int64]*baseTarget{}
		r.nextVirt = virtualBase
	}
	if t, ok := r.targets[key]; ok {
		return t
	}
	t := &baseTarget{ref: ref, name: name}
	if existing != nil {
		t.id, t.ing = existingID, *existing
	} else {
		r.nextVirt--
		t.id, t.ing = r.nextVirt, baseUnits(name, y)
	}
	r.targets[key] = t
	r.targetByID[t.id] = t
	return t
}

// baseUnits is the Base recipe Ingredient the store will create for a Yield: its Base Unit and its batch conversion
// (the Yield in Base Units, so a line in batch needs no unit prompt).
func baseUnits(name string, y yieldOf) units.Ingredient {
	base, _ := recipe.YieldBase(y.unit)
	out := units.Ingredient{Name: name, Base: base}
	if v, ok := recipe.YieldInBase(y.yield, y.unit); ok {
		out.Conversions = []units.Conversion{{Unit: "batch", ToBase: v}}
	}
	return out
}

// createYield is the Yield of a Base recipe created from a line: the line's amount and unit when its unit is in the
// g, ml or piece families; else 1 portion (the line then becomes 1 batch, §11.3).
func createYield(l Line) (float64, string) {
	if _, ok := recipe.YieldBase(l.Unit); ok {
		return l.Quantity, units.NormalizeUnit(l.Unit)
	}
	return 1, "portion"
}

// lineUnitOf is the unit a Base recipe line created from a line is written with.
func lineUnitOf(l Line, yieldUnit string) string {
	if units.NormalizeUnit(l.Unit) == yieldUnit {
		return l.Unit
	}
	if _, ok := recipe.YieldBase(l.Unit); ok {
		return l.Unit
	}
	return "batch"
}

// baseLineFor is the Base recipe line at path, or nil.
func (r *review) baseLineFor(path string) *baseLine { return r.baseAt[path] }

// baseLines is the tile list of the Plan: never nil, in document order.
func (r *review) baseLines() []BaseRecipeLine {
	out := []BaseRecipeLine{}
	for _, row := range r.baseRows {
		b := BaseRecipeLine{
			Path: row.path, Name: row.line.Ingredient, Quantity: row.line.Quantity, Unit: row.line.Unit,
			Suggestions: append([]BaseRecipeSuggestion{}, row.cands...), KeepIngredient: row.keep,
			Effective: row.effective, Resolved: row.resolved,
		}
		if row.line.Recipe != nil {
			b.Reference, b.Cue = row.line.Recipe.Name, row.line.Recipe.Cue
		}
		out = append(out, b)
	}
	return out
}

// baseCommits are the answered tiles, for the store.
func (r *review) baseCommits() []BaseRecipeLineCommit {
	var out []BaseRecipeLineCommit
	converted := map[int64]bool{}
	for _, row := range r.baseRows {
		if row.resolved && row.effective != nil {
			// One convert entry per Recipe (round 6): the first tile carries the answer; the others point at the Recipe too.
			if row.effective.Action == BaseConvert {
				if converted[row.effective.RecipeID] {
					continue
				}
				converted[row.effective.RecipeID] = true
			}
			out = append(out, BaseRecipeLineCommit{RecipeIndex: row.recipeIdx, Line: row.lineIdx, Path: row.path, Decision: *row.effective, TakeOver: r.takeOverFor(row.path)})
		}
	}
	return out
}

func (r *review) baseReady() bool {
	for _, row := range r.baseRows {
		if !row.resolved {
			return false
		}
	}
	for _, a := range r.takeOvers {
		if !a.Resolved {
			return false
		}
	}
	return true
}

func (r *review) checkBaseRecipes() {
	for i := range r.f.Recipes {
		if !r.kept[i] {
			continue
		}
		if r.asBase[i] && r.recipes[i].Action != ActionReplace {
			r.checkBaseName(fmt.Sprintf("$.recipes[%d].name", i), r.recipes[i].ImportedAs, false)
		}
		if r.asBase[i] && r.recipes[i].Action == ActionReplace && !r.baseRecipes[r.recipes[i].ExistingID] {
			r.problem(fmt.Sprintf("$.recipes[%d]", i), recipe.CodeBaseRecipeKind,
				"a plannable Recipe cannot be replaced by a Base recipe: keep both, or skip it")
		}
	}
	for _, bl := range r.creates() {
		in := recipe.Input{Name: bl.name, Yield: bl.yield.yield, YieldUnit: bl.yield.unit, BaseRecipe: boolPtr(true)}
		if _, err := in.Validate(func(int64) (units.Ingredient, bool) { return units.Ingredient{}, false }); err != nil {
			r.problem(bl.path, "invalid_recipe", err.Error())
		}
	}
}

// checkBaseUnits asks a unit prompt for every line of a Base recipe whose unit does not convert to its Ingredient's Base
// Unit (§3.3): the prompt is keyed by the line's name, like a plain Ingredient's, and one per unit. An answer is the
// conversion of that Ingredient; it is kept for the store (BaseConversions). It runs before the Recipes are validated.
func (r *review) checkBaseUnits() {
	for i, rec := range r.f.Recipes {
		if !r.kept[i] {
			continue
		}
		for j := range rec.Ingredients {
			if bl := r.baseLineFor(linePath(i, j)); bl != nil {
				r.baseUnit(bl, bl.unit, bl.path)
			}
		}
		for s, st := range rec.Steps {
			for u, use := range st.Uses {
				if sb := r.stepBaseOf(i, use.Ingredient); sb != nil {
					r.baseUnit(sb, use.Unit, fmt.Sprintf("$.recipes[%d].steps[%d].uses[%d]", i, s, u))
				}
			}
		}
	}
}

// baseUnit checks one unit of a Base recipe line against its target and asks the prompt if it does not convert.
func (r *review) baseUnit(bl *baseLine, unit, path string) {
	t := bl.target
	u := units.NormalizeUnit(unit)
	if units.IsConvertible(u, t.ing) {
		return
	}
	for k := range r.prompts {
		if r.prompts[k].Key == bl.key && r.prompts[k].Unit == u {
			r.prompts[k].UsedBy = append(r.prompts[k].UsedBy, path)
			return
		}
	}
	r.prompts = append(r.prompts, UnitPrompt{Key: bl.key, Ingredient: t.name, Unit: u, Base: string(t.ing.Base), UsedBy: []string{path}})
	idx := len(r.prompts) - 1
	ans := r.answerFor(bl.key, u)
	if ans == nil {
		return
	}
	conv := units.Conversion{Unit: u, ToBase: ans.ToBase}
	if err := units.ValidateConversion(t.ing.Base, conv); err != nil {
		r.problem(path, "invalid_conversion", conversionText(conv, t.ing.Base))
		return
	}
	t.ing.Conversions = append(t.ing.Conversions, conv)
	r.baseConvs = append(r.baseConvs, BaseConversion{Ref: bl.ref, Conversion: conv})
	toBase := ans.ToBase
	r.prompts[idx].Answered, r.prompts[idx].ToBase = true, &toBase
}

// createName is a create answer's Recipe name and the path of the answer that made it first.
type createName struct{ name, path string }

// sharedCreate is the path of the create answer that already makes a Base recipe of this name, if one does.
func (r *review) sharedCreate(name string) (string, bool) {
	for _, c := range r.createNames {
		if sameRecipeName(c.name, name) {
			return c.path, true
		}
	}
	return "", false
}

// creates are the Base recipes that create answers make, in document order: one per name, at its first answer.
func (r *review) creates() []*baseLine {
	var out []*baseLine
	for _, row := range r.baseRows {
		if bl := r.baseAt[row.path]; bl != nil && bl.create && bl.ref.Line == bl.path {
			out = append(out, bl)
		}
	}
	return out
}

func (r *review) checkBaseName(path, name string, create bool) bool {
	key := units.NormalizeName(name)
	ok := true
	if create {
		for j := range r.f.Recipes {
			if r.kept[j] && units.NormalizeName(r.recipes[j].ImportedAs) == key {
				ok = false
				r.problem(path, recipe.CodeBaseRecipeNameTaken, "a Recipe of this file already uses that name")
			}
		}
	}
	for _, e := range r.ex.Recipes {
		if units.NormalizeName(e.Name) != key {
			continue
		}
		ok = false
		switch {
		case r.baseRecipes[e.ID]:
			r.problem(path, recipe.CodeBaseRecipeNameTaken, "A Base recipe already uses that name")
		case e.ReadyMeal:
			r.problem(path, recipe.CodeReadyMealNameTaken, "A Ready Meal already uses that name")
		case create:
			r.problem(path, ProblemBaseRecipeAnswer, "a Recipe already has that name: use it, or give the new Base recipe another name")
		default:
			ok = true // a file Recipe of that name is settled by the Recipe conflict answers
		}
	}
	return ok
}

// buildTakeOvers asks, for every Base recipe the import creates whose name is held by a plain Ingredient that exists,
// whether to take that Ingredient over (P7 = B). Nothing is preselected. Where the Yield's unit does not convert to the
// plain Ingredient's Base Unit, only "keep apart" applies: it is in force already, with a same_name_ingredient warning.
// A name a Supply holds is never asked about: it is a supply_name_taken Problem.
func (r *review) buildTakeOvers() {
	r.takeOvers = []TakeOverAsk{}
	r.takeAnswer = map[string]bool{}
	type item struct {
		path, name string
		y          yieldOf
	}
	var items []item
	for i := range r.f.Recipes {
		if !r.kept[i] || !r.asBase[i] || r.recipes[i].Action == ActionReplace {
			continue
		}
		items = append(items, item{path: fmt.Sprintf("$.recipes[%d]", i), name: r.recipes[i].ImportedAs, y: r.baseYield[i]})
	}
	for _, bl := range r.creates() {
		items = append(items, item{path: bl.path, name: bl.name, y: bl.yield})
	}
	// A plannable Recipe turned into a Base recipe (convert) is asked about under its own name, once per Recipe: on the first
	// tile that answers convert to it.
	convertAsked := map[int64]bool{}
	for _, row := range r.baseRows {
		if !row.resolved || row.effective == nil || row.effective.Action != BaseConvert || convertAsked[row.effective.RecipeID] {
			continue
		}
		convertAsked[row.effective.RecipeID] = true
		for _, e := range r.ex.Recipes {
			if e.ID == row.effective.RecipeID {
				items = append(items, item{path: row.path, name: e.Name, y: yieldOf{yield: row.effective.Yield, unit: row.effective.YieldUnit}})
				break
			}
		}
	}
	for _, it := range items {
		key := units.NormalizeName(it.name)
		if r.supplyByKey[key] {
			// A Supply holds the name for good (ADR 0017): never a take-over ask. The User skips the Recipe, names the
			// created Base recipe otherwise, or converts another Recipe.
			r.problem(it.path, CodeSupplyNameTaken, fmt.Sprintf("%s is one of your Supplies", it.name))
			continue
		}
		plain, ok := r.existingByKey[key]
		if !ok {
			continue
		}
		base, _ := recipe.YieldBase(it.y.unit)
		convertible := base == plain.Base
		uses := r.ex.IngredientUses[plain.ID]
		recipes := append([]NamedRef{}, uses.Recipes...)
		ask := TakeOverAsk{
			Path: it.path, Name: it.name,
			Ingredient: ExistingRef{ID: plain.ID, Name: plain.Name, BaseUnit: string(plain.Base)},
			Recipes:    recipes, StockLots: uses.StockLots, Convertible: convertible,
		}
		answer, answered := r.d.TakeOvers[it.path]
		switch {
		case !convertible:
			keep := false
			ask.Answer, ask.Resolved = &keep, true
			r.takeAnswer[it.path] = false
			r.warn(it.path, WarnSameNameIngredient, fmt.Sprintf("A plain Ingredient named %s (%s) stays apart: %s is measured in %s",
				plain.Name, plain.Base, it.name, base))
		case answered:
			ask.Answer, ask.Resolved = &answer, true
			r.takeAnswer[it.path] = answer
		}
		r.takeOvers = append(r.takeOvers, ask)
	}
}

// takeOverFor is the answer of the take-over ask at path, or nil when there is none.
func (r *review) takeOverFor(path string) *bool {
	v, ok := r.takeAnswer[path]
	if !ok {
		return nil
	}
	return &v
}

// fileBase reports whether the file marks Recipe i as a Base recipe.
func (r *review) fileBase(i int) bool {
	rec := r.f.Recipes[i]
	return rec.BaseRecipe != nil && *rec.BaseRecipe
}

// isPlannable reports whether id is an existing Recipe that is not a Base recipe.
func (r *review) isPlannable(id int64) bool {
	if r.baseRecipes[id] {
		return false
	}
	for _, e := range r.ex.Recipes {
		if e.ID == id {
			return true
		}
	}
	return false
}

// isReadyMeal reports whether id is an existing Ready Meal.
func (r *review) isReadyMeal(id int64) bool {
	for _, e := range r.ex.Recipes {
		if e.ID == id {
			return e.ReadyMeal
		}
	}
	return false
}

// plainIngredient is the plain Ingredient of the line's name, kept as an alternative to the Base recipe ("Keep it as an
// Ingredient"). A Base recipe's own Ingredient is never it.
func (r *review) plainIngredient(name string) *ExistingRef {
	key := units.NormalizeName(name)
	for _, e := range r.ex.Ingredients {
		if r.baseIngs[e.ID] {
			continue
		}
		if units.NormalizeName(e.Name) == key {
			return &ExistingRef{ID: e.ID, Name: e.Name, BaseUnit: string(e.Base)}
		}
	}
	return nil
}

// orderBaseFirst orders the Recipes to write: each Base recipe after the Base recipes it calls for (a file Base recipe
// that calls another one comes after it), then the others. Within a group, file order. The review refuses every cycle, so
// a back edge here is a *recipe.CycleError, never a dropped edge: the write order would be wrong.
func orderBaseFirst(items []RecipeCommit) ([]RecipeCommit, error) {
	key := func(rc RecipeCommit) string {
		if rc.Index >= 0 {
			return fmt.Sprintf("file:%d", rc.Index)
		}
		return "line:" + rc.Line
	}
	byKey := map[string]int{}
	for k, rc := range items {
		byKey[key(rc)] = k
	}
	// deps are the items k must come after: the Base recipes its file answers call for (a kept line is no order).
	deps := func(k int) []int {
		rc := items[k]
		var out []int
		add := func(j int) {
			if j != k {
				out = append(out, j)
			}
		}
		addRef := func(b BaseRef) {
			var k string
			switch b.Kind {
			case BaseRefFile:
				k = fmt.Sprintf("file:%d", b.Index)
			case BaseRefLine:
				k = "line:" + b.Line
			default:
				return
			}
			if j, ok := byKey[k]; ok {
				add(j)
			}
		}
		for _, b := range rc.LineBases {
			addRef(b)
		}
		for _, us := range rc.UseBases {
			for _, b := range us {
				addRef(b)
			}
		}
		return out
	}
	state := make([]int, len(items)) // 0 unvisited, 1 on the stack, 2 done
	var stack []int
	var out []RecipeCommit
	var visit func(k int) error
	visit = func(k int) error {
		state[k] = 1
		stack = append(stack, k)
		for _, d := range deps(k) {
			switch state[d] {
			case 1:
				return cycleError(items, stack, d)
			case 0:
				if err := visit(d); err != nil {
					return err
				}
			}
		}
		stack = stack[:len(stack)-1]
		state[k] = 2
		out = append(out, items[k])
		return nil
	}
	for k, rc := range items {
		if rc.Input.IsBase() && state[k] == 0 {
			if err := visit(k); err != nil {
				return nil, err
			}
		}
	}
	for k := range items {
		if state[k] == 0 {
			if err := visit(k); err != nil {
				return nil, err
			}
		}
	}
	return out, nil
}

// cycleError is the cycle the stack holds from back (a Recipe already on it) to the top: a *recipe.CycleError whose path
// is the closed list of the Recipes' names.
func cycleError(items []RecipeCommit, stack []int, back int) error {
	pos := 0
	for stack[pos] != back {
		pos++
	}
	var path []string
	for _, k := range append(append([]int{}, stack[pos:]...), back) {
		path = append(path, items[k].Input.Name)
	}
	field := fmt.Sprintf("recipes[%d]", items[back].Index)
	if items[back].Index < 0 {
		field = items[back].Line
	}
	return &recipe.CycleError{Field: field, Path: path}
}

func boolPtr(b bool) *bool { return &b }

// baseDefinition gives a new file Base recipe's Ingredient the file's definition of its name: the Shelf Life and the
// picture (BaseImage keys into Commit.Images). The Base Unit comes from the Yield, as always.
func (r *review) baseDefinition(rc *RecipeCommit, key string) {
	for j, def := range r.f.Ingredients {
		if units.NormalizeName(def.Name) != key {
			continue
		}
		rc.BaseShelfLifeDays = def.ShelfLifeDays
		if p := fmt.Sprintf("$.ingredients[%d].image", j); r.hasImage(p) {
			rc.BaseImage = p
		}
		return
	}
}

// baseRecipeName is the name a Base recipe made from a line gets: its words, the first letter capitalised.
func baseRecipeName(ingredientName string) string {
	s := ingredient.DisplayName(ingredientName)
	r, n := utf8.DecodeRuneInString(s)
	if n == 0 {
		return s
	}
	return string(unicode.ToUpper(r)) + s[n:]
}
