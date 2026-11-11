package planner

import (
	"reflect"
	"testing"
)

// Courses in the planner (spec 7.2, ADR 0008, crs-plan 2.3 team B). Cells are one Course of one Meal Slot on a
// date. Weights are zero in baseInput, so the lowest Recipe id wins ties, which these cases rely on.

func TestCourseFit(t *testing.T) {
	t.Run("a fresh pick is only a Recipe marked with the cell's Course", func(t *testing.T) {
		tests := []struct {
			name   string
			course int64
			want   RecipeID
		}{
			{"main", mainC, 2},
			{"side", sideC, 1},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				// Recipe 3 scores highest of all but fits neither Course.
				slot := cell(0, tt.course)
				if tt.course == mainC {
					slot = mainCell(0)
				}
				in := weighted(baseInput([]Slot{slot},
					rcp(1, 2, courses(sideC)), rcp(2, 2, courses(mainC)), rcp(3, 2, courses(dessertC))), Weights{Favourite: 5})
				in = prefs(in, anna, Preferences{Favourites: []RecipeID{3}})
				wantPlaced(t, mustPlan(t, in), ck(0, tt.course), tt.want)
			})
		}
	})
	t.Run("a Recipe marked with several Courses fits each of them", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{mainCell(0), cell(1, sideC)}, rcp(1, 2, courses(mainC, sideC))))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 1)
		wantPlaced(t, r, ck(1, sideC), 1)
	})
	t.Run("a Leftover is placed only in a Course its Recipe is marked with", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(1, sideC)}, rcp(1, 2, courses(sideC)), rcp(2, 2, courses(mainC)))
		in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(3))}
		r := mustPlan(t, in)
		if p := wantPlaced(t, r, ck(0, mainC), 2); p.Source != SourceRecipe {
			t.Errorf("main = %+v, want a fresh Recipe 2 (the side Leftover does not fit the main Course)", p)
		}
		if p := wantPlaced(t, r, ck(1, sideC), 1); p.Source != SourceLeftover || p.From.LeftoverID != 7 {
			t.Errorf("side = %+v, want the Leftover", p)
		}
	})
	t.Run("a Leftover is not tied to the Course it was cooked in", func(t *testing.T) {
		in := baseInput([]Slot{cell(1, starterC)}, rcp(1, 2, courses(mainC, starterC)), rcp(2, 2, courses(starterC)))
		lf := leftoverOf(7, 1, 2, day(3))
		lf.FromSlot = ck(-1, mainC) // cooked as a main
		in.Leftovers = []Leftover{lf}
		if p := wantPlaced(t, mustPlan(t, in), ck(1, starterC), 1); p.Source != SourceLeftover {
			t.Errorf("starter = %+v, want the soup Leftover", p)
		}
	})
	t.Run("a cell with Course 0 (the transition shim) has no Course fit", func(t *testing.T) {
		in := baseInput([]Slot{dinner(0)}, rcp(1, 2), rcp(2, 2, courses(sideC)))
		wantPlaced(t, mustPlan(t, in), key(0), 1)
	})
}

