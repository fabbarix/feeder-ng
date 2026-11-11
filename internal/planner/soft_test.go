package planner

import (
	"reflect"
	"strings"
	"testing"
	"time"
)

// Soft Cool-down and Variety Rules, the relaxed pick (ADR 0009, spec 7.2 step 2b, crs-plan 2.3 team B).
// Zero weights unless a case says otherwise, so the relaxed order's last two keys are the only tie-breakers
// and each case is built so that the lowest Recipe id is NOT the expected winner unless it is the id key.

func TestRelaxedPickFillsACellThatCoolDownWouldHaveLeftEmpty(t *testing.T) {
	in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2))
	in.LastPlanned = map[RecipeID]Date{1: day(-1), 2: day(-2)}
	r := mustPlan(t, in)
	if len(r.Unfilled) != 0 {
		t.Fatalf("Unfilled = %+v, Cool-down never leaves a Course empty", r.Unfilled)
	}
	p := placementAt(t, r, key(0))
	if p.RecipeID != 2 || !p.Relaxed {
		t.Fatalf("placement = %+v, want a relaxed pick of Recipe 2 (the longest gap)", p)
	}
	chip := wantRelaxedChip(t, p.Why, ReasonCooldownRelaxed)
	if chip.Date != day(-2) || chip.RecipeID != 2 {
		t.Errorf("chip = %+v, want the nearest fresh cook %s of Recipe 2", chip, day(-2))
	}
}

func TestRelaxedPickIsPlacedLikeAnyOtherAndCountsForLaterCells(t *testing.T) {
	in := baseInput([]Slot{dinner(0), dinner(1)}, rcp(1, 2), rcp(2, 2))
	in.LastPlanned = map[RecipeID]Date{1: day(-1), 2: day(-2)}
	// Day 0: gaps are 1 and 2, so Recipe 2. Day 1: Recipe 2 was just cooked (gap 1), Recipe 1's gap is 2.
	if got := planSignature(mustPlan(t, in)); got != "2,1" {
		t.Errorf("plan = %s, want 2,1", got)
	}
}

