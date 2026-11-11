package planner

import "testing"

// Courses (crs-b): helpers for tests that plan cells, one Course of one Meal Slot on one date.
// The Dinner Meal Slot serves the Courses below; a Recipe is marked with courses(...).

const (
	mainC    int64 = 1
	sideC    int64 = 2
	starterC int64 = 3
	dessertC int64 = 4
)

// ck is the key of the Dinner cell of Course c on day n.
func ck(n int, c int64) SlotKey { return SlotKey{Date: day(n), MealSlotID: dinnerSlot, CourseID: c} }

type cellOpt func(*Slot)

// cell is the Dinner cell of Course c on day n, attended by anna and ben (2 portions). Its Position is the Course id.
func cell(n int, c int64, opts ...cellOpt) Slot {
	s := dinner(n)
	s.Key.CourseID = c
	s.Position = int(c)
	for _, o := range opts {
		o(&s)
	}
	return s
}

// mainCell is the main Course's cell (position 0).
func mainCell(n int, opts ...cellOpt) Slot {
	return cell(n, mainC, append([]cellOpt{isMain()}, opts...)...)
}

func isMain() cellOpt              { return func(s *Slot) { s.Main, s.Position = true, 0 } }
func isOptional() cellOpt          { return func(s *Slot) { s.Optional = true } }
func atPosition(p int) cellOpt     { return func(s *Slot) { s.Position = p } }
func eats(att ...Attendee) cellOpt { return func(s *Slot) { s.Attendance = att } }
func optedOut() cellOpt            { return func(s *Slot) { s.Attendance, s.AllOptedOut = nil, true } }
func ruled(r ...SlotRule) cellOpt  { return func(s *Slot) { s.Rules = r } }
func holding(m ExistingMeal) cellOpt {
	return func(s *Slot) { s.Existing = &m }
}

func pinnedMeal(r RecipeID) ExistingMeal {
	return ExistingMeal{State: MealPinned, RecipeID: r, Batches: 1}
}
func plannedMeal(r RecipeID) ExistingMeal {
	return ExistingMeal{State: MealPlanned, RecipeID: r, Batches: 1}
}
func cookedMeal(r RecipeID) ExistingMeal {
	return ExistingMeal{State: MealCooked, RecipeID: r, Batches: 1}
}
func skippedMeal(r RecipeID) ExistingMeal {
	return ExistingMeal{State: MealSkipped, RecipeID: r, Batches: 1}
}
func relaxedMeal(r RecipeID) ExistingMeal {
	m := plannedMeal(r)
	m.Relaxed = true
	return m
}

func courses(ids ...int64) recipeOpt { return func(r *Recipe) { r.CourseIDs = ids } }
func whole() recipeOpt               { return func(r *Recipe) { r.WholeMeal = true } }

func placedAt(r Result, k SlotKey) (Placement, bool) {
	for _, p := range r.Placements {
		if p.Key == k {
			return p, true
		}
	}
	return Placement{}, false
}

func isUnfilled(r Result, k SlotKey) bool {
	for _, u := range r.Unfilled {
		if u.Key == k {
			return true
		}
	}
	return false
}

func isKept(r Result, k SlotKey) bool { return keysOf(r.Kept)[k] }

func notServedAt(r Result, k SlotKey) (NotServedCause, bool) {
	for _, n := range r.NotServed {
		if n.Key == k {
			return n.Cause, true
		}
	}
	return "", false
}

// wantEmptyNoReason asserts the cell holds nothing from this run (no placement, not Kept) and has no Couldn't plan reason.
func wantEmptyNoReason(t *testing.T, r Result, k SlotKey) {
	t.Helper()
	if _, ok := placedAt(r, k); ok {
		t.Errorf("cell %+v was placed: %+v", k, r.Placements)
	}
	if isUnfilled(r, k) {
		t.Errorf("cell %+v has a Couldn't plan reason: %+v", k, r.Unfilled)
	}
	if isKept(r, k) {
		t.Errorf("cell %+v was kept", k)
	}
}

func wantNotServed(t *testing.T, r Result, k SlotKey, cause NotServedCause) {
	t.Helper()
	wantEmptyNoReason(t, r, k)
	got, ok := notServedAt(r, k)
	if !ok || got != cause {
		t.Errorf("NotServed for %+v = %q (listed %v), want %q; all: %+v", k, got, ok, cause, r.NotServed)
	}
}

func wantPlaced(t *testing.T, r Result, k SlotKey, recipe RecipeID) Placement {
	t.Helper()
	p, ok := placedAt(r, k)
	if !ok {
		t.Fatalf("cell %+v not placed; placements %+v unfilled %+v notServed %+v", k, r.Placements, r.Unfilled, r.NotServed)
	}
	if p.RecipeID != recipe {
		t.Errorf("cell %+v = Recipe %d, want %d", k, p.RecipeID, recipe)
	}
	return p
}

func recheckAt(t *testing.T, r Result, k SlotKey) Recheck {
	t.Helper()
	for _, c := range r.Rechecks {
		if c.Key == k {
			return c
		}
	}
	t.Fatalf("no Recheck for %+v in %+v", k, r.Rechecks)
	return Recheck{}
}

// wantRelaxedChip asserts the Why list ends with a chip of the given code and returns it.
func wantRelaxedChip(t *testing.T, why []Why, code ReasonCode) Why {
	t.Helper()
	if len(why) == 0 || why[len(why)-1].Code != code {
		t.Fatalf("chips = %+v, want the last to be %s", why, code)
	}
	return why[len(why)-1]
}