func TestWalkOrder(t *testing.T) {
	t.Run("the main Course is walked first, whatever the input order", func(t *testing.T) {
		// Recipe 1 fits both. If the side were walked first it would take Recipe 1 and the main would have nothing.
		in := baseInput([]Slot{cell(0, sideC), mainCell(0)}, rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(sideC)))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 1)
		wantPlaced(t, r, ck(0, sideC), 2)
		if len(r.Placements) != 2 || r.Placements[0].Key != ck(0, mainC) || r.Placements[1].Key != ck(0, sideC) {
			t.Errorf("placements are in walk order, main first: %+v", r.Placements)
		}
	})
	t.Run("required Courses follow the slot's own order", func(t *testing.T) {
		// Dessert is position 1, Side position 2: the dessert walks first and takes the shared Recipe.
		in := baseInput([]Slot{mainCell(0), cell(0, sideC, atPosition(2)), cell(0, dessertC, atPosition(1))},
			rcp(1, 2, courses(mainC)), rcp(2, 2, courses(sideC, dessertC)))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, dessertC), 2)
		u := unfilledAt(t, r, ck(0, sideC))
		if u.Reason != UnfilledNoCandidates {
			t.Errorf("side = %+v, want no_candidates (its only Recipe is the dessert)", u)
		}
	})
	t.Run("optional Courses are walked after the required ones", func(t *testing.T) {
		// The optional starter comes first in the slot, but must not take the Recipe the required side needs.
		in := baseInput([]Slot{cell(0, starterC, isOptional(), atPosition(0)), mainCell(0), cell(0, sideC, atPosition(1))},
			rcp(1, 2, courses(sideC, starterC)), rcp(2, 2, courses(mainC)))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, sideC), 1)
		wantPlaced(t, r, ck(0, mainC), 2)
		wantNotServed(t, r, ck(0, starterC), NotServedOptional)
	})
	t.Run("slots stay in chronological order, then the Courses of each", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{cell(1, sideC), mainCell(1), mainCell(0), cell(0, sideC)},
			rcp(1, 2, courses(mainC)), rcp(2, 2, courses(sideC))))
		r := mustPlan(t, in)
		var got []SlotKey
		for _, p := range r.Placements {
			got = append(got, p.Key)
		}
		want := []SlotKey{ck(0, mainC), ck(0, sideC), ck(1, mainC), ck(1, sideC)}
		if !reflect.DeepEqual(got, want) {
			t.Errorf("order = %v, want %v", got, want)
		}
	})
	t.Run("the same cell key twice is rejected, the same slot with two Courses is fine", func(t *testing.T) {
		if _, err := Plan(baseInput([]Slot{mainCell(0), mainCell(0)}, rcp(1, 2))); err != ErrDuplicateSlot {
			t.Errorf("err = %v, want ErrDuplicateSlot", err)
		}
		if _, err := Plan(baseInput([]Slot{mainCell(0), cell(0, sideC)}, rcp(1, 2))); err != nil {
			t.Errorf("err = %v", err)
		}
	})
}

