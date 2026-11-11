package cook

import "testing"

// Mirrors web/src/features/cook/lib/reheat.test.ts and reheat.recipe.test.ts.
func TestDefaultReheatSecondsFormula(t *testing.T) {
	cases := []struct {
		portions float64
		minutes  int
		want     int
	}{
		{1, 0, 120}, {2, 0, 180}, {4, 0, 300}, {9, 0, 600}, {40, 0, 600},
		{0, 0, 120}, {-3, 0, 120}, {1.5, 0, 180},
		{2, 5, 300}, {1, 1, 60}, {1, 4, 240}, {8, 4, 240}, {2, 15, 900}, {4, 45, 1800},
	}
	for _, c := range cases {
		if got := DefaultReheatSeconds(c.portions, c.minutes); got != c.want {
			t.Errorf("DefaultReheatSeconds(%v, %d) = %d, want %d", c.portions, c.minutes, got, c.want)
		}
	}
}