func TestRelaxedOrder(t *testing.T) {
	fish := VarietyRule{Tag: "fish", MaxPerWeek: 1}
	meat := VarietyRule{Tag: "meat", MaxPerWeek: 1}
	pinnedOn := func(n int, id RecipeID) Slot { return withExisting(dinner(n), pinnedMeal(id)) }
	tests := []struct {
		name  string
		build func() Input
		want  RecipeID
		chip  ReasonCode
		check func(t *testing.T, chip Why)
	}{
		{
			name: "1. a Recipe not reserved for a later Slot Rule cell comes before a reserved one",
			build: func() Input {
				// Recipe 1 is outside its Cool-down but reserved for Wednesday's rule; Recipe 2 is inside its Cool-down.
				in := baseInput([]Slot{dinner(0), withRules(dinner(2), SlotRule{RecipeID: 1})}, rcp(1, 2), rcp(2, 2))
				in.LastPlanned = map[RecipeID]Date{2: day(-1)}
				return in
			},
			want: 2, chip: ReasonCooldownRelaxed,
		},
		{
			name: "2. outside its Cool-down (only a Variety Rule in the way) before inside it",
			build: func() Input {
				in := baseInput([]Slot{dinner(0), pinnedOn(1, 9)}, rcp(1, 2), rcp(2, 2, tags("fish")), rcp(9, 2, tags("fish"), archived()))
				in.LastPlanned = map[RecipeID]Date{1: day(-3)}
				in.VarietyRules = []VarietyRule{fish}
				return in
			},
			want: 2, chip: ReasonVarietyRelaxed,
			check: func(t *testing.T, c Why) {
				if c.Tag != "fish" || c.Value != 2 {
					t.Errorf("chip = %+v, want fish and the 2nd this week", c)
				}
			},
		},
		{
			name: "3. inside Cool-down: the longest gap to the nearest fresh cook",
			build: func() Input {
				in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2), rcp(3, 2))
				in.LastPlanned = map[RecipeID]Date{1: day(-1), 2: day(-3), 3: day(-2)}
				return in
			},
			want: 2, chip: ReasonCooldownRelaxed,
		},
		{
			name: "3. the nearest cook is the one that counts, before or after: a later cook can be nearer",
			build: func() Input {
				// Recipe 1: cooked 5 days before, but also Pinned the day after (nearest 1). Recipe 2: 2 days before.
				in := baseInput([]Slot{dinner(0), pinnedOn(1, 1)}, rcp(1, 2), rcp(2, 2))
				in.LastPlanned = map[RecipeID]Date{1: day(-5), 2: day(-2)}
				return in
			},
			want: 2, chip: ReasonCooldownRelaxed,
			check: func(t *testing.T, c Why) {
				if c.Date != day(-2) {
					t.Errorf("chip date = %s, want %s", c.Date, day(-2))
				}
			},
		},
		{
			name: "3. a cook after the cell can be the longest gap, and the chip names it",
			build: func() Input {
				in := baseInput([]Slot{dinner(0), pinnedOn(2, 2)}, rcp(1, 2), rcp(2, 2))
				in.LastPlanned = map[RecipeID]Date{1: day(-1)}
				return in
			},
			want: 2, chip: ReasonCooldownRelaxed,
			check: func(t *testing.T, c Why) {
				if c.Date != day(2) {
					t.Errorf("chip date = %s, want the later cook %s", c.Date, day(2))
				}
			},
		},
		{
			name: "3. then the fewest days of its Cool-down left",
			build: func() Input {
				in := baseInput([]Slot{dinner(0)}, rcp(1, 2, cooldown(10)), rcp(2, 2, cooldown(4)))
				in.LastPlanned = map[RecipeID]Date{1: day(-2), 2: day(-2)}
				return in
			},
			want: 2, chip: ReasonCooldownRelaxed,
		},
		{
			name: "4. the fewest Variety Rules broken",
			build: func() Input {
				in := baseInput([]Slot{dinner(0), pinnedOn(1, 9)}, rcp(1, 2, tags("fish", "meat")), rcp(2, 2, tags("fish")), rcp(9, 2, tags("fish", "meat"), archived()))
				in.VarietyRules = []VarietyRule{fish, meat}
				return in
			},
			want: 2, chip: ReasonVarietyRelaxed,
		},
		{
			name: "5. the highest score",
			build: func() Input {
				in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2)), Weights{Favourite: 2})
				in = prefs(in, anna, Preferences{Favourites: []RecipeID{2}})
				in.LastPlanned = map[RecipeID]Date{1: day(-1), 2: day(-1)}
				return in
			},
			want: 2, chip: ReasonCooldownRelaxed,
		},
		{
			name: "6. the lowest Recipe id",
			build: func() Input {
				in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2), rcp(3, 2))
				in.LastPlanned = map[RecipeID]Date{1: day(-1), 2: day(-1), 3: day(-1)}
				return in
			},
			want: 1, chip: ReasonCooldownRelaxed,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := mustPlan(t, tt.build())
			p := placementAt(t, r, key(0))
			if p.RecipeID != tt.want || !p.Relaxed {
				t.Fatalf("placement = Recipe %d relaxed=%v, want a relaxed pick of Recipe %d", p.RecipeID, p.Relaxed, tt.want)
			}
			chip := wantRelaxedChip(t, p.Why, tt.chip)
			if tt.check != nil {
				tt.check(t, chip)
			}
		})
	}
	t.Run("1. the reserved Recipe still gets its own cell, as a strict pick", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0), withRules(dinner(2), SlotRule{RecipeID: 1})}, rcp(1, 2), rcp(2, 2))
		in.LastPlanned = map[RecipeID]Date{2: day(-1)}
		if p := placementAt(t, mustPlan(t, in), key(2)); p.RecipeID != 1 || p.Relaxed {
			t.Errorf("Wednesday = %+v", p)
		}
	})
	t.Run("a reserved Recipe is the last resort: used when it is the only one left", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0), withRules(dinner(2), SlotRule{RecipeID: 1})}, rcp(1, 2))
		r := mustPlan(t, in)
		p := placementAt(t, r, key(0))
		if p.RecipeID != 1 {
			t.Fatalf("Monday = %+v, want the reserved Recipe: nothing else exists", p)
		}
		// Giving up a reservation breaks no rule the Household sees: it is an ordinary pick. The rule's own cell
		// is the one that comes round sooner.
		if p.Relaxed || len(p.Why) != 0 {
			t.Errorf("Monday = %+v, want not relaxed and no chip", p)
		}
		if q := placementAt(t, r, key(2)); q.RecipeID != 1 || !q.Relaxed {
			t.Errorf("Wednesday = %+v, want a relaxed pick of Recipe 1", q)
		}
	})
}