func TestWholeMealCovering(t *testing.T) {
	recipes := func() []Recipe {
		return []Recipe{rcp(1, 2, courses(mainC), whole()), rcp(2, 2, courses(mainC)), rcp(3, 2, courses(sideC)), rcp(4, 2, courses(sideC))}
	}
	t.Run("a fresh Whole meal in the main Course covers the slot's other Courses", func(t *testing.T) {
		r := mustPlan(t, baseInput([]Slot{mainCell(0), cell(0, sideC), cell(0, dessertC)}, recipes()...))
		wantPlaced(t, r, ck(0, mainC), 1)
		wantNotServed(t, r, ck(0, sideC), NotServedCovered)
		wantNotServed(t, r, ck(0, dessertC), NotServedCovered)
	})
	t.Run("a covered Course has no reason even when no Recipe is marked with it", func(t *testing.T) {
		r := mustPlan(t, baseInput([]Slot{mainCell(0), cell(0, sideC)}, rcp(1, 2, courses(mainC), whole())))
		wantNotServed(t, r, ck(0, sideC), NotServedCovered)
	})
	t.Run("a Whole meal Leftover in the main Course covers too", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, sideC)}, recipes()...)
		in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(3))}
		r := mustPlan(t, in)
		if p := wantPlaced(t, r, ck(0, mainC), 1); p.Source != SourceLeftover {
			t.Errorf("main = %+v", p)
		}
		wantNotServed(t, r, ck(0, sideC), NotServedCovered)
	})
	t.Run("a Pinned Whole meal covers: the unpinned Planned Meal beside it is removed", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0, holding(pinnedMeal(1))), cell(0, sideC, holding(plannedMeal(3)))}, recipes()...)
		r := mustPlan(t, in)
		wantNotServed(t, r, ck(0, sideC), NotServedCovered)
		if isKept(r, ck(0, mainC)) || len(r.Placements) != 0 {
			t.Errorf("the Pinned main must not appear in the result: %+v", r)
		}
	})
	t.Run("a Whole meal chosen this run removes an unpinned Planned Meal kept beside it", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, sideC, holding(plannedMeal(3)))}, recipes()...)
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 1)
		wantNotServed(t, r, ck(0, sideC), NotServedCovered)
	})
	t.Run("a Whole meal in another Course is an ordinary Recipe", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, sideC)}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(sideC), whole()), rcp(3, 2, courses(sideC)))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 1)
		wantPlaced(t, r, ck(0, sideC), 2)
		if len(r.NotServed) != 0 {
			t.Errorf("NotServed = %+v, nothing is covered", r.NotServed)
		}
	})
	t.Run("a slot without the main Course is never covered", func(t *testing.T) {
		in := baseInput([]Slot{cell(0, sideC, atPosition(0)), cell(0, dessertC, atPosition(1))},
			rcp(1, 2, courses(sideC, dessertC), whole()), rcp(2, 2, courses(dessertC)))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, sideC), 1)
		wantPlaced(t, r, ck(0, dessertC), 2)
	})
	t.Run("a Pinned, Cooked or Not cooked Course beside it is not covered", func(t *testing.T) {
		for name, m := range map[string]ExistingMeal{"Pinned": pinnedMeal(3), "Cooked": cookedMeal(3), "Not cooked": skippedMeal(3)} {
			t.Run(name+" Side, Whole meal chosen by the planner is held back", func(t *testing.T) {
				// The planner does not cover the User's Side: the Whole meal is not a candidate for the main Course.
				in := baseInput([]Slot{mainCell(0), cell(0, sideC, holding(m))}, recipes()...)
				r := mustPlan(t, in)
				wantPlaced(t, r, ck(0, mainC), 2)
				if _, ok := notServedAt(r, ck(0, sideC)); ok {
					t.Errorf("the %s Side is not covered: %+v", name, r.NotServed)
				}
			})
			t.Run(name+" Side beside a Pinned Whole meal stays and is not covered", func(t *testing.T) {
				in := baseInput([]Slot{mainCell(0, holding(pinnedMeal(1))), cell(0, sideC, holding(m))}, recipes()...)
				r := mustPlan(t, in)
				if _, ok := notServedAt(r, ck(0, sideC)); ok || isUnfilled(r, ck(0, sideC)) {
					t.Errorf("the %s Side must stay as it is: %+v", name, r)
				}
			})
		}
	})
	t.Run("when the Side is unpinned and removed the Course is covered again", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0, holding(pinnedMeal(1))), cell(0, sideC)}, recipes()...)
		wantNotServed(t, mustPlan(t, in), ck(0, sideC), NotServedCovered)
	})
	t.Run("a Whole meal is never chosen for a slot's main Course if a Course beside it holds a fixed meal, even a Leftover one", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, sideC, holding(pinnedMeal(3)))}, recipes()...)
		in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(3))}
		r := mustPlan(t, in)
		p := wantPlaced(t, r, ck(0, mainC), 2)
		if p.Source != SourceRecipe {
			t.Errorf("main = %+v, want fresh Recipe 2: the Whole meal Leftover is skipped", p)
		}
	})
}

func TestOneRecipePerSlot(t *testing.T) {
	both2 := func() []Recipe {
		return []Recipe{rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(sideC))}
	}
	t.Run("a Recipe already in another Course of the slot is not a candidate", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{mainCell(0, holding(pinnedMeal(1))), cell(0, sideC)}, both2()...))
		wantPlaced(t, mustPlan(t, in), ck(0, sideC), 2)
	})
	t.Run("it counts a Recipe the planner placed earlier in the walk", func(t *testing.T) {
		wantPlaced(t, mustPlan(t, noCooldown(baseInput([]Slot{mainCell(0), cell(0, sideC)}, both2()...))), ck(0, sideC), 2)
	})
	t.Run("it counts an unpinned Planned Meal kept in another Course", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{mainCell(0), cell(0, sideC, holding(plannedMeal(1)))}, rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(mainC))))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 2)
		if !isKept(r, ck(0, sideC)) {
			t.Errorf("Kept = %v", r.Kept)
		}
	})
	t.Run("with nothing else the Course is Couldn't plan, counted as considered only", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{mainCell(0, holding(pinnedMeal(1))), cell(0, sideC)}, rcp(1, 2, courses(mainC, sideC))))
		u := unfilledAt(t, mustPlan(t, in), ck(0, sideC))
		if u.Reason != UnfilledNoCandidates || u.Eliminated != (Eliminations{Considered: 1}) {
			t.Errorf("unfilled = %+v, want no_candidates with Considered 1 and nothing counted", u)
		}
	})
	t.Run("another date or another Meal Slot may use the Recipe again", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{mainCell(0, holding(pinnedMeal(1))), cell(1, sideC)}, both2()...))
		wantPlaced(t, mustPlan(t, in), ck(1, sideC), 1)
	})
}

