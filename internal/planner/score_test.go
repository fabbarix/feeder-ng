package planner

import "testing"

// Each test isolates ONE score term with Weights{...} and zero for the rest,
// so a placement's Score is exactly weight x share.

func TestScoreFavouriteAndDislike(t *testing.T) {
	recipes := []Recipe{rcp(1, 2), rcp(2, 2)}
	tests := []struct {
		name       string
		w          Weights
		prefs      map[MemberID]Preferences
		attendance []Attendee
		wantRecipe RecipeID
		wantScore  float64
	}{
		{"one Favourite", Weights{Favourite: 3}, map[MemberID]Preferences{anna: {Favourites: []RecipeID{2}}}, nil, 2, 3},
		{"two Members favour it", Weights{Favourite: 3}, map[MemberID]Preferences{anna: {Favourites: []RecipeID{2}}, ben: {Favourites: []RecipeID{2}}}, nil, 2, 6},
		{"Favourite of a Member who is not attending", Weights{Favourite: 3}, map[MemberID]Preferences{ben: {Favourites: []RecipeID{2}}}, []Attendee{{anna, 1}}, 1, 0},
		{"one Dislike steers away", Weights{Dislike: -2}, map[MemberID]Preferences{ben: {Dislikes: []RecipeID{1}}}, nil, 2, 0},
		{"Dislike of a Member who is not attending", Weights{Dislike: -2}, map[MemberID]Preferences{ben: {Dislikes: []RecipeID{1}}}, []Attendee{{anna, 1}}, 1, 0},
		{"Favourite and Dislike cancel partly", Weights{Favourite: 3, Dislike: -2}, map[MemberID]Preferences{anna: {Favourites: []RecipeID{2}}, ben: {Dislikes: []RecipeID{2}}}, nil, 2, 1},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := weighted(baseInput([]Slot{dinner(0, tt.attendance...)}, recipes...), tt.w)
			in.Members = tt.prefs
			p := placementAt(t, mustPlan(t, in), key(0))
			if p.RecipeID != tt.wantRecipe {
				t.Errorf("recipe = %d, want %d", p.RecipeID, tt.wantRecipe)
			}
			wantScore(t, p, tt.wantScore)
		})
	}

	t.Run("a Dislike does not exclude: it still appears when it is the only option", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2)), Weights{Dislike: -2})
		in = prefs(in, anna, Preferences{Dislikes: []RecipeID{1}})
		in.Members[ben] = Preferences{Dislikes: []RecipeID{1}}
		p := placementAt(t, mustPlan(t, in), key(0))
		wantScore(t, p, -4)
		if v := termValue(p, TermDislike); !approx(v, -4) {
			t.Errorf("dislike term = %v, want -4", v)
		}
	})
}

