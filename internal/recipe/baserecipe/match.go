package baserecipe

import (
	"sort"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// matchKey is the key names are compared by: units.NormalizeName, accents folded, a trailing plural "s" dropped.
func matchKey(name string) string {
	k := ingredient.FoldAccents(units.NormalizeName(name))
	if len(k) > 3 && strings.HasSuffix(k, "s") && !strings.HasSuffix(k, "ss") {
		k = k[:len(k)-1]
	}
	return k
}

// MatchReference ranks the candidates for a Reference (§4.5): a cue pick first, then exact key matches
// (units.NormalizeName, accents folded, a trailing plural "s" dropped), then fuzzy matches with
// ingredient.Score >= ingredient.MinScore; within each, Base recipes, then file Recipes, then plannable ones,
// then score descending, then name.
func MatchReference(ref Reference, candidates []RefCandidate) []Suggestion {
	key := matchKey(ref.Name)
	var out []Suggestion
	cue := cuePick(ref, candidates)
	if cue >= 0 {
		out = append(out, makeSuggestion(ref, key, candidates[cue], true))
	}
	if key == "" {
		return out
	}
	var exact, fuzzy []Suggestion
	for i, c := range candidates {
		if i == cue {
			continue
		}
		s := makeSuggestion(ref, key, c, false)
		switch {
		case s.Exact:
			exact = append(exact, s)
		case s.Score >= ingredient.MinScore:
			fuzzy = append(fuzzy, s)
		}
	}
	sort.SliceStable(exact, func(i, j int) bool {
		if gi, gj := kindRank(exact[i].Kind), kindRank(exact[j].Kind); gi != gj {
			return gi < gj
		}
		return exact[i].Name < exact[j].Name
	})
	sort.SliceStable(fuzzy, func(i, j int) bool {
		if gi, gj := kindRank(fuzzy[i].Kind), kindRank(fuzzy[j].Kind); gi != gj {
			return gi < gj
		}
		if fuzzy[i].Score != fuzzy[j].Score {
			return fuzzy[i].Score > fuzzy[j].Score
		}
		return fuzzy[i].Name < fuzzy[j].Name
	})
	out = append(out, exact...)
	return append(out, fuzzy...)
}

func makeSuggestion(ref Reference, key string, c RefCandidate, byCue bool) Suggestion {
	s := Suggestion{RefCandidate: c, ByCue: byCue}
	if key != "" && matchKey(c.Name) == key {
		s.Exact, s.Score = true, 1
	} else {
		s.Score = ingredient.Score(ref.Name, c.Name)
	}
	return s
}

func kindRank(kind string) int {
	switch kind {
	case KindBase:
		return 0
	case KindFile:
		return 1
	case KindPlannable:
		return 2
	}
	return 3
}

// cuePick returns the index of the candidate a "previous recipe" / "above" / "next recipe" cue picks, or -1.
func cuePick(ref Reference, candidates []RefCandidate) int {
	if ref.FileIndex < 0 {
		return -1
	}
	cue := strings.ToLower(ref.Cue)
	var target int
	switch {
	case strings.Contains(cue, "previous recipe") || strings.Contains(cue, "above"):
		target = ref.FileIndex - 1
	case strings.Contains(cue, "next recipe"):
		target = ref.FileIndex + 1
	default:
		return -1
	}
	for i, c := range candidates {
		if c.Kind == KindFile && c.FileIndex == target {
			return i
		}
	}
	return -1
}

// LinkCandidates lists the plain lines whose Ingredient name has the Base recipe's key (§3.8), ordered by
// Recipe name then line index. The Base recipe's own lines are left out. A line on a Recipe the Base recipe
// (transitively) calls for would make a cycle: listed with ReasonCycle (checked before the unit). A unit that
// does not convert for baseUnits is ReasonUnitUnconvertible. Archived Recipes are included.
func LinkCandidates(baseName string, baseRecipeID int64, lines []CandidateLine, graph map[int64][]int64, baseUnits units.Ingredient) []LinkCandidate {
	key := matchKey(baseName)
	if key == "" {
		return nil
	}
	calls := reachable(graph, baseRecipeID)
	var out []LinkCandidate
	for _, l := range lines {
		if l.RecipeID == baseRecipeID || matchKey(l.IngredientName) != key {
			continue
		}
		c := LinkCandidate{CandidateLine: l, Linkable: true}
		switch {
		case calls[l.RecipeID]:
			c.Linkable, c.Reason = false, ReasonCycle
		case !units.IsConvertible(l.Unit, baseUnits):
			c.Linkable, c.Reason = false, ReasonUnitUnconvertible
		}
		out = append(out, c)
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].RecipeName != out[j].RecipeName {
			return out[i].RecipeName < out[j].RecipeName
		}
		return out[i].LineIndex < out[j].LineIndex
	})
	return out
}

// PickerOrder orders the picker for a line on Recipe selfID whose Ingredient is named lineName (§3.7): the
// Base recipes group first, then the plannable group; within a group the exact name match, then close matches
// (score descending), then the rest by name. Archived Recipes and selfID are left out; a Recipe that reaches
// selfID in graph is listed disabled with ReasonCycle.
func PickerOrder(lineName string, selfID int64, recipes []PickerRecipe, graph map[int64][]int64) []PickerRow {
	key := matchKey(lineName)
	type keyed struct {
		row   PickerRow
		score float64
		tier  int // 0 exact, 1 close, 2 the rest
	}
	var rows []keyed
	for _, r := range recipes {
		if r.Archived || r.ID == selfID {
			continue
		}
		row := PickerRow{PickerRecipe: r, Group: GroupPlannable}
		if r.Base {
			row.Group = GroupBase
		}
		k := keyed{}
		if key != "" && matchKey(r.Name) == key {
			row.Exact = true
			k.score, k.tier = 1, 0
		} else {
			k.score = ingredient.Score(lineName, r.Name)
			k.tier = 2
			if k.score >= ingredient.MinScore {
				k.tier = 1
			}
		}
		if reachable(graph, r.ID)[selfID] {
			row.Disabled, row.Reason = true, ReasonCycle
		}
		k.row = row
		rows = append(rows, k)
	}
	sort.SliceStable(rows, func(i, j int) bool {
		a, b := rows[i], rows[j]
		if ga, gb := groupRank(a.row.Group), groupRank(b.row.Group); ga != gb {
			return ga < gb
		}
		if a.tier != b.tier {
			return a.tier < b.tier
		}
		if a.tier == 1 && a.score != b.score {
			return a.score > b.score
		}
		return a.row.Name < b.row.Name
	})
	out := make([]PickerRow, len(rows))
	for i, k := range rows {
		out[i] = k.row
	}
	return out
}

func groupRank(group string) int {
	if group == GroupBase {
		return 0
	}
	return 1
}