func TestNoCourseRecipes(t *testing.T) {
	tests := []struct {
		name    string
		recipes []Recipe
		slot    Slot
		want    UnfilledReason
		elim    Eliminations
	}{
		{"no Recipe is marked with the Course", []Recipe{rcp(1, 2, courses(mainC))}, cell(0, sideC), UnfilledNoCourseRecipes, Eliminations{}},
		{"no Recipes at all", nil, cell(0, sideC), UnfilledNoCourseRecipes, Eliminations{}},
		{"the only Recipe marked with the Course is archived", []Recipe{rcp(1, 2, courses(sideC), archived()), rcp(2, 2, courses(mainC))}, cell(0, sideC), UnfilledNoCourseRecipes, Eliminations{}},
		{"Recipes with a zero Yield do not count either", []Recipe{rcp(1, 0, courses(sideC))}, cell(0, sideC), UnfilledNoCourseRecipes, Eliminations{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			u := unfilledAt(t, mustPlan(t, baseInput([]Slot{tt.slot}, tt.recipes...)), tt.slot.Key)
			if u.Reason != tt.want || u.Eliminated != tt.elim {
				t.Errorf("unfilled = %+v", u)
			}
		})
	}
	t.Run("Recipes marked with the Course that are all excluded is no_candidates", func(t *testing.T) {
		in := prefs(baseInput([]Slot{cell(0, sideC)}, rcp(1, 2, courses(sideC))), anna, Preferences{ExcludedRecipes: []RecipeID{1}})
		u := unfilledAt(t, mustPlan(t, in), ck(0, sideC))
		if u.Reason != UnfilledNoCandidates || u.Eliminated != (Eliminations{Considered: 1, Exclusion: 1}) {
			t.Errorf("unfilled = %+v", u)
		}
	})
	t.Run("a Slot Rule that names nothing plannable is no_candidates, not no_course_recipes", func(t *testing.T) {
		in := baseInput([]Slot{cell(0, sideC, ruled(SlotRule{Tag: "sushi"}))}, rcp(1, 2, courses(sideC)))
		u := unfilledAt(t, mustPlan(t, in), ck(0, sideC))
		if u.Reason != UnfilledNoCandidates || !u.SlotRuleClaimed || u.Eliminated.Considered != 0 {
			t.Errorf("unfilled = %+v", u)
		}
	})
	t.Run("an optional Course never records it", func(t *testing.T) {
		r := mustPlan(t, baseInput([]Slot{mainCell(0), cell(0, dessertC, isOptional())}, rcp(1, 2, courses(mainC))))
		wantNotServed(t, r, ck(0, dessertC), NotServedOptional)
	})
}

