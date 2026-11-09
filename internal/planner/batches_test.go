package planner

import "testing"

func attendees(factors ...float64) []Attendee {
	var out []Attendee
	for i, f := range factors {
		out = append(out, Attendee{MemberID: MemberID(i + 1), PortionFactor: f})
	}
	return out
}

// §7.2 step 4: Batches = ceil(portions / Yield); surplus becomes a pending Leftover with its Use-by.
func TestBatchesAndSurplus(t *testing.T) {
	tests := []struct {
		name        string
		att         []Attendee
		yield       float64
		opts        []recipeOpt
		slotDay     int
		wantBatches int
		wantSurplus float64 // 0 = nil
		wantUseBy   Date
	}{
		{name: "2 portions from a Yield of 4", att: attendees(1, 1), yield: 4, wantBatches: 1, wantSurplus: 2, wantUseBy: day(3)},
		{name: "exact fit leaves no surplus", att: attendees(1, 1, 1, 1), yield: 4, wantBatches: 1},
		{name: "5 portions need 2 Batches of 4", att: attendees(1, 1, 1, 1, 1), yield: 4, wantBatches: 2, wantSurplus: 3, wantUseBy: day(3)},
		{name: "fractional Portion Factors", att: attendees(1, 0.5, 1.75), yield: 2, wantBatches: 2, wantSurplus: 0.75, wantUseBy: day(3)},
		{name: "Recipe Use-by override", att: attendees(1, 1), yield: 4, opts: []recipeOpt{useByDays(5)}, wantBatches: 1, wantSurplus: 2, wantUseBy: day(5)},
		{name: "Use-by counts from the slot date", att: attendees(1, 1), yield: 4, slotDay: 2, wantBatches: 1, wantSurplus: 2, wantUseBy: day(5)},
		{name: "Yield larger than ever needed", att: attendees(1), yield: 6, wantBatches: 1, wantSurplus: 5, wantUseBy: day(3)},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := baseInput([]Slot{dinner(tt.slotDay, tt.att...)}, rcp(1, tt.yield, tt.opts...))
			p := placementAt(t, mustPlan(t, in), key(tt.slotDay))
			if p.Batches != tt.wantBatches {
				t.Errorf("Batches = %d, want %d", p.Batches, tt.wantBatches)
			}
			if !approx(p.Portions, PortionsNeeded(tt.att)) {
				t.Errorf("Portions = %v, want %v", p.Portions, PortionsNeeded(tt.att))
			}
			if tt.wantSurplus == 0 {
				if p.Surplus != nil {
					t.Errorf("Surplus = %+v, want nil", p.Surplus)
				}
				return
			}
			if p.Surplus == nil || !approx(p.Surplus.Portions, tt.wantSurplus) || p.Surplus.UseBy != tt.wantUseBy {
				t.Errorf("Surplus = %+v, want %v portions, Use-by %s", p.Surplus, tt.wantSurplus, tt.wantUseBy)
			}
		})
	}
}