func TestVarietyRelaxedChipParameters(t *testing.T) {
	t.Run("max per week names the Tag and the count this week", func(t *testing.T) {
		pinned := []Slot{withExisting(dinner(1), pinnedMeal(8)), withExisting(dinner(2), pinnedMeal(9))}
		in := noCooldown(baseInput(append([]Slot{dinner(0)}, pinned...), rcp(1, 2, tags("fish")), rcp(8, 2, tags("fish"), archived()), rcp(9, 2, tags("fish"), archived())))
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 2}}
		p := placementAt(t, mustPlan(t, in), key(0))
		chip := wantRelaxedChip(t, p.Why, ReasonVarietyRelaxed)
		if !p.Relaxed || chip.Tag != "fish" || chip.Value != 3 {
			t.Errorf("placement = %+v chip = %+v, want the 3rd fish this week", p, chip)
		}
	})
	t.Run("not on consecutive days names the adjacent day", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{dinner(0), withExisting(dinner(1), pinnedMeal(9))}, rcp(1, 2, tags("fish")), rcp(9, 2, tags("fish"), archived())))
		in.VarietyRules = []VarietyRule{{Tag: "fish", NotConsecutiveDays: true}}
		p := placementAt(t, mustPlan(t, in), key(0))
		chip := wantRelaxedChip(t, p.Why, ReasonVarietyRelaxed)
		if !p.Relaxed || chip.Tag != "fish" || chip.Date != day(1) {
			t.Errorf("placement = %+v chip = %+v, want fish and %s", p, chip, day(1))
		}
	})
	t.Run("a Recipe inside its Cool-down gets the Cool-down chip even when a Variety Rule is broken too", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0), withExisting(dinner(1), pinnedMeal(9))}, rcp(1, 2, tags("fish")), rcp(9, 2, tags("fish"), archived()))
		in.LastPlanned = map[RecipeID]Date{1: day(-1)}
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
		p := placementAt(t, mustPlan(t, in), key(0))
		wantRelaxedChip(t, p.Why, ReasonCooldownRelaxed)
	})
}

func TestRelaxedChipComesLastAfterTheScoreChips(t *testing.T) {
	in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2, needs(need(spinach, 300)))), Weights{Favourite: 3, StockCoverage: 2, PerishableUse: 1})
	in = prefs(in, anna, Preferences{Favourites: []RecipeID{1}})
	in.Lots = []StockLot{lot(1, spinach, 300, day(2))}
	in.LastPlanned = map[RecipeID]Date{1: day(-1)}
	p := placementAt(t, mustPlan(t, in), key(0))
	codes := whyCodes(p)
	if len(codes) != 4 || codes[3] != ReasonCooldownRelaxed {
		t.Errorf("chips = %v, want three score chips and then the relaxed chip", codes)
	}
}

func TestExclusionsAndAdvanceStepsAreNeverRelaxed(t *testing.T) {
	in := baseInput([]Slot{dinner(0)},
		rcp(1, 2),                     // Exclusion, and inside its Cool-down
		rcp(2, 2, lead(48*time.Hour)), // Advance Step, and inside its Cool-down
		rcp(3, 2, archived()))
	in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1}})
	in.LastPlanned = map[RecipeID]Date{1: day(-1), 2: day(-1)}
	r := mustPlan(t, in)
	u := unfilledAt(t, r, key(0))
	if u.Reason != UnfilledNoCandidates {
		t.Fatalf("unfilled = %+v", u)
	}
	// Counted by the first filter, hard filters first: both are also in Cool-down, which counts nothing.
	if want := (Eliminations{Considered: 2, Exclusion: 1, AdvanceStep: 1}); u.Eliminated != want {
		t.Errorf("eliminations = %+v, want %+v", u.Eliminated, want)
	}
}

