package planner

import (
	"math"
	"testing"
)

func weightsClose(a, b Weights) bool {
	return approx(a.Favourite, b.Favourite) && approx(a.Dislike, b.Dislike) &&
		approx(a.PerishableUse, b.PerishableUse) && approx(a.IngredientOverlap, b.IngredientOverlap) &&
		approx(a.StockCoverage, b.StockCoverage) && approx(a.LeftoverFits, b.LeftoverFits) &&
		approx(a.LeftoverWasted, b.LeftoverWasted) && approx(a.Recency, b.Recency) && approx(a.Jitter, b.Jitter)
}

func TestWeightsFor(t *testing.T) {
	useWhatWeHave := Weights{Favourite: 2, Dislike: -2, PerishableUse: 6, IngredientOverlap: 3, StockCoverage: 2, LeftoverFits: 1, LeftoverWasted: -1, Recency: -0.25, Jitter: 0.5}
	middle := Weights{Favourite: 2, Dislike: -2, PerishableUse: 3, IngredientOverlap: 1.5, StockCoverage: 0.75, LeftoverFits: 1, LeftoverWasted: -1, Recency: -1, Jitter: 0.75}
	favourites := Weights{Favourite: 5, Dislike: -3, PerishableUse: 2, IngredientOverlap: 1, StockCoverage: 0.5, LeftoverFits: 1, LeftoverWasted: -1, Recency: -0.25, Jitter: 0.5}
	tests := []struct {
		name  string
		style float64
		want  Weights
	}{
		{"anchor Use what we have", 0, useWhatWeHave},
		{"middle anchor Variety is the default", 0.5, middle},
		{"anchor Favourites", 1, favourites},
		{"halfway to the middle interpolates", 0.25, Weights{Favourite: 2, Dislike: -2, PerishableUse: 4.5, IngredientOverlap: 2.25, StockCoverage: 1.375, LeftoverFits: 1, LeftoverWasted: -1, Recency: -0.625, Jitter: 0.625}},
		{"halfway to Favourites interpolates", 0.75, Weights{Favourite: 3.5, Dislike: -2.5, PerishableUse: 2.5, IngredientOverlap: 1.25, StockCoverage: 0.625, LeftoverFits: 1, LeftoverWasted: -1, Recency: -0.625, Jitter: 0.625}},
		{"below range clamps to 0", -3, useWhatWeHave},
		{"above range clamps to 1", 7, favourites},
		{"NaN means the middle", math.NaN(), middle},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := WeightsFor(tt.style); !weightsClose(got, tt.want) {
				t.Errorf("WeightsFor(%v) = %+v, want %+v", tt.style, got, tt.want)
			}
		})
	}
}

func TestWeightsForDirection(t *testing.T) {
	use, mid, fav := WeightsFor(0), WeightsFor(0.5), WeightsFor(1)
	if !(use.PerishableUse > mid.PerishableUse && mid.PerishableUse > fav.PerishableUse) {
		t.Errorf("perishable use should fall from Use what we have to Favourites: %v %v %v", use.PerishableUse, mid.PerishableUse, fav.PerishableUse)
	}
	if !(use.IngredientOverlap > mid.IngredientOverlap && use.StockCoverage > mid.StockCoverage) {
		t.Errorf("Use what we have must boost overlap and coverage")
	}
	if !(mid.Recency < use.Recency && mid.Recency < fav.Recency) {
		t.Errorf("Variety must have the strongest recency penalty: %v %v %v", use.Recency, mid.Recency, fav.Recency)
	}
	if !(mid.Jitter > use.Jitter && mid.Jitter > fav.Jitter) {
		t.Errorf("Variety must have the largest jitter: %v %v %v", use.Jitter, mid.Jitter, fav.Jitter)
	}
	if !(fav.Favourite >= mid.Favourite && mid.Favourite >= use.Favourite && fav.Favourite > use.Favourite) {
		t.Errorf("favourite weight should rise towards Favourites")
	}
}

func TestDefaultStyleIsVariety(t *testing.T) {
	if got, want := WeightsFor(0.5), WeightsFor(math.NaN()); !weightsClose(got, want) {
		t.Errorf("NaN must mean the middle: %+v vs %+v", got, want)
	}
	if got := WeightsFor(0.5); !approx(got.Recency, -1) || !approx(got.Jitter, 0.75) {
		t.Errorf("Variety leans into recency and jitter: %+v", got)
	}
}

func TestJitterFor(t *testing.T) {
	k := SlotKey{day(0), dinnerSlot}
	t.Run("deterministic", func(t *testing.T) {
		if JitterFor(42, k, 7, 0.5) != JitterFor(42, k, 7, 0.5) {
			t.Error("same arguments must give the same jitter")
		}
	})
	t.Run("within amplitude", func(t *testing.T) {
		for seed := int64(0); seed < 200; seed++ {
			for r := RecipeID(1); r <= 5; r++ {
				if j := JitterFor(seed, k, r, 0.5); j < -0.5 || j > 0.5 {
					t.Fatalf("jitter %v outside [-0.5, 0.5]", j)
				}
			}
		}
	})
	t.Run("zero amplitude is zero", func(t *testing.T) {
		if j := JitterFor(9, k, 3, 0); j != 0 {
			t.Errorf("got %v", j)
		}
	})
	t.Run("varies with seed, slot and recipe", func(t *testing.T) {
		seeds, slots, recipes := map[float64]bool{}, map[float64]bool{}, map[float64]bool{}
		for i := 0; i < 20; i++ {
			seeds[JitterFor(int64(i), k, 1, 0.5)] = true
			slots[JitterFor(1, SlotKey{day(i), dinnerSlot}, 1, 0.5)] = true
			recipes[JitterFor(1, k, RecipeID(i+1), 0.5)] = true
		}
		if len(seeds) < 10 || len(slots) < 10 || len(recipes) < 10 {
			t.Errorf("jitter barely varies: seeds %d slots %d recipes %d distinct of 20", len(seeds), len(slots), len(recipes))
		}
	})
}

func TestPortionsNeeded(t *testing.T) {
	tests := []struct {
		name string
		att  []Attendee
		want float64
	}{
		{"none", nil, 0},
		{"two adults", []Attendee{{1, 1}, {2, 1}}, 2},
		{"mixed factors", []Attendee{{1, 1}, {2, 0.5}, {3, 1.75}}, 3.25},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := PortionsNeeded(tt.att); !approx(got, tt.want) {
				t.Errorf("got %v want %v", got, tt.want)
			}
		})
	}
}

func TestBatchesFor(t *testing.T) {
	tests := []struct {
		name            string
		portions, yield float64
		want            int
	}{
		{"fewer portions than yield", 2, 4, 1},
		{"exact multiple", 4, 4, 1},
		{"just over", 4.25, 4, 2},
		{"three batches", 9, 4, 3},
		{"half portions", 5.5, 2, 3},
		{"float error does not add a batch", 0.9, 0.3, 3},
		{"ready meal pack of 2 for 3", 3, 2, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := BatchesFor(tt.portions, tt.yield); got != tt.want {
				t.Errorf("BatchesFor(%v, %v) = %d, want %d", tt.portions, tt.yield, got, tt.want)
			}
		})
	}
}