func TestPlannedPurchases(t *testing.T) {
	chickenPack := func(size float64) map[IngredientID]Pack {
		return map[IngredientID]Pack{chicken: {ProductID: 5, Size: size}}
	}
	four := attendees(1, 1, 1, 1)
	tests := []struct {
		name  string
		att   []Attendee
		r     Recipe
		lots  []StockLot
		packs map[IngredientID]Pack
		want  []Purchase
	}{
		{
			name: "exact amount when no Product has been bought", r: rcp(1, 2, needs(need(chicken, 500))),
			want: []Purchase{{IngredientID: chicken, Shortfall: 500, Quantity: 500}},
		},
		{
			name: "rounded up to whole packs of the last-bought Product", att: four, r: rcp(1, 2, needs(need(chicken, 500))),
			lots: []StockLot{lot(1, chicken, 300, "")}, packs: chickenPack(500),
			// 2 Batches need 1000 g, Stock has 300 g: shortfall 700 g = 2 packs of 500 g.
			want: []Purchase{{IngredientID: chicken, ProductID: 5, Shortfall: 700, Packs: 2, PackSize: 500, Quantity: 1000}},
		},
		{
			name: "a pack bigger than the shortfall", r: rcp(1, 2, needs(need(chicken, 500))), packs: chickenPack(1000),
			want: []Purchase{{IngredientID: chicken, ProductID: 5, Shortfall: 500, Packs: 1, PackSize: 1000, Quantity: 1000}},
		},
		{
			name: "Stock covers it: no purchase", r: rcp(1, 2, needs(need(chicken, 500))),
			lots: []StockLot{lot(1, chicken, 500, "")}, packs: chickenPack(1000), want: nil,
		},
		{
			name: "optional lines are never bought", r: rcp(1, 2, needs(need(chicken, 500), optional(garlic, 10))),
			lots: []StockLot{lot(1, chicken, 500, "")}, want: nil,
		},
		{
			name: "a lot past its go-off date does not count", r: rcp(1, 2, needs(need(chicken, 500))),
			lots: []StockLot{lot(1, chicken, 600, day(-1))}, want: []Purchase{{IngredientID: chicken, Shortfall: 500, Quantity: 500}},
		},
		{
			name: "a lot going off on the slot date still counts", r: rcp(1, 2, needs(need(chicken, 500))),
			lots: []StockLot{lot(1, chicken, 500, day(0))}, want: nil,
		},
		{
			name: "a pack exactly equal to the shortfall adds no extra pack", r: rcp(1, 2, needs(need(chicken, 500))), packs: chickenPack(250),
			want: []Purchase{{IngredientID: chicken, ProductID: 5, Shortfall: 500, Packs: 2, PackSize: 250, Quantity: 500}},
		},
		{
			name: "one Purchase per short Ingredient", r: rcp(1, 2, needs(need(rice, 200), need(chicken, 500))),
			lots: []StockLot{lot(1, rice, 50, "")},
			want: []Purchase{{IngredientID: chicken, Shortfall: 500, Quantity: 500}, {IngredientID: rice, Shortfall: 150, Quantity: 150}},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			in := baseInput([]Slot{dinner(0, tt.att...)}, tt.r)
			in.Lots, in.Packs = tt.lots, tt.packs
			r := mustPlan(t, in)
			p := placementAt(t, r, key(0))
			if !equalPurchases(p.Purchases, tt.want) {
				t.Errorf("placement purchases = %+v, want %+v", p.Purchases, tt.want)
			}
			if !equalPurchases(r.Purchases, tt.want) {
				t.Errorf("result purchases = %+v, want %+v", r.Purchases, tt.want)
			}
		})
	}
}

func equalPurchases(a, b []Purchase) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		x, y := a[i], b[i]
		if x.IngredientID != y.IngredientID || x.ProductID != y.ProductID || x.Packs != y.Packs ||
			!approx(x.Shortfall, y.Shortfall) || !approx(x.PackSize, y.PackSize) || !approx(x.Quantity, y.Quantity) {
			return false
		}
	}
	return true
}

