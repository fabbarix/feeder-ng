package planner

import (
	"errors"
	"reflect"
	"testing"
)

func swapInput() Input {
	current := withExisting(dinner(0), ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})
	in := weighted(baseInput([]Slot{current, dinner(1)},
		rcp(1, 2), rcp(2, 2), rcp(3, 2), rcp(4, 2), rcp(5, 2)), Weights{Favourite: 3})
	in.Members = map[MemberID]Preferences{
		anna: {Favourites: []RecipeID{1, 2, 3}},
		ben:  {Favourites: []RecipeID{2}},
	}
	return in
}

func recipeIDs(ps []Placement) []RecipeID {
	var out []RecipeID
	for _, p := range ps {
		out = append(out, p.RecipeID)
	}
	return out
}

func TestSwapTopThree(t *testing.T) {
	in := swapInput()
	got, err := Swap(in, key(0))
	if err != nil {
		t.Fatal(err)
	}
	// Scores: R2 6 (current, excluded), R1 3, R3 3, R4 0, R5 0. Ties go to the lower id.
	if want := []RecipeID{1, 3, 4}; !reflect.DeepEqual(recipeIDs(got), want) {
		t.Fatalf("alternatives = %v, want %v", recipeIDs(got), want)
	}
	wantScores := []float64{3, 3, 0}
	for i, p := range got {
		wantScore(t, p, wantScores[i])
		if p.Source != SourceRecipe || p.Batches != 1 || p.Key != key(0) || len(p.Why) < 1 || len(p.Why) > 3 {
			t.Errorf("alternative %d malformed: %+v", i, p)
		}
	}
	if got[0].Why[0].Code != ReasonFavourite {
		t.Errorf("first alternative's chips = %+v", got[0].Why)
	}
}

func TestSwapFiltersAndContext(t *testing.T) {
	t.Run("fewer than 3 when fewer are eligible", func(t *testing.T) {
		in := weighted(baseInput([]Slot{withExisting(dinner(0), ExistingMeal{State: MealPinned, RecipeID: 1, Batches: 1})}, rcp(1, 2), rcp(2, 2)), Weights{})
		got, err := Swap(in, key(0))
		if err != nil || !reflect.DeepEqual(recipeIDs(got), []RecipeID{2}) {
			t.Errorf("got %v, %v", recipeIDs(got), err)
		}
	})
	t.Run("Exclusions, cool-down and archived Recipes are not offered", func(t *testing.T) {
		in := swapInput()
		in.Recipes[0].Archived = true // R1
		in = prefs(in, carl, Preferences{ExcludedRecipes: []RecipeID{3}})
		in.Slots[0].Attendance = []Attendee{{anna, 1}, {carl, 1}}
		in.LastPlanned = map[RecipeID]Date{4: day(-2)}
		got, err := Swap(in, key(0))
		if err != nil || !reflect.DeepEqual(recipeIDs(got), []RecipeID{5}) {
			t.Errorf("got %v, %v", recipeIDs(got), err)
		}
	})
	t.Run("an earlier meal puts its Recipe in cool-down", func(t *testing.T) {
		first := withExisting(dinner(0), ExistingMeal{State: MealPinned, RecipeID: 1, Batches: 1})
		second := withExisting(dinner(1), ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1})
		in := weighted(baseInput([]Slot{first, second}, rcp(1, 2), rcp(2, 2), rcp(3, 2)), Weights{})
		got, _ := Swap(in, key(1))
		if !reflect.DeepEqual(recipeIDs(got), []RecipeID{3}) {
			t.Errorf("got %v", recipeIDs(got))
		}
	})
	t.Run("Slot Rules are ignored: the User is overriding them", func(t *testing.T) {
		s := withRules(withExisting(dinner(0), ExistingMeal{State: MealPinned, RecipeID: 2, Batches: 1}), SlotRule{Tag: "pizza"})
		in := weighted(baseInput([]Slot{s}, rcp(1, 2), rcp(2, 2, tags("pizza")), rcp(3, 2)), Weights{})
		got, _ := Swap(in, key(0))
		if !reflect.DeepEqual(recipeIDs(got), []RecipeID{1, 3}) {
			t.Errorf("got %v", recipeIDs(got))
		}
	})
	t.Run("Leftovers are not offered as alternatives", func(t *testing.T) {
		in := swapInput()
		in.Leftovers = []Leftover{leftoverOf(7, 4, 2, day(3))}
		got, _ := Swap(in, key(0))
		for _, p := range got {
			if p.Source != SourceRecipe {
				t.Errorf("got %+v", p)
			}
		}
	})
	t.Run("an empty slot can be swapped into: nothing is excluded", func(t *testing.T) {
		in := weighted(baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2)), Weights{})
		got, err := Swap(in, key(0))
		if err != nil || !reflect.DeepEqual(recipeIDs(got), []RecipeID{1, 2}) {
			t.Errorf("got %v, %v", recipeIDs(got), err)
		}
	})
	t.Run("alternatives carry purchases and surplus like a placement", func(t *testing.T) {
		in := weighted(baseInput([]Slot{withExisting(dinner(0), ExistingMeal{State: MealPlanned, RecipeID: 2, Batches: 1})},
			rcp(1, 4, needs(need(chicken, 500))), rcp(2, 2)), Weights{})
		got, _ := Swap(in, key(0))
		if len(got) != 1 || got[0].Surplus == nil || got[0].Surplus.Portions != 2 || len(got[0].Purchases) != 1 {
			t.Errorf("got %+v", got)
		}
	})
}

func TestSwapErrors(t *testing.T) {
	cooked := withExisting(dinner(0), ExistingMeal{State: MealCooked, RecipeID: 1, Batches: 1})
	skipped := withExisting(dinner(1), ExistingMeal{State: MealSkipped, RecipeID: 1, Batches: 1})
	in := baseInput([]Slot{cooked, skipped, dinner(2)}, rcp(1, 2), rcp(2, 2))
	if _, err := Swap(in, key(0)); !errors.Is(err, ErrSlotNotSwappable) {
		t.Errorf("Cooked: %v", err)
	}
	if _, err := Swap(in, key(1)); !errors.Is(err, ErrSlotNotSwappable) {
		t.Errorf("skipped: %v", err)
	}
	if _, err := Swap(in, SlotKey{day(40), dinnerSlot}); !errors.Is(err, ErrUnknownSlot) {
		t.Errorf("unknown: %v", err)
	}
}

func TestSwapIsPureAndDeterministic(t *testing.T) {
	in, copyOfIn := swapInput(), swapInput()
	in.Weights, copyOfIn.Weights = nil, nil // use Style: jitter is active
	a, _ := Swap(in, key(0))
	b, _ := Swap(in, key(0))
	if !reflect.DeepEqual(a, b) {
		t.Errorf("same seed gave different alternatives:\n%+v\n%+v", a, b)
	}
	if !reflect.DeepEqual(in, copyOfIn) {
		t.Error("Swap modified its input")
	}
}
