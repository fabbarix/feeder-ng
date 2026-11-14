package service_test

import (
	"context"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/cooktest"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/cook/store"
	"github.com/fabbarix/feeder-ng/internal/events"
	"github.com/fabbarix/feeder-ng/internal/recipe/schedule"
)

// BR-G (docs/dev/design/base-recipes.md section 9): the service asks the Recipes port for a Planned Meal's Steps with the
// meal's Batches, so the adapter can read Stock at cook time, and for a Recipe opened on its own without them (everything
// is made).
//
// Pinned API in package service (ports.go): an optional interface on the Recipes port,
//
//	type MealRecipes interface {
//	    MealSteps(ctx context.Context, recipeID int64, batches float64, date string) (cook.RecipeSteps, error)  // date: the meal's (beta.8)
//	}
//
// The service calls MealSteps wherever it holds a Planned Meal (CourseView, SlotTimeline, a timer or mark on a meal scope,
// the board's next Advance Step) when the port implements it, and Steps everywhere else (RecipeView, a recipe scope) and
// when it does not. Existing fakes that only have Steps keep working. The timeline and view payloads:
//
//	service.TimelineItem{..., BaseRecipe *cook.BaseRecipe}   service.TimelineAdvance{..., BaseRecipe *cook.BaseRecipe}
//	service.Timeline{..., Covered []cook.BaseRecipe}          service.CookView.View.Covered (cook.View)

type mealRecipes struct {
	plain    cook.RecipeSteps // Steps: everything made
	covered  cook.RecipeSteps // MealSteps when the jar covers the meal
	jar      float64          // Batches at or below which the jar covers the Base recipe
	calls    []string
	lastMeal float64
	lastDate string // the meal date MealSteps got (beta.8)
}

func (m *mealRecipes) Steps(_ context.Context, id int64) (cook.RecipeSteps, error) {
	m.calls = append(m.calls, "Steps")
	return m.plain, nil
}

func (m *mealRecipes) MealSteps(_ context.Context, id int64, batches float64, date string) (cook.RecipeSteps, error) {
	m.calls = append(m.calls, "MealSteps")
	m.lastMeal, m.lastDate = batches, date
	if batches <= m.jar {
		return m.covered, nil
	}
	return m.plain, nil
}

func lasagneSteps(covered bool) cook.RecipeSteps {
	b := &cook.BaseRecipe{ID: 7, Name: "Béchamel", Path: []string{"Béchamel"}}
	rs := cook.RecipeSteps{RecipeID: 3, Name: "Lasagne", Steps: []cook.Step{
		{Kind: schedule.Active, Text: "Melt the butter", DurationMinutes: 5, BaseRecipe: b},
		{Kind: schedule.Passive, Text: "Simmer the sauce", DurationMinutes: 20, After: []int{0}, BaseRecipe: b},
		{Kind: schedule.Active, Text: "Layer the lasagne", DurationMinutes: 10, After: []int{1}},
		{Kind: schedule.Passive, Text: "Bake", DurationMinutes: 30, After: []int{2}},
	}}
	if covered {
		for i := 0; i < 2; i++ {
			rs.Steps[i].Covered, rs.Steps[i].Kind, rs.Steps[i].DurationMinutes = true, schedule.Active, 0
			rs.Steps[i].After = nil
		}
	}
	return rs
}

func brgSetup(t *testing.T) (*service.Service, *mealRecipes, *fakeMeals) {
	t.Helper()
	rome, _ := time.LoadLocation("Europe/Rome")
	recipes := &mealRecipes{plain: lasagneSteps(false), covered: lasagneSteps(true), jar: 1}
	meals := &fakeMeals{meals: []service.MealInfo{
		{Date: "2026-11-09", MealSlotID: 3, CourseID: 5, SlotName: "Dinner", RecipeID: 3, Batches: 1, State: "planned", At: time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)},
	}}
	svc := service.New(service.Config{Store: store.New(cooktest.NewDB(t)), Clock: clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)),
		Bus: events.NewBus(), Recipes: recipes, Meals: meals, Waste: &fakeWaste{}, Household: &fakeHousehold{zone: rome}})
	return svc, recipes, meals
}