func TestProjectedStock(t *testing.T) {
	chickenRecipe := func(id RecipeID, q float64) Recipe { return rcp(id, 2, needs(need(chicken, q))) }
	rule := func(s Slot, id RecipeID) Slot { return withRules(s, SlotRule{RecipeID: id}) }

	t.Run("an earlier meal's consumption reduces what is available later", func(t *testing.T) {
		in := baseInput([]Slot{rule(dinner(0), 1), rule(dinner(1), 4)}, chickenRecipe(1, 500), chickenRecipe(4, 500))
		in.Lots = []StockLot{lot(1, chicken, 600, "")}
		r := mustPlan(t, in)
		if p := placementAt(t, r, key(0)); len(p.Purchases) != 0 {
			t.Errorf("day 0: %+v", p.Purchases)
		}
		want := []Purchase{{IngredientID: chicken, Shortfall: 400, Quantity: 400}}
		if p := placementAt(t, r, key(1)); !equalPurchases(p.Purchases, want) {
			t.Errorf("day 1 purchases = %+v, want %+v", p.Purchases, want)
		}
	})
	t.Run("lots are consumed soonest-to-go-off first", func(t *testing.T) {
		// A (300 g, goes off day 1) is used before B (300 g, never). Day 0 needs 400 g, day 3 needs 300 g:
		// B has 200 g left and A is gone, so day 3 is short by 100 g (not 300 g).
		in := baseInput([]Slot{rule(dinner(0), 1), rule(dinner(3), 4)}, chickenRecipe(1, 400), chickenRecipe(4, 300))
		in.Lots = []StockLot{lot(2, chicken, 300, ""), lot(1, chicken, 300, day(1))}
		r := mustPlan(t, in)
		want := []Purchase{{IngredientID: chicken, Shortfall: 100, Quantity: 100}}
		if p := placementAt(t, r, key(3)); !equalPurchases(p.Purchases, want) {
			t.Errorf("day 3 purchases = %+v, want %+v", p.Purchases, want)
		}
	})
	t.Run("pack remainders are reused and totals are aggregated per Ingredient", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{rule(dinner(0), 1), rule(dinner(1), 1), rule(dinner(2), 1)}, chickenRecipe(1, 500)))
		in.Packs = map[IngredientID]Pack{chicken: {ProductID: 5, Size: 1000}}
		r := mustPlan(t, in)
		if p := placementAt(t, r, key(0)); len(p.Purchases) != 1 || p.Purchases[0].Packs != 1 {
			t.Errorf("day 0: %+v", p.Purchases)
		}
		if p := placementAt(t, r, key(1)); len(p.Purchases) != 0 {
			t.Errorf("day 1 should use the remainder: %+v", p.Purchases)
		}
		if p := placementAt(t, r, key(2)); len(p.Purchases) != 1 || p.Purchases[0].Packs != 1 {
			t.Errorf("day 2 needs a second pack: %+v", p.Purchases)
		}
		want := []Purchase{{IngredientID: chicken, ProductID: 5, Shortfall: 1000, Packs: 2, PackSize: 1000, Quantity: 2000}}
		if !equalPurchases(r.Purchases, want) {
			t.Errorf("aggregate = %+v, want %+v", r.Purchases, want)
		}
	})
	t.Run("Pinned meals consume Stock and appear in the totals; Cooked meals do not", func(t *testing.T) {
		build := func(state MealState) Input {
			first := withExisting(dinner(0), ExistingMeal{State: state, RecipeID: 1, Batches: 1})
			in := weighted(baseInput([]Slot{first, dinner(1)}, chickenRecipe(1, 500), rcp(2, 2, needs(need(pasta, 200))), chickenRecipe(4, 500)), Weights{StockCoverage: 1})
			in.Lots = []StockLot{lot(1, chicken, 500, "")}
			return in
		}
		pinned := mustPlan(t, build(MealPinned))
		if p := placementAt(t, pinned, key(1)); p.RecipeID != 2 {
			t.Errorf("Pinned day 0 used the chicken: day 1 = %+v", p)
		}
		cooked := mustPlan(t, build(MealCooked))
		if p := placementAt(t, cooked, key(1)); p.RecipeID != 4 {
			t.Errorf("Cooked day 0 already left Stock, so the lot is still there: day 1 = %+v", p)
		}
	})
	t.Run("an explicit fraction of a Batch on a Pinned meal", func(t *testing.T) {
		pinned := withExisting(dinner(0), ExistingMeal{State: MealPinned, RecipeID: 1, Batches: 0.5})
		in := baseInput([]Slot{pinned}, chickenRecipe(1, 500))
		r := mustPlan(t, in)
		want := []Purchase{{IngredientID: chicken, Shortfall: 250, Quantity: 250}}
		if !equalPurchases(r.Purchases, want) {
			t.Errorf("purchases = %+v, want %+v", r.Purchases, want)
		}
	})
	t.Run("a pack shelf life limits how long its remainder is usable", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{rule(dinner(0), 1), rule(dinner(3), 1)}, chickenRecipe(1, 500)))
		in.Packs = map[IngredientID]Pack{chicken: {ProductID: 5, Size: 1000}}
		in.ShelfLifeDays = map[IngredientID]int{chicken: 2} // bought day 0, goes off day 2
		r := mustPlan(t, in)
		if p := placementAt(t, r, key(3)); len(p.Purchases) != 1 {
			t.Errorf("remainder is gone off by day 3, expected a new pack: %+v", p.Purchases)
		}
	})
}
