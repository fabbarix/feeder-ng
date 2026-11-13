package recipefile

import (
	"fmt"
	"sort"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// Base recipe tiles of Import Review (beta.6, BR-C; docs/dev/design/base-recipes.md §11.3, ADR 0015 P3 and P7).
//
// A tile is made for a line of a kept Recipe that the model marked as calling for another recipe (`recipe`), or whose
// Ingredient name matches a Recipe by name: an existing Base recipe, an existing plannable Recipe, or a Recipe of the
// same file. A marked line matches on the mark's name, close names included; an unmarked line matches on exact name
// only. Matching ignores case, accents and a plural "s". Only an exact match to a Base recipe (existing, or a Base
// recipe of the file) is preselected, and a Base recipe is preferred over a plain Ingredient of the same name. A
// preselected answer still needs the User's confirmation of the review.

// maxBaseYield bounds a Base recipe's Yield: an amount in its yield unit (1000 g must fit), not portions.
const maxBaseYield = 100000

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

// buildBaseRows builds the tiles of the kept Recipes, in document order, then checks the file's own answers for cycles.
func (r *review) buildBaseRows() {
	for i, rec := range r.f.Recipes {
		if !r.kept[i] {
			continue
		}
		for j, l := range rec.Ingredients {
			cands := r.baseCandidates(i, l)
			if l.Recipe == nil && len(cands) == 0 {
				continue
			}
			row := &baseRow{
				path:      fmt.Sprintf("$.recipes[%d].ingredients[%d]", i, j),
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
	r.checkBaseCycles()
}

// baseAnswer is the User's answer for the tile at path, if there is one.
func (r *review) baseAnswer(path string) (BaseRecipeLineDecision, bool) {
	d, ok := r.d.BaseRecipeLines[path]
	return d, ok
}

// baseCandidates are the Recipes a line may be, exact matches first, then Base recipes, Recipes of the file and
// plannable Recipes. The Recipe the line sits in is never a candidate: a Recipe does not call for itself.
func (r *review) baseCandidates(i int, l Line) []BaseRecipeSuggestion {
	name, marked := l.Ingredient, l.Recipe != nil
	if marked {
		name = l.Recipe.Name
	}
	key := refKey(name)
	own := refKey(r.f.Recipes[i].Name)
	match := func(candidate string) (exact, ok bool) {
		ck := refKey(candidate)
		if ck == key {
			return true, true
		}
		if !marked {
			return false, false
		}
		return false, ingredient.Similarity(key, ck) >= ingredient.MinScore
	}
	var out []BaseRecipeSuggestion
	for _, e := range r.ex.Recipes {
		if refKey(e.Name) == own || e.ReadyMeal {
			continue // a Ready Meal can never be a Base recipe (ADR 0015)
		}
		exact, ok := match(e.Name)
		if !ok {
			continue
		}
		kind := SuggestPlannable
		if r.baseRecipes[e.ID] {
			kind = SuggestBase
		}
		out = append(out, BaseRecipeSuggestion{Kind: kind, RecipeID: e.ID, Name: e.Name, Exact: exact})
	}
	for j, fr := range r.f.Recipes {
		if !r.kept[j] || j == i || refKey(fr.Name) == own || fr.ReadyMeal {
			continue
		}
		exact, ok := match(fr.Name)
		if !ok {
			continue
		}
		idx := j
		out = append(out, BaseRecipeSuggestion{Kind: SuggestFile, RecipeIndex: &idx, Name: fr.Name, Exact: exact})
	}
	sort.SliceStable(out, func(a, b int) bool {
		if out[a].Exact != out[b].Exact {
			return out[a].Exact
		}
		return kindRank(out[a].Kind) < kindRank(out[b].Kind)
	})
	return out
}

func kindRank(kind string) int {
	switch kind {
	case SuggestBase:
		return 0
	case SuggestFile:
		return 1
	}
	return 2
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

// checkBaseCycles reports every cycle that the file's own answers make: Recipes that call for each other through
// BaseFile answers. A Recipe calling for itself is a cycle of one.
func (r *review) checkBaseCycles() {
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
		if r.kept[i] && state[i] == 0 {
			visit(i)
		}
	}
}

func (r *review) cycleMessage(cycle []int) string {
	if len(cycle) == 2 {
		return fmt.Sprintf("%s cannot call for itself", r.f.Recipes[cycle[0]].Name)
	}
	// cycle starts and ends with the same Recipe: "A calls for B, which calls for A".
	msg := r.f.Recipes[cycle[0]].Name + " calls for " + r.f.Recipes[cycle[1]].Name
	for _, idx := range cycle[2:] {
		msg += ", which calls for " + r.f.Recipes[idx].Name
	}
	return msg
}

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
	for _, row := range r.baseRows {
		if row.resolved && row.effective != nil {
			out = append(out, BaseRecipeLineCommit{RecipeIndex: row.recipeIdx, Line: row.lineIdx, Decision: *row.effective})
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
	return true
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

// refKey is the name key for Base recipe matching: case, accents and a plural "s" ignored, words collapsed.
func refKey(s string) string {
	fields := strings.Fields(strings.Map(unaccent, strings.ToLower(s)))
	for k, t := range fields {
		if len(t) > 3 && strings.HasSuffix(t, "s") && !strings.HasSuffix(t, "ss") {
			fields[k] = t[:len(t)-1]
		}
	}
	return strings.Join(fields, " ")
}

var accentFold = map[rune]rune{
	'à': 'a', 'á': 'a', 'â': 'a', 'ä': 'a', 'ã': 'a', 'å': 'a',
	'è': 'e', 'é': 'e', 'ê': 'e', 'ë': 'e',
	'ì': 'i', 'í': 'i', 'î': 'i', 'ï': 'i',
	'ò': 'o', 'ó': 'o', 'ô': 'o', 'ö': 'o', 'õ': 'o',
	'ù': 'u', 'ú': 'u', 'û': 'u', 'ü': 'u',
	'ç': 'c', 'ñ': 'n',
}

func unaccent(r rune) rune {
	if f, ok := accentFold[r]; ok {
		return f
	}
	return r
}
