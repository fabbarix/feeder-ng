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