func TestOptionalCourses(t *testing.T) {
	t.Run("planned from a strict candidate", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, isOptional())}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		r := mustPlan(t, in)
		if p := wantPlaced(t, r, ck(0, dessertC), 2); p.Relaxed {
			t.Errorf("dessert = %+v, a strict pick is not relaxed", p)
		}
	})
	t.Run("planned from a Leftover", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, isOptional())}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		in.Leftovers = []Leftover{leftoverOf(7, 2, 2, day(3))}
		if p := wantPlaced(t, mustPlan(t, in), ck(0, dessertC), 2); p.Source != SourceLeftover {
			t.Errorf("dessert = %+v", p)
		}
	})
	t.Run("left empty, never relaxed, when the only Recipe is inside its Cool-down", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, isOptional())}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		in.LastPlanned = map[RecipeID]Date{2: day(-1)}
		wantNotServed(t, mustPlan(t, in), ck(0, dessertC), NotServedOptional)
	})
	t.Run("left empty when a Variety Rule is in the way", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{mainCell(0), cell(0, dessertC, isOptional())}, rcp(1, 2, courses(mainC), tags("sweet")), rcp(2, 2, courses(dessertC), tags("sweet"))))
		in.VarietyRules = []VarietyRule{{Tag: "sweet", MaxPerWeek: 1}}
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 1)
		wantNotServed(t, r, ck(0, dessertC), NotServedOptional)
	})
	t.Run("left empty, with no Couldn't plan reason, when everything is excluded", func(t *testing.T) {
		in := prefs(baseInput([]Slot{cell(0, mainC, isMain()), cell(0, dessertC, isOptional())}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC))),
			anna, Preferences{ExcludedRecipes: []RecipeID{2}})
		wantNotServed(t, mustPlan(t, in), ck(0, dessertC), NotServedOptional)
	})
	t.Run("a kept optional Planned Meal that now breaks a rule with no strict candidate is dropped, not relaxed", func(t *testing.T) {
		// Pinned Recipe 2 the day before puts the kept dessert inside Recipe 2's Cool-down; optional Courses are never relaxed.
		pinned := withExisting(slotAtCourse(-1, sideC), pinnedMeal(2))
		in := baseInput([]Slot{pinned, mainCell(0), cell(0, dessertC, isOptional(), holding(plannedMeal(2)))}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC, sideC)))
		r := mustPlan(t, in)
		wantNotServed(t, r, ck(0, dessertC), NotServedOptional)
	})
	t.Run("an unattended Meal Slot gives an optional Course no reason either", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0, eats()), cell(0, dessertC, isOptional(), eats())}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		r := mustPlan(t, in)
		if u := unfilledAt(t, r, ck(0, mainC)); u.Reason != UnfilledNoAttendance {
			t.Errorf("main = %+v", u)
		}
		wantEmptyNoReason(t, r, ck(0, dessertC))
	})
}

func slotAtCourse(n int, c int64) Slot { return cell(n, c) }

