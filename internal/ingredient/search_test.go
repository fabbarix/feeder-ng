package ingredient_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
)

var pantry = []ingredient.Candidate{
	{ID: 1, Name: "tomato"},
	{ID: 2, Name: "passata"},
	{ID: 3, Name: "chicken thighs"},
	{ID: 4, Name: "extra virgin olive oil"},
	{ID: 5, Name: "onion"},
	{ID: 6, Name: "red onion"},
	{ID: 7, Name: "strawberry"},
	{ID: 8, Name: "basmati rice"},
}

func ids(s []ingredient.Suggestion) []int64 {
	out := make([]int64, len(s))
	for i, x := range s {
		out[i] = x.ID
	}
	return out
}

func TestSearchExactIgnoresCaseAndWhitespace(t *testing.T) {
	for _, q := range []string{"onion", "ONION", "  Onion ", "chicken   thighs"} {
		r := ingredient.Search(q, pantry, 5)
		if r.Exact == nil {
			t.Errorf("Search(%q): no exact match", q)
		}
	}
	r := ingredient.Search("Chicken  Thighs", pantry, 5)
	if r.Exact == nil || r.Exact.ID != 3 {
		t.Errorf("exact = %+v, want id 3", r.Exact)
	}
	for _, s := range r.Suggestions {
		if s.ID == 3 {
			t.Error("the exact match must not be repeated among suggestions")
		}
	}
}

func TestSearchFuzzySuggestions(t *testing.T) {
	tests := []struct {
		query string
		first int64 // best suggestion
	}{
		{"tomatos", 1},        // typo
		{"tomatoes", 1},       // plural
		{"pasata", 2},         // missing letter
		{"chicken thigh", 3},  // singular
		{"thighs chicken", 3}, // word order
		{"olive oil", 4},      // contained in a longer name
		{"strawberries", 7},   // -ies / -y
		{"basmati", 8},        // token of a longer name
	}
	for _, tc := range tests {
		t.Run(tc.query, func(t *testing.T) {
			r := ingredient.Search(tc.query, pantry, 5)
			if r.Exact != nil {
				t.Fatalf("unexpected exact match %+v", r.Exact)
			}
			if len(r.Suggestions) == 0 || r.Suggestions[0].ID != tc.first {
				t.Fatalf("suggestions = %v, want first %d", ids(r.Suggestions), tc.first)
			}
			if s := r.Suggestions[0].Score; s < ingredient.MinScore || s > 1 {
				t.Errorf("score = %v, want within [%v, 1]", s, ingredient.MinScore)
			}
		})
	}
}

func TestSearchNoSuggestionForUnrelatedOrBlank(t *testing.T) {
	for _, q := range []string{"xyzzy", "zucchini", "", "   "} {
		r := ingredient.Search(q, pantry, 5)
		if r.Exact != nil || len(r.Suggestions) != 0 {
			t.Errorf("Search(%q) = %+v, want empty", q, r)
		}
	}
}

func TestSearchOrderingAndLimit(t *testing.T) {
	r := ingredient.Search("onions", pantry, 5)
	if len(r.Suggestions) < 2 || r.Suggestions[0].ID != 5 || r.Suggestions[1].ID != 6 {
		t.Fatalf("suggestions = %v, want onion (5) before red onion (6)", ids(r.Suggestions))
	}
	for i := 1; i < len(r.Suggestions); i++ {
		a, b := r.Suggestions[i-1], r.Suggestions[i]
		if a.Score < b.Score || (a.Score == b.Score && a.Name > b.Name) {
			t.Errorf("not ordered by score desc then name: %+v before %+v", a, b)
		}
	}
	if got := ingredient.Search("onions", pantry, 1); len(got.Suggestions) != 1 {
		t.Errorf("limit 1 returned %d suggestions", len(got.Suggestions))
	}
	if got := ingredient.Search("onions", nil, 5); got.Exact != nil || len(got.Suggestions) != 0 {
		t.Errorf("no candidates: %+v", got)
	}
}

func TestSimilarity(t *testing.T) {
	if got := ingredient.Similarity("Red  Onion", "red onion"); got != 1 {
		t.Errorf("identical keys = %v, want 1", got)
	}
	if got := ingredient.Similarity("onion", "onion"); got != 1 {
		t.Errorf("same = %v, want 1", got)
	}
	if got := ingredient.Similarity("onion", "chocolate"); got >= 0.3 {
		t.Errorf("unrelated = %v, want < 0.3", got)
	}
	if ab, ba := ingredient.Similarity("tomatoes", "tomato"), ingredient.Similarity("tomato", "tomatoes"); ab != ba || ab < ingredient.MinScore {
		t.Errorf("tomatoes~tomato = %v / %v, want symmetric and >= MinScore", ab, ba)
	}
}

func TestScoreFoldsAccents(t *testing.T) {
	for _, c := range [][2]string{{"béchamel", "bechamel"}, {"Crème fraîche", "creme fraiche"}, {"BÉCHAMEL", "bechamel"}} {
		if s := ingredient.Score(c[0], c[1]); s != 1 {
			t.Errorf("Score(%q, %q) = %v, want 1", c[0], c[1], s)
		}
	}
}

func TestScoreAgreesWithSimilarityOnPlainNames(t *testing.T) {
	for _, c := range [][2]string{{"tomatoes", "tomato"}, {"olive oil", "extra virgin olive oil"}, {"onion", "red onion"}, {"onion", "passata"}} {
		if got, want := ingredient.Score(c[0], c[1]), ingredient.Similarity(c[0], c[1]); got != want {
			t.Errorf("Score(%q, %q) = %v, Similarity = %v", c[0], c[1], got, want)
		}
	}
}

func TestScoreAccentsDoNotHideAMatch(t *testing.T) {
	if s := ingredient.Score("béchamels", "bechamel"); s < ingredient.MinScore {
		t.Errorf("plural and accent: score %v < MinScore", s)
	}
	if s := ingredient.Score("pâte brisée", "brisee pate"); s < 0.9 {
		t.Errorf("order-insensitive with accents: score %v", s)
	}
}

func TestScoreSymmetricAndUnrelatedIsLow(t *testing.T) {
	if a, b := ingredient.Score("béchamel sauce", "bechamel"), ingredient.Score("bechamel", "béchamel sauce"); a != b {
		t.Errorf("not symmetric: %v vs %v", a, b)
	}
	if s := ingredient.Score("béchamel", "chicken thighs"); s >= ingredient.MinScore {
		t.Errorf("unrelated scored %v", s)
	}
	if s := ingredient.Score("", "bechamel"); s != 0 {
		t.Errorf("empty scored %v", s)
	}
}
