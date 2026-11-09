package ingredient

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

// Similarity compares two names after units.NormalizeName, 0..1 (1 = identical key).
// It combines edit-distance on the whole string, token-order-insensitive comparison,
// plural/singular folding per token (tomatoes~tomato, thighs~thigh, berries~berry),
// and token containment ("olive oil" inside "extra virgin olive oil").
func Similarity(a, b string) float64 { panic("TODO") }

// Search returns the exact match and up to limit Suggestions with Score >= MinScore,
// ordered by Score descending then Name ascending. limit <= 0 means 5. An empty or
// blank query returns an empty Result.
func Search(query string, candidates []Candidate, limit int) Result { panic("TODO") }