func TestCourseAttendance(t *testing.T) {
	annaOnly := []Attendee{{anna, 1}}
	benOnly := []Attendee{{ben, 1}}
	t.Run("portions, Batches and the new Leftover are the Course's", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, eats(annaOnly...))}, rcp(1, 2, courses(mainC)), rcp(2, 4, courses(dessertC)))
		r := mustPlan(t, in)
		if p := wantPlaced(t, r, ck(0, mainC), 1); p.Portions != 2 || p.Batches != 1 || p.NewLeftover != nil {
			t.Errorf("main = %+v", p)
		}
		p := wantPlaced(t, r, ck(0, dessertC), 2)
		if p.Portions != 1 || p.Batches != 1 || p.NewLeftover == nil || p.NewLeftover.Portions != 3 {
			t.Errorf("dessert = %+v, want 1 portion and a Leftover of 3", p)
		}
	})
	t.Run("Sam's Exclusion blocks the Main he eats, not the Dessert he opts out of", func(t *testing.T) {
		in := prefs(baseInput([]Slot{mainCell(0), cell(0, dessertC, eats(annaOnly...))},
			rcp(1, 2, courses(mainC, dessertC)), rcp(2, 2, courses(mainC))), ben, Preferences{ExcludedRecipes: []RecipeID{1}})
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 2)
		wantPlaced(t, r, ck(0, dessertC), 1)
	})
	t.Run("Exclusions of an Ingredient follow the Course Attendance too", func(t *testing.T) {
		in := prefs(baseInput([]Slot{cell(0, dessertC, eats(annaOnly...))}, rcp(1, 2, courses(dessertC), needs(need(garlic, 5)))),
			ben, Preferences{ExcludedIngredients: []IngredientID{garlic}})
		wantPlaced(t, mustPlan(t, in), ck(0, dessertC), 1)
	})
	t.Run("Favourites and Dislikes count per Course", func(t *testing.T) {
		// Ben likes Recipe 3 (the lower id) but opts out of the dessert, so only Anna's Recipe 4 earns the Favourite.
		in := weighted(baseInput([]Slot{cell(0, dessertC, eats(annaOnly...))}, rcp(3, 2, courses(dessertC)), rcp(4, 2, courses(dessertC))), Weights{Favourite: 3, Dislike: -2})
		in.Members = map[MemberID]Preferences{ben: {Favourites: []RecipeID{3}}, anna: {Favourites: []RecipeID{4}}}
		p := wantPlaced(t, mustPlan(t, in), ck(0, dessertC), 4)
		if len(p.Why) == 0 || p.Why[0].Code != ReasonFavourite || !reflect.DeepEqual(p.Why[0].MemberIDs, []MemberID{anna}) {
			t.Errorf("chips = %+v", p.Why)
		}
		in = weighted(baseInput([]Slot{cell(0, dessertC, eats(benOnly...))}, rcp(3, 2, courses(dessertC)), rcp(4, 2, courses(dessertC))), Weights{Dislike: -2})
		in.Members = map[MemberID]Preferences{ben: {Dislikes: []RecipeID{3}}, anna: {Dislikes: []RecipeID{4}}}
		wantPlaced(t, mustPlan(t, in), ck(0, dessertC), 4) // Anna's Dislike of 4 does not count: she opts out
	})
	t.Run("a Leftover must cover the Course's portions, not the slot's", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, eats(annaOnly...))}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)), rcp(3, 2, courses(dessertC)))
		in.Leftovers = []Leftover{leftoverOf(7, 2, 1, day(3))} // 1 portion left
		r := mustPlan(t, in)
		if p := wantPlaced(t, r, ck(0, dessertC), 2); p.Source != SourceLeftover {
			t.Errorf("dessert = %+v, want the 1-portion Leftover (the dessert needs 1)", p)
		}
		in = baseInput([]Slot{mainCell(0)}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(mainC)))
		in.Leftovers = []Leftover{leftoverOf(7, 2, 1, day(3))}
		if p := wantPlaced(t, mustPlan(t, in), ck(0, mainC), 1); p.Source != SourceRecipe {
			t.Errorf("main = %+v, the 1-portion Leftover does not cover 2 portions", p)
		}
	})
	t.Run("a Leftover with an Exclusion of an attendee is skipped, of an opted-out Member is not", func(t *testing.T) {
		in := prefs(baseInput([]Slot{cell(0, dessertC, eats(annaOnly...))}, rcp(2, 2, courses(dessertC)), rcp(3, 2, courses(dessertC))), ben, Preferences{ExcludedRecipes: []RecipeID{2}})
		in.Leftovers = []Leftover{leftoverOf(7, 2, 2, day(3))}
		if p := wantPlaced(t, mustPlan(t, in), ck(0, dessertC), 2); p.Source != SourceLeftover {
			t.Errorf("dessert = %+v", p)
		}
	})
	t.Run("a Course nobody eats is not served and has no reason", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, optedOut())}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		wantNotServed(t, mustPlan(t, in), ck(0, dessertC), NotServedNoCourseAttendance)
	})
	t.Run("an optional Course nobody eats is not served for that reason", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, isOptional(), optedOut())}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		wantNotServed(t, mustPlan(t, in), ck(0, dessertC), NotServedNoCourseAttendance)
	})
	t.Run("an unpinned Planned Meal in a Course nobody eats is removed, a Pinned one stays", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, optedOut(), holding(plannedMeal(2))), cell(1, dessertC, optedOut(), holding(pinnedMeal(2)))},
			rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		r := mustPlan(t, in)
		wantNotServed(t, r, ck(0, dessertC), NotServedNoCourseAttendance)
		if _, ok := notServedAt(r, ck(1, dessertC)); ok || isUnfilled(r, ck(1, dessertC)) {
			t.Errorf("the Pinned dessert stays as it is: %+v", r)
		}
	})
	t.Run("a Meal Slot nobody attends is no_attendance for each required Course", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0, eats()), cell(0, sideC, eats())}, rcp(1, 2, courses(mainC, sideC)))
		r := mustPlan(t, in)
		for _, c := range []int64{mainC, sideC} {
			if u := unfilledAt(t, r, ck(0, c)); u.Reason != UnfilledNoAttendance {
				t.Errorf("course %d = %+v", c, u)
			}
		}
	})
	t.Run("a kept Planned Meal needs Batches for the Course's portions", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, dessertC, eats(annaOnly...), holding(plannedMeal(2)))}, rcp(1, 2, courses(mainC)), rcp(2, 2, courses(dessertC)))
		if r := mustPlan(t, in); !isKept(r, ck(0, dessertC)) {
			t.Errorf("Kept = %v, want the dessert kept (2 portions cover its 1)", r.Kept)
		}
	})
}