func TestScorePerishableUse(t *testing.T) {
	// Recipe 2 needs pasta 200 and spinach 300 per Batch. Share = mean over its two lines of
	// the fraction covered by at-risk lots (go off within 2 days of the slot).
	tests := []struct {
		name       string
		lots       []StockLot
		wantRecipe RecipeID
		wantScore  float64
	}{
		{"spinach goes off tomorrow and covers its line", []StockLot{lot(1, spinach, 300, day(1))}, 2, 2},
		{"half of the spinach line is covered", []StockLot{lot(1, spinach, 150, day(1))}, 2, 1},
		{"goes off on the slot date", []StockLot{lot(1, spinach, 300, day(0))}, 2, 2},
		{"window is inclusive: goes off in 2 days", []StockLot{lot(1, spinach, 300, day(2))}, 2, 2},
		{"outside the window: goes off in 3 days", []StockLot{lot(1, spinach, 300, day(3))}, 1, 0},
		{"a lot that never goes off is not perishable", []StockLot{lot(1, spinach, 300, "")}, 1, 0},
		{"already gone off before the slot", []StockLot{lot(1, spinach, 300, day(-1))}, 1, 0},
		{"two at-risk lots add up", []StockLot{lot(1, spinach, 100, day(0)), lot(2, spinach, 200, day(1))}, 2, 2},
		{"both lines at risk", []StockLot{lot(1, spinach, 300, day(1)), lot(2, pasta, 200, day(2))}, 2, 4},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := weighted(baseInput([]Slot{dinner(0)},
				rcp(1, 2, needs(need(chicken, 500))),
				rcp(2, 2, needs(need(pasta, 200), need(spinach, 300)))), Weights{PerishableUse: 4})
			in.Lots = tt.lots
			p := placementAt(t, mustPlan(t, in), key(0))
			if p.RecipeID != tt.wantRecipe {
				t.Errorf("recipe = %d, want %d", p.RecipeID, tt.wantRecipe)
			}
			wantScore(t, p, tt.wantScore)
		})
	}

	t.Run("needs grow with Batches", func(t *testing.T) {
		// 4 portions, Yield 2: 2 Batches need spinach 600; a 300 g at-risk lot covers half the line.
		four := []Attendee{{1, 1}, {2, 1}, {3, 1}, {4, 1}}
		in := weighted(baseInput([]Slot{dinner(0, four...)},
			rcp(1, 2, needs(need(chicken, 500))),
			rcp(2, 2, needs(need(spinach, 300)))), Weights{PerishableUse: 4})
		in.Lots = []StockLot{lot(1, spinach, 300, day(1))}
		p := placementAt(t, mustPlan(t, in), key(0))
		if p.RecipeID != 2 || p.Batches != 2 {
			t.Fatalf("got %+v", p)
		}
		wantScore(t, p, 2) // 4 x 0.5
	})
}

func TestScoreStockCoverage(t *testing.T) {
	tests := []struct {
		name       string
		recipe2    Recipe
		attendance []Attendee
		lots       []StockLot
		wantRecipe RecipeID
		wantScore  float64
	}{
		{
			name: "mean of the covered fractions over the lines", recipe2: rcp(2, 2, needs(need(pasta, 200), need(spinach, 300))),
			lots: []StockLot{lot(1, pasta, 200, ""), lot(2, spinach, 150, "")}, wantRecipe: 2, wantScore: 0.75,
		},
		{
			name: "fractions are capped at 1", recipe2: rcp(2, 2, needs(need(pasta, 200), need(spinach, 300))),
			lots: []StockLot{lot(1, pasta, 900, "")}, wantRecipe: 2, wantScore: 0.5,
		},
		{
			name: "several lots of one Ingredient add up", recipe2: rcp(2, 2, needs(need(pasta, 200))),
			lots: []StockLot{lot(1, pasta, 50, ""), lot(2, pasta, 150, day(5))}, wantRecipe: 2, wantScore: 1,
		},
		{
			name: "needs grow with Batches", recipe2: rcp(2, 2, needs(need(pasta, 200), need(spinach, 300))),
			attendance: []Attendee{{1, 1}, {2, 1}, {3, 1}, {4, 1}},
			lots:       []StockLot{lot(1, pasta, 200, ""), lot(2, spinach, 150, "")}, wantRecipe: 2, wantScore: 0.375,
		},
		{
			name: "lots that have gone off do not count", recipe2: rcp(2, 2, needs(need(pasta, 200))),
			lots: []StockLot{lot(1, pasta, 200, day(-1))}, wantRecipe: 1, wantScore: 0,
		},
		{
			name: "optional lines are not part of the share", recipe2: rcp(2, 2, needs(need(pasta, 200), optional(garlic, 10))),
			lots: []StockLot{lot(1, garlic, 10, "")}, wantRecipe: 1, wantScore: 0,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := weighted(baseInput([]Slot{dinner(0, tt.attendance...)}, rcp(1, 2, needs(need(chicken, 500))), tt.recipe2), Weights{StockCoverage: 1})
			in.Lots = tt.lots
			p := placementAt(t, mustPlan(t, in), key(0))
			if p.RecipeID != tt.wantRecipe {
				t.Errorf("recipe = %d, want %d", p.RecipeID, tt.wantRecipe)
			}
			wantScore(t, p, tt.wantScore)
		})
	}
}

