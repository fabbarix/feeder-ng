package ingredient

import (
	"sort"
	"strings"

	"github.com/fabbarix/feeder-ng/internal/units"
)

// Candidate is an Ingredient as the matcher sees it.
type Candidate struct {
	ID   int64
	Name string
}

// Suggestion is a fuzzy match. Score is in (0,1]; higher is closer.
type Suggestion struct {
	ID    int64
	Name  string
	Score float64
}

// MinScore is the lowest Score that is offered as a Suggestion.
const MinScore = 0.6

// Result of a search: the Candidate whose normalised name equals the normalised
// query (nil when none), and fuzzy Suggestions (never containing the exact match).
type Result struct {
	Exact       *Candidate
	Suggestions []Suggestion
}

const (
	defaultLimit = 5
	// foldedEqualScore is the score when two names are equal once plurals are folded
	// and tokens are order-insensitive (tomatoes ~ tomato).
	foldedEqualScore = 0.95
	// containmentBase and containmentSpan score a name whose tokens are all inside a
	// longer name ("olive oil" in "extra virgin olive oil"); the more of the longer
	// name it covers, the higher.
	containmentBase = 0.6
	containmentSpan = 0.35
)

// Similarity compares two names after units.NormalizeName, 0..1 (1 = identical key).
// It combines edit-distance on the whole string, token-order-insensitive comparison,
// plural/singular folding per token (tomatoes~tomato, thighs~thigh, berries~berry),
// and token containment ("olive oil" inside "extra virgin olive oil").
func Similarity(a, b string) float64 {
	ka, kb := units.NormalizeName(a), units.NormalizeName(b)
	if ka == kb {
		return 1
	}
	if ka == "" || kb == "" {
		return 0
	}
	ta, tb := strings.Fields(ka), strings.Fields(kb)
	fa, fb := foldedSorted(ta), foldedSorted(tb)
	fsa, fsb := strings.Join(fa, " "), strings.Join(fb, " ")

	best := editScore(ka, kb)
	best = max(best, editScore(strings.Join(sortedCopy(ta), " "), strings.Join(sortedCopy(tb), " ")))
	if fsa == fsb {
		best = max(best, foldedEqualScore)
	} else {
		best = max(best, editScore(fsa, fsb))
	}
	if s, ok := containment(fa, fb); ok {
		best = max(best, s)
	}
	return min(best, 1)
}

// Search returns the exact match and up to limit Suggestions with Score >= MinScore,
// ordered by Score descending then Name ascending. limit <= 0 means 5. An empty or
// blank query returns an empty Result.
func Search(query string, candidates []Candidate, limit int) Result {
	qk := units.NormalizeName(query)
	if qk == "" {
		return Result{}
	}
	if limit <= 0 {
		limit = defaultLimit
	}
	var res Result
	var sugg []Suggestion
	for _, c := range candidates {
		if units.NormalizeName(c.Name) == qk {
			if res.Exact == nil {
				cc := c
				res.Exact = &cc
			}
			continue
		}
		if s := Similarity(query, c.Name); s >= MinScore {
			sugg = append(sugg, Suggestion{ID: c.ID, Name: c.Name, Score: s})
		}
	}
	sort.Slice(sugg, func(i, j int) bool {
		if sugg[i].Score != sugg[j].Score {
			return sugg[i].Score > sugg[j].Score
		}
		return sugg[i].Name < sugg[j].Name
	})
	if len(sugg) > limit {
		sugg = sugg[:limit]
	}
	res.Suggestions = sugg
	return res
}

// containment reports the score when every folded token of the shorter name is
// among the tokens of the longer one (and the names differ in length).
func containment(fa, fb []string) (float64, bool) {
	short, long := fa, fb
	if len(short) > len(long) {
		short, long = long, short
	}
	if len(short) == 0 || len(short) == len(long) {
		return 0, false
	}
	have := map[string]bool{}
	for _, t := range long {
		have[t] = true
	}
	for _, t := range short {
		if !have[t] {
			return 0, false
		}
	}
	return containmentBase + containmentSpan*float64(len(short))/float64(len(long)), true
}

// foldedSorted folds each token to its singular form and sorts the result.
func foldedSorted(tokens []string) []string {
	out := make([]string, len(tokens))
	for i, t := range tokens {
		out[i] = foldPlural(t)
	}
	sort.Strings(out)
	return out
}