func TestLeftoverFirstAppliesBothRules(t *testing.T) {
	t.Run("a Leftover whose Recipe is already in another Course of the slot is skipped", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0, holding(pinnedMeal(1))), cell(0, sideC)},
			rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(sideC)))
		// Leftover 7 (Recipe 1) has the soonest Use-by but Recipe 1 is the main; Leftover 8 is placed instead.
		in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(2)), leftoverOf(8, 2, 2, day(5))}
		p := wantPlaced(t, mustPlan(t, in), ck(0, sideC), 2)
		if p.Source != SourceLeftover || p.From.LeftoverID != 8 {
			t.Errorf("side = %+v, want Leftover 8", p)
		}
	})
	t.Run("a Whole meal Leftover is not placed in the main Course while a Course beside it holds a fixed meal", func(t *testing.T) {
		for name, m := range map[string]ExistingMeal{"Pinned": pinnedMeal(3), "Cooked": cookedMeal(3), "Not cooked": skippedMeal(3)} {
			t.Run(name, func(t *testing.T) {
				in := baseInput([]Slot{mainCell(0), cell(0, sideC, holding(m))},
					rcp(1, 2, courses(mainC), whole()), rcp(2, 2, courses(mainC)), rcp(3, 2, courses(sideC)))
				in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(2)), leftoverOf(8, 2, 2, day(5))}
				p := wantPlaced(t, mustPlan(t, in), ck(0, mainC), 2)
				if p.Source != SourceLeftover || p.From.LeftoverID != 8 {
					t.Errorf("main = %+v, want the next fitting Leftover (8)", p)
				}
			})
		}
	})
	t.Run("the next step is a fresh Recipe when only the Whole meal Leftover fits", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, sideC, holding(pinnedMeal(3)))},
			rcp(1, 2, courses(mainC), whole()), rcp(2, 2, courses(mainC)), rcp(3, 2, courses(sideC)))
		in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(2))}
		if p := wantPlaced(t, mustPlan(t, in), ck(0, mainC), 2); p.Source != SourceRecipe {
			t.Errorf("main = %+v", p)
		}
	})
	t.Run("a Whole meal Leftover is placed, and covers, when nothing beside it is fixed", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), cell(0, sideC)}, rcp(1, 2, courses(mainC), whole()), rcp(3, 2, courses(sideC)))
		in.Leftovers = []Leftover{leftoverOf(7, 1, 2, day(2))}
		r := mustPlan(t, in)
		if p := wantPlaced(t, r, ck(0, mainC), 1); p.Source != SourceLeftover {
			t.Errorf("main = %+v", p)
		}
		wantNotServed(t, r, ck(0, sideC), NotServedCovered)
	})
}