func TestScoreIngredientOverlap(t *testing.T) {
	// Day 0 is claimed by a Slot Rule for Recipe 1 (chicken 500). With a last-bought chicken pack of
	// 1000 g, the 500 g remainder is a "pack remainder". Day 1: Recipe 4 uses chicken 500 again; Recipe 2 doesn't.
	recipes := []Recipe{
		rcp(1, 2, needs(need(chicken, 500))),
		rcp(2, 2, needs(need(pasta, 200))),
		rcp(4, 2, needs(need(chicken, 500))),
	}
	pack := map[IngredientID]Pack{chicken: {ProductID: 5, Size: 1000}}
	build := func(slots []Slot) Input {
		return weighted(baseInput(slots, recipes...), Weights{IngredientOverlap: 2})
	}
	rule1 := withRules(dinner(0), SlotRule{RecipeID: 1})

	t.Run("a pack remainder planned earlier is reused", func(t *testing.T) {
		in := build([]Slot{rule1, dinner(1)})
		in.Packs = pack
		p := placementAt(t, mustPlan(t, in), key(1))
		if p.RecipeID != 4 {
			t.Fatalf("recipe = %d, want 4", p.RecipeID)
		}
		wantScore(t, p, 2)
		if len(p.Purchases) != 0 {
			t.Errorf("the remainder covers the need, no new purchase: %+v", p.Purchases)
		}
	})
	t.Run("with no Product bought there is no pack remainder", func(t *testing.T) {
		in := build([]Slot{rule1, dinner(1)})
		p := placementAt(t, mustPlan(t, in), key(1))
		if p.RecipeID != 2 {
			t.Errorf("recipe = %d, want 2 (tie, lowest id)", p.RecipeID)
		}
		wantScore(t, p, 0)
	})
	t.Run("plain Stock is not an Ingredient Overlap", func(t *testing.T) {
		in := build([]Slot{dinner(1)})
		in.Packs = pack
		in.Lots = []StockLot{lot(1, chicken, 500, "")}
		p := placementAt(t, mustPlan(t, in), key(1))
		if p.RecipeID != 1 {
			t.Errorf("recipe = %d, want 1 (no overlap anywhere, lowest id)", p.RecipeID)
		}
		wantScore(t, p, 0)
	})
	t.Run("a remainder that goes off before the slot does not count", func(t *testing.T) {
		in := build([]Slot{rule1, dinner(3)})
		in.Packs = pack
		in.ShelfLifeDays = map[IngredientID]int{chicken: 1} // bought day 0, goes off day 1
		if p := placementAt(t, mustPlan(t, in), key(3)); p.RecipeID != 2 {
			t.Errorf("recipe = %d, want 2", p.RecipeID)
		}
	})
	t.Run("a remainder within its shelf life still counts", func(t *testing.T) {
		in := build([]Slot{rule1, dinner(3)})
		in.Packs = pack
		in.ShelfLifeDays = map[IngredientID]int{chicken: 10}
		if p := placementAt(t, mustPlan(t, in), key(3)); p.RecipeID != 4 {
			t.Errorf("recipe = %d, want 4", p.RecipeID)
		}
	})
	t.Run("overlap is part of stock coverage too", func(t *testing.T) {
		in := weighted(baseInput([]Slot{rule1, dinner(1)}, recipes...), Weights{StockCoverage: 1})
		in.Packs = pack
		p := placementAt(t, mustPlan(t, in), key(1))
		if p.RecipeID != 4 {
			t.Errorf("recipe = %d, want 4", p.RecipeID)
		}
		wantScore(t, p, 1)
	})
}