func sortedCopy(tokens []string) []string {
	out := append([]string(nil), tokens...)
	sort.Strings(out)
	return out
}

// foldPlural maps a token to a rough singular: berries->berry, tomatoes->tomato,
// thighs->thigh. Short tokens and -ss words are left alone.
func foldPlural(t string) string {
	switch {
	case len(t) > 4 && strings.HasSuffix(t, "ies"):
		return t[:len(t)-3] + "y"
	case len(t) > 4 && strings.HasSuffix(t, "oes"):
		return t[:len(t)-2]
	case len(t) > 4 && (strings.HasSuffix(t, "ches") || strings.HasSuffix(t, "shes") || strings.HasSuffix(t, "xes")):
		return t[:len(t)-2]
	case len(t) > 3 && strings.HasSuffix(t, "s") && !strings.HasSuffix(t, "ss"):
		return t[:len(t)-1]
	}
	return t
}

// editScore is 1 minus the Levenshtein distance relative to the longer string.
func editScore(a, b string) float64 {
	ra, rb := []rune(a), []rune(b)
	n := max(len(ra), len(rb))
	if n == 0 {
		return 1
	}
	return 1 - float64(levenshtein(ra, rb))/float64(n)
}

func levenshtein(a, b []rune) int {
	prev := make([]int, len(b)+1)
	cur := make([]int, len(b)+1)
	for j := range prev {
		prev[j] = j
	}
	for i := 1; i <= len(a); i++ {
		cur[0] = i
		for j := 1; j <= len(b); j++ {
			cost := 1
			if a[i-1] == b[j-1] {
				cost = 0
			}
			cur[j] = min(prev[j]+1, cur[j-1]+1, prev[j-1]+cost)
		}
		prev, cur = cur, prev
	}
	return prev[len(b)]
}

// Score compares two names like Similarity but with accents folded first (béchamel = bechamel), 0..1. It is
// the one fuzzy score other packages reuse (Base recipe matching, BR-A); no copy of the matcher.
func Score(a, b string) float64 { return Similarity(FoldAccents(a), FoldAccents(b)) }

// FoldAccents lower-cases s and maps accented Latin letters to their base letters (béchamel -> bechamel).
func FoldAccents(s string) string { return accentFolder.Replace(strings.ToLower(s)) }

var accentFolder = strings.NewReplacer(
	"à", "a", "á", "a", "â", "a", "ã", "a", "ä", "a", "å", "a", "ā", "a", "ă", "a", "ą", "a",
	"ç", "c", "ć", "c", "ĉ", "c", "ċ", "c", "č", "c",
	"ď", "d", "đ", "d",
	"è", "e", "é", "e", "ê", "e", "ë", "e", "ē", "e", "ĕ", "e", "ė", "e", "ę", "e", "ě", "e",
	"ĝ", "g", "ğ", "g", "ġ", "g", "ģ", "g",
	"ĥ", "h", "ħ", "h",
	"ì", "i", "í", "i", "î", "i", "ï", "i", "ĩ", "i", "ī", "i", "ĭ", "i", "į", "i", "ı", "i",
	"ĵ", "j", "ķ", "k",
	"ĺ", "l", "ļ", "l", "ľ", "l", "ŀ", "l", "ł", "l",
	"ñ", "n", "ń", "n", "ņ", "n", "ň", "n",
	"ò", "o", "ó", "o", "ô", "o", "õ", "o", "ö", "o", "ø", "o", "ō", "o", "ŏ", "o", "ő", "o",
	"ŕ", "r", "ŗ", "r", "ř", "r",
	"ś", "s", "ŝ", "s", "ş", "s", "š", "s", "ß", "ss",
	"ţ", "t", "ť", "t", "ŧ", "t",
	"ù", "u", "ú", "u", "û", "u", "ü", "u", "ũ", "u", "ū", "u", "ŭ", "u", "ů", "u", "ű", "u", "ų", "u",
	"ŵ", "w", "ý", "y", "ÿ", "y", "ŷ", "y",
	"ź", "z", "ż", "z", "ž", "z",
	"æ", "ae", "œ", "oe",
)