func TestEliminationCountsOfCoolDownAndVarietyAreAlwaysZero(t *testing.T) {
	// Every Course of a mixed plan: whenever a cell is Couldn't plan, the soft counts are 0 (ADR 0009 point 3).
	in := baseInput([]Slot{dinner(0), dinner(1), dinner(2)},
		rcp(1, 2, tags("fish")), rcp(2, 2, tags("fish"), lead(72*time.Hour)), rcp(3, 2))
	in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1, 3}})
	in.LastPlanned = map[RecipeID]Date{2: day(-1)}
	in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 1}}
	r := mustPlan(t, in)
	if len(r.Unfilled) == 0 {
		t.Fatal("setup: expected Couldn't plan cells (everything is excluded or too late)")
	}
	for _, u := range r.Unfilled {
		if u.Eliminated.CoolDown != 0 || u.Eliminated.VarietyRule != 0 {
			t.Errorf("unfilled %+v has soft counts", u)
		}
	}
}

func TestPinnedIsNeverRelaxed(t *testing.T) {
	in := baseInput([]Slot{withExisting(dinner(0), pinnedMeal(1)), withExisting(dinner(2), pinnedMeal(1))}, rcp(1, 2))
	r := mustPlan(t, in)
	if len(r.Placements)+len(r.Unfilled)+len(r.Rechecks) != 0 {
		t.Errorf("result = %+v, a Pinned meal is left exactly as it is", r)
	}
}

func TestSlotRuleCellWhoseRecipeIsInCoolDownBecauseOfAPinnedMeal(t *testing.T) {
	// Decision 22 amended: "Friday = pizza" after a Pinned pizza on Wednesday gives pizza, with "Again soon".
	in := baseInput([]Slot{withExisting(dinner(0), pinnedMeal(1)), withRules(dinner(2), SlotRule{RecipeID: 1})}, rcp(1, 2), rcp(2, 2))
	r := mustPlan(t, in)
	p := placementAt(t, r, key(2))
	if p.RecipeID != 1 || !p.Relaxed {
		t.Fatalf("rule cell = %+v, want a relaxed pick of the rule's Recipe", p)
	}
	if got := whyCodes(p); !reflect.DeepEqual(got, []ReasonCode{ReasonSlotRule, ReasonCooldownRelaxed}) {
		t.Errorf("chips = %v", got)
	}
	if c := p.Why[1]; c.Date != day(0) {
		t.Errorf("chip = %+v, want the Pinned date %s", c, day(0))
	}
}

func TestTwoSlotRuleCellsThatReserveTheSameRecipe(t *testing.T) {
	rule := SlotRule{RecipeID: 1}
	t.Run("the earlier gets it strictly, the later a relaxed pick naming the earlier date", func(t *testing.T) {
		in := baseInput([]Slot{withRules(dinner(1), rule), withRules(dinner(3), rule)}, rcp(1, 2), rcp(2, 2))
		r := mustPlan(t, in)
		if p := placementAt(t, r, key(1)); p.RecipeID != 1 || p.Relaxed {
			t.Errorf("earlier = %+v", p)
		}
		p := placementAt(t, r, key(3))
		if p.RecipeID != 1 || !p.Relaxed {
			t.Fatalf("later = %+v, want a relaxed pick of the Recipe", p)
		}
		if got := whyCodes(p); !reflect.DeepEqual(got, []ReasonCode{ReasonSlotRule, ReasonCooldownRelaxed}) || p.Why[1].Date != day(1) {
			t.Errorf("chips = %+v", p.Why)
		}
	})
	t.Run("the later is Couldn't plan only when the Recipe fails a hard filter there", func(t *testing.T) {
		later := withRules(dinner(3, Attendee{ben, 1}), rule)
		// Ben excludes Recipe 1 and is the only one at the later cell; Anna alone is at the earlier one.
		earlier := withRules(dinner(1, Attendee{anna, 1}), rule)
		in := prefs(baseInput([]Slot{earlier, later}, rcp(1, 2), rcp(2, 2)), ben, Preferences{ExcludedRecipes: []RecipeID{1}})
		u := unfilledAt(t, mustPlan(t, in), key(3))
		if u.Reason != UnfilledNoCandidates || !u.SlotRuleClaimed || u.Eliminated != (Eliminations{Considered: 1, Exclusion: 1}) {
			t.Errorf("later = %+v", u)
		}
	})
}