func TestCoolDownRecencyAndVarietyAcrossCourses(t *testing.T) {
	t.Run("a Recipe cooked in one Course is in Cool-down for another", func(t *testing.T) {
		in := baseInput([]Slot{cell(0, sideC), mainCell(1)}, rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(mainC)))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, sideC), 1)
		if p := wantPlaced(t, r, ck(1, mainC), 2); p.Relaxed {
			t.Errorf("main = %+v, a strict pick", p)
		}
	})
	t.Run("recency looks at the Recipe in any Course", func(t *testing.T) {
		in := noCooldown(weighted(baseInput([]Slot{cell(0, sideC), mainCell(1)}, rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(mainC))), Weights{Recency: -1}))
		wantPlaced(t, mustPlan(t, in), ck(1, mainC), 2) // Recipe 1 was cooked yesterday as a side
	})
	t.Run("a fish Starter and a fish Main on one day are two fish for the week", func(t *testing.T) {
		in := noCooldown(baseInput([]Slot{mainCell(0), cell(0, starterC), mainCell(1)},
			rcp(1, 2, courses(mainC), tags("fish")), rcp(2, 2, courses(starterC), tags("fish")),
			rcp(3, 2, courses(mainC), tags("fish")), rcp(4, 2, courses(mainC))))
		in.VarietyRules = []VarietyRule{{Tag: "fish", MaxPerWeek: 2}}
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 1)
		wantPlaced(t, r, ck(0, starterC), 2)
		if p := wantPlaced(t, r, ck(1, mainC), 4); p.Relaxed {
			t.Errorf("day 1 = %+v, a strict pick", p)
		}
	})
}

func TestReservationsArePerCell(t *testing.T) {
	t.Run("the main Course of the same slot may not take the Recipe a Side rule reserves", func(t *testing.T) {
		// Other Courses of the same slot count as a gap of 0. Recipe 1 fits both; without the reservation the main
		// takes it and the Side (one Recipe per slot) could not.
		in := baseInput([]Slot{mainCell(0), cell(0, sideC, ruled(SlotRule{RecipeID: 1}))},
			rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(mainC)))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 2)
		p := wantPlaced(t, r, ck(0, sideC), 1)
		if p.Relaxed || len(p.Why) == 0 || p.Why[0].Code != ReasonSlotRule {
			t.Errorf("side = %+v, want a strict Slot Rule pick", p)
		}
	})
	t.Run("an earlier day's cell does not take the Recipe either", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), mainCell(2), cell(2, sideC, ruled(SlotRule{RecipeID: 1}))},
			rcp(1, 2, courses(mainC, sideC)), rcp(2, 2, courses(mainC)), rcp(3, 2, courses(mainC)))
		r := mustPlan(t, in)
		wantPlaced(t, r, ck(0, mainC), 2)
		wantPlaced(t, r, ck(2, sideC), 1)
	})
	t.Run("a covered cell is not open and reserves nothing", func(t *testing.T) {
		in := baseInput([]Slot{mainCell(0), mainCell(1, holding(pinnedMeal(9))), cell(1, sideC, ruled(SlotRule{RecipeID: 2}))},
			rcp(2, 2, courses(mainC, sideC)), rcp(3, 2, courses(mainC)), rcp(9, 2, courses(mainC), whole(), archived()))
		wantPlaced(t, mustPlan(t, in), ck(0, mainC), 2)
	})
}

func TestJitterIsSeededPerCell(t *testing.T) {
	t.Run("differs per Course", func(t *testing.T) {
		seen := map[float64]bool{}
		for c := int64(1); c <= 8; c++ {
			seen[JitterFor(1, ck(0, c), 1, 0.5)] = true
		}
		if len(seen) < 6 {
			t.Errorf("only %d distinct jitters over 8 Courses", len(seen))
		}
	})
	t.Run("Course 0 keeps its old value (golden)", func(t *testing.T) {
		got := JitterFor(7, SlotKey{Date: day(2), MealSlotID: dinnerSlot}, 3, 0.5)
		if absDiff(got, 0.328722025277) > 1e-9 {
			t.Errorf("JitterFor = %.12f, want 0.328722025277 (a single-Course Household must plan as before)", got)
		}
	})
}

func absDiff(a, b float64) float64 {
	if a > b {
		return a - b
	}
	return b - a
}