func TestServiceAsksForAMealsStepsWithItsBatchesAndARecipesWithoutThem(t *testing.T) {
	svc, recipes, _ := brgSetup(t)
	if _, err := svc.CourseView(ctx, "2026-11-09", 3, 5); err != nil {
		t.Fatal(err)
	}
	if len(recipes.calls) == 0 || recipes.calls[0] != "MealSteps" || recipes.lastMeal != 1 {
		t.Errorf("CourseView called %v with %v Batches, want MealSteps with the meal's 1", recipes.calls, recipes.lastMeal)
	}
	recipes.calls = nil
	if _, err := svc.RecipeView(ctx, 3, 1); err != nil {
		t.Fatal(err)
	}
	if len(recipes.calls) != 1 || recipes.calls[0] != "Steps" {
		t.Errorf("RecipeView called %v, want Steps only: a Recipe opened on its own assumes everything is made", recipes.calls)
	}
}

func TestTimelineHidesTheCoveredStepsAndLabelsTheOthers(t *testing.T) {
	svc, _, _ := brgSetup(t)
	tl, err := svc.SlotTimeline(ctx, "2026-11-09", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(tl.Items) != 2 || tl.Items[0].Text != "Layer the lasagne" || tl.Items[1].Text != "Bake" || tl.TotalMinutes != 40 {
		t.Fatalf("items = %+v over %d minutes; want Layer and Bake only (the jar covers Béchamel)", tl.Items, tl.TotalMinutes)
	}
	if tl.Items[0].Step != 2 || tl.Items[1].Step != 3 || tl.Items[0].Number != 1 || tl.Items[1].Number != 2 {
		t.Errorf("steps %d, %d numbers %d, %d; want the composed indexes 2 and 3 numbered 1 and 2", tl.Items[0].Step, tl.Items[1].Step, tl.Items[0].Number, tl.Items[1].Number)
	}
	if len(tl.Covered) != 1 || tl.Covered[0].Name != "Béchamel" {
		t.Errorf("Covered = %+v, want Béchamel", tl.Covered)
	}
}

func TestTimelineLabelsABaseRecipesStepsWhenNothingIsCovered(t *testing.T) {
	svc, recipes, meals := brgSetup(t)
	meals.meals[0].Batches = 2 // the jar covers one Batch only
	tl, err := svc.SlotTimeline(ctx, "2026-11-09", 3)
	if err != nil {
		t.Fatal(err)
	}
	if recipes.lastMeal != 2 {
		t.Errorf("MealSteps got %v Batches, want 2", recipes.lastMeal)
	}
	if len(tl.Items) != 4 || len(tl.Covered) != 0 {
		t.Fatalf("items %+v covered %+v", tl.Items, tl.Covered)
	}
	for i, it := range tl.Items {
		wantLabel := i < 2
		if (it.BaseRecipe != nil) != wantLabel || (wantLabel && it.BaseRecipe.Name != "Béchamel") {
			t.Errorf("item %d %q: baseRecipe = %+v", i, it.Text, it.BaseRecipe)
		}
	}
	if it := tl.Items[1]; it.TimerSeconds != 1200 || it.TimerLabel != "Béchamel: Simmer the sauce" {
		t.Errorf("Simmer timer = %d s %q, want 1200 s labelled with the Base recipe", it.TimerSeconds, it.TimerLabel)
	}
}

func TestStartTimerOnAMealScopeUsesTheMealsSteps(t *testing.T) {
	svc, _, _ := brgSetup(t)
	// Step 1 is a covered (zero-length Active) Step for this meal's Batches: it has no timer.
	_, _, err := svc.StartTimer(ctx, service.StartInput{Scope: "meal:2026-11-09/3/5", Step: intp(1)})
	if err == nil || err != service.ErrNotPassiveStep {
		t.Errorf("a covered Step: err = %v, want ErrNotPassiveStep", err)
	}
	// Step 3 is Lasagne's own Bake.
	tm, _, err := svc.StartTimer(ctx, service.StartInput{Scope: "meal:2026-11-09/3/5", Step: intp(3)})
	if err != nil || tm.DurationSeconds != 1800 {
		t.Errorf("Bake timer = %+v, %v", tm, err)
	}
}

func TestAPortWithoutMealStepsStillWorks(t *testing.T) {
	// The existing fakes only have Steps (fakeRecipes): nothing changes for them.
	f := setup(t)
	f.meals.meals = []service.MealInfo{{Date: "2026-11-09", MealSlotID: 3, CourseID: 5, SlotName: "Dinner", RecipeID: 12, Batches: 1, State: "planned", At: time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)}}
	v, err := f.svc.CourseView(ctx, "2026-11-09", 3, 5)
	if err != nil || len(v.Steps) != 3 {
		t.Errorf("view = %+v, %v", v.View, err)
	}
}
