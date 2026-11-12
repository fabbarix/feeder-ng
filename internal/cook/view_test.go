package cook_test

import (
	"errors"
	"math"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// Spec §11 example Recipe: an overnight marinade (Advance), chop, simmer (Passive) and plate.
func carbonara() cook.RecipeSteps {
	return cook.RecipeSteps{RecipeID: 12, Name: "Chicken stew", Steps: []cook.Step{
		{Kind: schedule.Advance, Text: "Marinate the chicken", LeadTimeMinutes: 240, Uses: []schedule.Use{{Ingredient: "chicken thighs", Quantity: 500, Unit: "g"}}},
		{Kind: schedule.Active, Text: "Chop the onions", DurationMinutes: 10, Uses: []schedule.Use{{Ingredient: "onion", Quantity: 2, Unit: "piece"}}},
		{Kind: schedule.Passive, Text: "Simmer the stew", DurationMinutes: 45},
		{Kind: schedule.Advance, Text: "Soak the beans", LeadTimeMinutes: 480},
		{Kind: schedule.Active, Text: "Plate up", DurationMinutes: 5},
	}}
}

func TestBuildViewScalesUsesByBatches(t *testing.T) {
	v, err := cook.BuildView(cook.RecipeScope(12), carbonara(), 2, nil)
	if err != nil {
		t.Fatal(err)
	}
	if v.RecipeName != "Chicken stew" || v.RecipeID != 12 || v.Batches != 2 || v.Scope != "recipe:12" {
		t.Fatalf("header = %+v", v)
	}
	chop := v.Steps[0]
	if len(chop.Uses) != 1 || chop.Uses[0].Quantity != 4 || chop.Uses[0].Ingredient != "onion" || chop.Uses[0].Unit != "piece" {
		t.Errorf("2 onions x 2 Batches = 4, got %+v", chop.Uses)
	}
	// The input is untouched.
	if carbonara().Steps[1].Uses[0].Quantity != 2 {
		t.Error("input mutated")
	}
}

func TestBuildViewFractionalBatches(t *testing.T) {
	v, err := cook.BuildView(cook.RecipeScope(12), carbonara(), 1.5, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Advance[0].Step; got != 0 {
		t.Fatalf("advance step index %d", got)
	}
	if got := v.Steps[0].Uses[0].Quantity; math.Abs(got-3) > 1e-9 {
		t.Errorf("2 x 1.5 = 3, got %v", got)
	}
}

func TestBuildViewInvalidBatches(t *testing.T) {
	for _, b := range []float64{0, -1, math.NaN(), math.Inf(1)} {
		if _, err := cook.BuildView(cook.RecipeScope(12), carbonara(), b, nil); !errors.Is(err, schedule.ErrInvalidBatches) {
			t.Errorf("batches %v: err = %v", b, err)
		}
	}
}

func TestBuildViewSeparatesAdvanceStepsAndNumbersTheRest(t *testing.T) {
	v, _ := cook.BuildView(cook.RecipeScope(12), carbonara(), 1, nil)
	if len(v.Advance) != 2 || v.Advance[0].Text != "Marinate the chicken" || v.Advance[1].Text != "Soak the beans" || v.Advance[1].Step != 3 || v.Advance[0].LeadTimeMinutes != 240 {
		t.Fatalf("advance = %+v", v.Advance)
	}
	if len(v.Steps) != 3 {
		t.Fatalf("steps = %+v", v.Steps)
	}
	want := []struct {
		index, number int
		text          string
	}{{1, 1, "Chop the onions"}, {2, 2, "Simmer the stew"}, {4, 3, "Plate up"}}
	for i, w := range want {
		s := v.Steps[i]
		if s.Index != w.index || s.Number != w.number || s.Of != 3 || s.Text != w.text {
			t.Errorf("step %d = %+v, want index %d number %d", i, s, w.index, w.number)
		}
	}
}

func TestBuildViewMarksAndWarnings(t *testing.T) {
	doneAt := time.Date(2026, 11, 8, 20, 0, 0, 0, time.UTC)
	v, _ := cook.BuildView(cook.MealScope("2026-11-09", 3, 7), carbonara(), 1, map[int]time.Time{0: doneAt})
	a, b := v.Advance[0], v.Advance[1]
	if !a.Done || a.Warning || a.DoneAt == nil || !a.DoneAt.Equal(doneAt) {
		t.Errorf("marked Advance Step = %+v", a)
	}
	if b.Done || !b.Warning || b.DoneAt != nil {
		t.Errorf("unmarked Advance Step must warn: %+v", b)
	}
	// A mark on a non-Advance Step index is ignored.
	v, _ = cook.BuildView(cook.MealScope("2026-11-09", 3, 7), carbonara(), 1, map[int]time.Time{1: doneAt})
	if !v.Advance[0].Warning {
		t.Error("marks only apply to Advance Steps")
	}
}

func TestBuildViewPassiveStepsCarryATimer(t *testing.T) {
	v, _ := cook.BuildView(cook.RecipeScope(12), carbonara(), 1, nil)
	if v.Steps[0].Timer != nil || v.Steps[2].Timer != nil {
		t.Error("only Passive Steps have a timer")
	}
	tm := v.Steps[1].Timer
	if tm == nil || tm.DurationSeconds != 2700 || tm.Label != "Step 2: Simmer the stew" {
		t.Errorf("Passive timer = %+v, want 2700 s", tm)
	}
}

func TestBuildViewReadyMealHasNoSteps(t *testing.T) {
	v, err := cook.BuildView(cook.RecipeScope(1), cook.RecipeSteps{RecipeID: 1, Name: "Frozen pizza"}, 1, nil)
	if err != nil || len(v.Steps) != 0 || len(v.Advance) != 0 {
		t.Errorf("v = %+v err = %v", v, err)
	}
}

// Cook Mode holds Next on a Step until the Steps in its `after` are done, so the view carries them.
func TestBuildViewCarriesAfter(t *testing.T) {
	rs := cook.RecipeSteps{RecipeID: 3, Name: "Roast", Steps: []cook.Step{
		{Kind: schedule.Passive, Text: "Pre-heat the oven", DurationMinutes: 15},
		{Kind: schedule.Active, Text: "Season the meat", DurationMinutes: 5},
		{Kind: schedule.Passive, Text: "Put the meat in the oven", DurationMinutes: 60, After: []int{0, 1}},
	}}
	v, err := cook.BuildView(cook.RecipeScope(3), rs, 1, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := v.Steps[2].After; len(got) != 2 || got[0] != 0 || got[1] != 1 {
		t.Fatalf("after = %v, want [0 1]", got)
	}
	if v.Steps[0].After == nil || len(v.Steps[0].After) != 0 {
		t.Fatalf("a Step with no after has [] (never nil), got %#v", v.Steps[0].After)
	}
	rs.Steps[2].After[0] = 9
	if v.Steps[2].After[0] != 0 {
		t.Error("the view shares the input's slice")
	}
}