func TestScoreNewLeftover(t *testing.T) {
	// Recipe 1 Yield 4 -> extra portions 2 for a 2-portion slot; Recipe 3 Yield 3 -> extra portions 1; Recipe 2 Yield 2 -> none.
	// Recipe 2 is kept out of day 0 with a recent LastPlanned.
	w := Weights{LeftoverFits: 1, LeftoverWasted: -1}
	recipes := func(r1 ...recipeOpt) []Recipe {
		return []Recipe{rcp(1, 4, r1...), rcp(2, 2)}
	}
	recent := map[RecipeID]Date{2: day(-1)}

	t.Run("extra portions that fits a later slot scores +1", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0), dinner(1)}, rcp(1, 4), rcp(2, 2), rcp(3, 3)), w)
		p := placementAt(t, mustPlan(t, in), key(0))
		if p.RecipeID != 1 {
			t.Fatalf("recipe = %d, want 1", p.RecipeID)
		}
		wantScore(t, p, 1)
		if p.NewLeftover == nil || p.NewLeftover.Portions != 2 || p.NewLeftover.UseBy != day(3) {
			t.Errorf("extra portions = %+v", p.NewLeftover)
		}
	})
	t.Run("extra portions too small for any later slot is wasted", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0), dinner(1)}, rcp(3, 3)), w)
		p := placementAt(t, mustPlan(t, in), key(0))
		wantScore(t, p, -1)
		if p.NewLeftover == nil || p.NewLeftover.Portions != 1 {
			t.Errorf("extra portions = %+v", p.NewLeftover)
		}
	})
	t.Run("no extra portions is neutral", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(2, 2)), w)
		p := placementAt(t, mustPlan(t, in), key(0))
		wantScore(t, p, 0)
		if p.NewLeftover != nil {
			t.Errorf("extra portions = %+v, want nil", p.NewLeftover)
		}
	})

	cases := []struct {
		name  string
		slots []Slot
		r1    []recipeOpt
		extra func(in *Input)
		want  float64
	}{
		{name: "last slot of the horizon", slots: []Slot{dinner(0)}, want: -1},
		{name: "next slot is after the Use-by", slots: []Slot{dinner(0), dinner(1)}, r1: []recipeOpt{useByDays(0)}, want: -1},
		{name: "next slot is on the Use-by date", slots: []Slot{dinner(0), dinner(1)}, r1: []recipeOpt{useByDays(1)}, want: 1},
		{
			name: "next slot's Members exclude the Recipe", slots: []Slot{dinner(0), dinner(1, Attendee{carl, 1}, Attendee{ben, 1})},
			extra: func(in *Input) { in.Members = map[MemberID]Preferences{carl: {ExcludedRecipes: []RecipeID{1}}} }, want: -1,
		},
		{
			name: "next slot's Members exclude an Ingredient of the Recipe", slots: []Slot{dinner(0), dinner(1, Attendee{carl, 1}, Attendee{ben, 1})},
			r1: []recipeOpt{needs(need(chicken, 500))},
			extra: func(in *Input) {
				in.Members = map[MemberID]Preferences{carl: {ExcludedIngredients: []IngredientID{chicken}}}
			}, want: -1,
		},
		{
			name: "next slot is claimed by a Slot Rule", slots: []Slot{dinner(0), withRules(dinner(1), SlotRule{RecipeID: 2})}, want: -1,
		},
		{
			name: "next slot is claimed by a Slot Rule the Recipe satisfies", slots: []Slot{dinner(0), withRules(dinner(1), SlotRule{RecipeID: 1})}, want: 1,
		},
		{
			name:  "next slot is already Pinned",
			slots: []Slot{dinner(0), withExisting(dinner(1), ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})}, want: -1,
		},
		{
			name: "next slot needs more portions than the extra portions", slots: []Slot{dinner(0), dinner(1, Attendee{1, 1}, Attendee{2, 1}, Attendee{3, 1})}, want: -1,
		},
		{
			name: "a later slot after an unfit one still fits", slots: []Slot{dinner(0), dinner(1, Attendee{1, 1}, Attendee{2, 1}, Attendee{3, 1}), dinner(2)}, want: 1,
		},
	}
	for _, tt := range cases {
		t.Run(tt.name, func(t *testing.T) {
			in := weighted(baseInput(tt.slots, recipes(tt.r1...)...), w)
			in.LastPlanned = recent
			if tt.extra != nil {
				tt.extra(&in)
			}
			p := placementAt(t, mustPlan(t, in), key(0))
			if p.RecipeID != 1 {
				t.Fatalf("recipe = %d, want 1", p.RecipeID)
			}
			wantScore(t, p, tt.want)
		})
	}
}