func TestBestAvailableIsGone(t *testing.T) {
	t.Run("a placement with nothing to say has no chips", func(t *testing.T) {
		p := placementAt(t, mustPlan(t, baseInput([]Slot{dinner(0)}, rcp(1, 2))), key(0))
		if len(p.Why) != 0 {
			t.Errorf("chips = %+v, want none", p.Why)
		}
	})
	t.Run("no placement of a busy plan ever carries best_available", func(t *testing.T) {
		in := weekInput(3)
		in.Recipes = in.Recipes[:5] // five Recipes over seven days: the last two are relaxed
		in.Weights = &Weights{}
		for _, in := range []Input{in, weekInput(11)} {
			for _, run := range []func(Input) (Result, error){Plan, Regenerate} {
				r, err := run(in)
				if err != nil {
					t.Fatal(err)
				}
				for _, p := range r.Placements {
					for _, w := range p.Why {
						if strings.Contains(string(w.Code), "best_available") {
							t.Errorf("placement %+v carries %s", p.Key, w.Code)
						}
					}
				}
			}
		}
	})
}

func TestFiveRecipesFillASevenDayHorizon(t *testing.T) {
	var five []Recipe
	for i := 1; i <= 5; i++ {
		five = append(five, rcp(RecipeID(i), 2))
	}
	var slots []Slot
	for d := 0; d < 7; d++ {
		slots = append(slots, dinner(d))
	}
	r := mustPlan(t, baseInput(slots, five...))
	if len(r.Unfilled) != 0 {
		t.Fatalf("Unfilled = %+v, a five-Recipe Household has no Couldn't plan", r.Unfilled)
	}
	if got := planSignature(r); got != "1,2,3,4,5,1,2" {
		t.Errorf("plan = %s, want 1,2,3,4,5,1,2", got)
	}
	for d := 0; d < 7; d++ {
		p := placementAt(t, r, key(d))
		if p.Relaxed != (d >= 5) {
			t.Errorf("day %d relaxed = %v", d, p.Relaxed)
		}
	}
	if c := wantRelaxedChip(t, placementAt(t, r, key(5)).Why, ReasonCooldownRelaxed); c.Date != day(0) || c.RecipeID != 1 {
		t.Errorf("day 5 chip = %+v", c)
	}
	if c := wantRelaxedChip(t, placementAt(t, r, key(6)).Why, ReasonCooldownRelaxed); c.Date != day(1) || c.RecipeID != 2 {
		t.Errorf("day 6 chip = %+v", c)
	}
	t.Run("the same with a real main Course", func(t *testing.T) {
		var cells []Slot
		var recipes []Recipe
		for d := 0; d < 7; d++ {
			cells = append(cells, mainCell(d))
		}
		for _, rc := range five {
			rc.CourseIDs = []int64{mainC}
			recipes = append(recipes, rc)
		}
		r := mustPlan(t, baseInput(cells, recipes...))
		if len(r.Unfilled) != 0 || planSignature(r) != "1,2,3,4,5,1,2" {
			t.Errorf("plan = %s, unfilled %+v", planSignature(r), r.Unfilled)
		}
	})
}

func TestRelaxedPlansAreDeterministic(t *testing.T) {
	var slots []Slot
	for d := 0; d < 7; d++ {
		slots = append(slots, mainCell(d))
	}
	mk := func(seed int64) Input {
		var rs []Recipe
		for i := 1; i <= 3; i++ {
			rs = append(rs, rcp(RecipeID(i), 2, courses(mainC)))
		}
		in := baseInput(slots, rs...)
		in.Weights, in.Seed = nil, seed
		return in
	}
	a, b := mustPlan(t, mk(5)), mustPlan(t, mk(5))
	if !equalResults(a, b) {
		t.Error("the same Input gave different Results")
	}
	for _, seed := range []int64{1, 2, 3} {
		g, err := Regenerate(mk(seed))
		if err != nil || len(g.Unfilled) != 0 || len(g.Placements) != 7 {
			t.Errorf("seed %d: Regenerate = %+v, %v", seed, g, err)
		}
	}
}