func TestScoreRecency(t *testing.T) {
	// recentness = 1 - daysSince/28 (0 when never or >= 28 days); term = -0.5 x recentness.
	tests := []struct {
		name       string
		last       map[RecipeID]Date
		wantRecipe RecipeID
		wantScore  float64
	}{
		{"never cooked ties with a long time ago", map[RecipeID]Date{2: day(-60)}, 1, 0},
		{"the less recently cooked Recipe wins", map[RecipeID]Date{1: day(-7), 2: day(-14)}, 2, -0.25},
		{"14 days ago is half recent", map[RecipeID]Date{1: day(-14)}, 2, 0},
		{"28 days ago is not recent at all", map[RecipeID]Date{1: day(-28), 2: day(-1)}, 1, 0},
		{"yesterday is nearly maximal", map[RecipeID]Date{1: day(-1), 2: day(-1)}, 1, -0.5 * (1 - 1.0/28)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := noCooldown(weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2)), Weights{Recency: -0.5}))
			in.LastPlanned = tt.last
			p := placementAt(t, mustPlan(t, in), key(0))
			if p.RecipeID != tt.wantRecipe {
				t.Errorf("recipe = %d, want %d", p.RecipeID, tt.wantRecipe)
			}
			wantScore(t, p, tt.wantScore)
		})
	}
	t.Run("a Recipe planned earlier in the run counts as recent", func(t *testing.T) {
		in := noCooldown(weighted(baseInput([]Slot{dinner(0), dinner(1)}, rcp(1, 2), rcp(2, 2)), Weights{Recency: -0.5}))
		r := mustPlan(t, in)
		if got := placementAt(t, r, key(1)).RecipeID; got != 2 {
			t.Errorf("day 1 = %d, want 2", got)
		}
	})
}

func TestJitterInPlanning(t *testing.T) {
	many := func() []Recipe {
		var rs []Recipe
		for i := 1; i <= 12; i++ {
			rs = append(rs, rcp(RecipeID(i), 2))
		}
		return rs
	}
	build := func(seed int64) Input {
		in := weighted(baseInput([]Slot{dinner(0), dinner(1), dinner(2)}, many()...), Weights{Jitter: 0.5})
		in.Seed = seed
		return in
	}
	t.Run("the jitter term stays within the amplitude", func(t *testing.T) {
		for seed := int64(1); seed <= 20; seed++ {
			p := placementAt(t, mustPlan(t, build(seed)), key(0))
			if p.Score < -0.5 || p.Score > 0.5 {
				t.Fatalf("seed %d: score %v outside the jitter amplitude", seed, p.Score)
			}
		}
	})
	t.Run("same seed, same plan", func(t *testing.T) {
		a, b := mustPlan(t, build(7)), mustPlan(t, build(7))
		if !equalResults(a, b) {
			t.Errorf("not deterministic:\n%+v\n%+v", a, b)
		}
	})
	t.Run("different seeds give different plans", func(t *testing.T) {
		seen := map[string]bool{}
		for seed := int64(1); seed <= 15; seed++ {
			seen[planSignature(mustPlan(t, build(seed)))] = true
		}
		if len(seen) < 5 {
			t.Errorf("only %d distinct plans across 15 seeds", len(seen))
		}
	})
	t.Run("a zero Jitter weight means no jitter: the lowest id wins", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, many()...)
		in.Seed = 99
		if p := placementAt(t, mustPlan(t, in), key(0)); p.RecipeID != 1 {
			t.Errorf("recipe = %d", p.RecipeID)
		}
	})
}