func TestSwapListsStrictAlternativesThenRelaxedOnes(t *testing.T) {
	base := func() Input {
		in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2), rcp(3, 2), rcp(4, 2), rcp(5, 2))
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{5}})
		in.LastPlanned = map[RecipeID]Date{3: day(-1), 4: day(-2)}
		return in
	}
	t.Run("fewer than 3 strict ones: the list is filled with the best relaxed one", func(t *testing.T) {
		got, err := Swap(base(), key(0))
		if err != nil {
			t.Fatal(err)
		}
		if want := []RecipeID{1, 2, 4}; !reflect.DeepEqual(recipeIDs(got), want) {
			t.Fatalf("alternatives = %v, want %v", recipeIDs(got), want)
		}
		for i, wantRelaxed := range []bool{false, false, true} {
			if got[i].Relaxed != wantRelaxed {
				t.Errorf("alternative %d relaxed = %v", i, got[i].Relaxed)
			}
		}
		if c := wantRelaxedChip(t, got[2].Why, ReasonCooldownRelaxed); c.Date != day(-2) {
			t.Errorf("chip = %+v", c)
		}
	})
	t.Run("relaxed ones follow the relaxed order", func(t *testing.T) {
		in := base()
		in.LastPlanned[2] = day(-1)
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{5}})
		in.Slots[0].Existing = &ExistingMeal{State: MealPlanned, RecipeID: 1, Batches: 1}
		got, _ := Swap(in, key(0)) // strict: none (1 is current), relaxed: 4 (gap 2), then 2 and 3 (gap 1, lower id first)
		if want := []RecipeID{4, 2, 3}; !reflect.DeepEqual(recipeIDs(got), want) {
			t.Errorf("alternatives = %v, want %v", recipeIDs(got), want)
		}
	})
	t.Run("with 3 strict ones there are no relaxed ones", func(t *testing.T) {
		in := base()
		in.LastPlanned = map[RecipeID]Date{4: day(-2)}
		in.Recipes[4] = rcp(5, 2)
		in.Members = nil
		got, _ := Swap(in, key(0))
		if want := []RecipeID{1, 2, 3}; !reflect.DeepEqual(recipeIDs(got), want) {
			t.Fatalf("alternatives = %v, want %v", recipeIDs(got), want)
		}
		for _, p := range got {
			if p.Relaxed {
				t.Errorf("%+v is relaxed", p)
			}
		}
	})
	t.Run("a Recipe reserved for a later Slot Rule cell is never offered, not even last", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0), withRules(dinner(2), SlotRule{RecipeID: 2})}, rcp(1, 2), rcp(2, 2), rcp(3, 2))
		in.LastPlanned = map[RecipeID]Date{3: day(-1)}
		got, _ := Swap(in, key(0))
		if want := []RecipeID{1, 3}; !reflect.DeepEqual(recipeIDs(got), want) {
			t.Errorf("alternatives = %v, want %v", recipeIDs(got), want)
		}
	})
	t.Run("an optional Course still gets relaxed alternatives: the User is choosing", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, isOptional())}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		in.LastPlanned = map[RecipeID]Date{2: day(-1)}
		got, err := Swap(in, ck(0, dessertC))
		if err != nil || len(got) != 1 || got[0].RecipeID != 2 || !got[0].Relaxed {
			t.Errorf("alternatives = %+v, %v", got, err)
		}
	})
	t.Run("Recipes in another Course of the slot and date are not offered", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, sideC, holding(pinnedMeal(1)))},
			rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(mainC)))
		got, _ := Swap(in, ck(0, mainC))
		if want := []RecipeID{2}; !reflect.DeepEqual(recipeIDs(got), want) {
			t.Errorf("alternatives = %v, want %v", recipeIDs(got), want)
		}
	})
	t.Run("Exclusions and Advance Steps still apply to relaxed alternatives", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2, lead(48*time.Hour)))
		in = prefs(in, anna, Preferences{ExcludedRecipes: []RecipeID{1}})
		in.LastPlanned = map[RecipeID]Date{1: day(-1), 2: day(-1)}
		if got, _ := Swap(in, key(0)); len(got) != 0 {
			t.Errorf("alternatives = %v, want none", recipeIDs(got))
		}
	})
}
