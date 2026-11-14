package service_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/cook"
	"github.com/fabbarix/feeder-ng/internal/cook/cooktest"
	"github.com/fabbarix/feeder-ng/internal/cook/service"
	"github.com/fabbarix/feeder-ng/internal/cook/store"
	"github.com/fabbarix/feeder-ng/internal/events"
)

// BR-G round 2: the Courses of one slot share the Stock, as Mark all Cooked does. Each Course sees only what the Courses
// before it (in the slot's Course order) leave. The service cannot do the arithmetic (it has no Stock), so it asks the
// Recipes port once per slot read, with the open fresh Courses in order.
//
// Pinned API in package service (ports.go), an optional interface preferred over MealRecipes when the port has it:
//
//	type SlotMeal struct { RecipeID int64; Batches float64; Date string }  // Date: the meal's (beta.8)
//	type SlotRecipes interface {
//	    // SlotSteps gives the Steps of each meal, in the order given; meal i sees the Stock that meals 0..i-1 leave.
//	    SlotSteps(ctx context.Context, meals []SlotMeal) ([]cook.RecipeSteps, error)
//	}
//
// SlotTimeline calls it once with every planned, fresh (Batches > 0) Course of the slot, in the slot's order, and uses the
// answer of index i for Course i (never one answer per Recipe: two Courses of one Recipe and one Batch count differ). A
// Course read on its own (CourseView, and a timer or mark on a meal scope) calls it with the slot's planned fresh Courses up
// to and including that Course, and uses the last answer: it sees what the earlier Courses will take.

type slotRecipes struct {
	*mealRecipes
	results []cook.RecipeSteps // answer i is for meal i of a call
	calls   [][]service.SlotMeal
}

func (s *slotRecipes) SlotSteps(_ context.Context, meals []service.SlotMeal) ([]cook.RecipeSteps, error) {
	s.calls = append(s.calls, append([]service.SlotMeal(nil), meals...))
	if len(meals) > len(s.results) {
		return nil, errors.New("more meals than prepared results")
	}
	return append([]cook.RecipeSteps(nil), s.results[:len(meals)]...), nil
}

// twoLasagnes is a slot of two Courses (5 and 6, in that order) that both cook Recipe 3 for one Batch, with a cooked Course 4
// before them. The jar covers Béchamel for the first one only.
func twoLasagnes(t *testing.T) (*service.Service, *slotRecipes) {
	t.Helper()
	rome, _ := time.LoadLocation("Europe/Rome")
	sr := &slotRecipes{mealRecipes: &mealRecipes{plain: lasagneSteps(false), covered: lasagneSteps(true), jar: 1},
		results: []cook.RecipeSteps{lasagneSteps(true), lasagneSteps(false)}}
	at := time.Date(2026, 11, 9, 18, 0, 0, 0, time.UTC)
	meals := &fakeMeals{meals: []service.MealInfo{
		{Date: "2026-11-09", MealSlotID: 3, CourseID: 4, SlotName: "Dinner", RecipeID: 3, Batches: 1, State: "cooked", At: at},
		{Date: "2026-11-09", MealSlotID: 3, CourseID: 5, SlotName: "Dinner", RecipeID: 3, Batches: 1, State: "planned", At: at},
		{Date: "2026-11-09", MealSlotID: 3, CourseID: 6, SlotName: "Dinner", RecipeID: 3, Batches: 1, State: "planned", At: at},
	}}
	svc := service.New(service.Config{Store: store.New(cooktest.NewDB(t)), Clock: clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)),
		Bus: events.NewBus(), Recipes: sr, Meals: meals, Waste: &fakeWaste{}, Household: &fakeHousehold{zone: rome}})
	return svc, sr
}

func TestTimelineGivesEachCourseOnlyWhatTheEarlierCoursesLeave(t *testing.T) {
	svc, sr := twoLasagnes(t)
	tl, err := svc.SlotTimeline(ctx, "2026-11-09", 3)
	if err != nil {
		t.Fatal(err)
	}
	if len(sr.calls) != 1 || len(sr.calls[0]) != 2 || sr.calls[0][0] != (service.SlotMeal{RecipeID: 3, Batches: 1, Date: "2026-11-09"}) || sr.calls[0][1] != (service.SlotMeal{RecipeID: 3, Batches: 1, Date: "2026-11-09"}) {
		t.Fatalf("SlotSteps calls = %+v, want one call with the two planned Courses in order (the cooked one is not in it)", sr.calls)
	}
	per := map[int64][]string{}
	for _, it := range tl.Items {
		per[it.CourseID] = append(per[it.CourseID], it.Text)
	}
	if len(per[5]) != 2 || per[5][0] != "Layer the lasagne" || len(per[6]) != 4 || per[6][0] != "Melt the butter" {
		t.Errorf("items per Course = %v, want Course 5 (covered) with Layer and Bake, Course 6 with Béchamel's Steps as well, "+
			"although both are the same Recipe and Batches", per)
	}
	if len(tl.Covered) != 1 || tl.Covered[0].Name != "Béchamel" {
		t.Errorf("Covered = %+v, want Béchamel (covered for Course 5)", tl.Covered)
	}
}

func TestCourseViewSeesWhatTheEarlierCoursesWillTake(t *testing.T) {
	svc, sr := twoLasagnes(t)
	v5, err := svc.CourseView(ctx, "2026-11-09", 3, 5)
	if err != nil {
		t.Fatal(err)
	}
	if len(sr.calls) != 1 || len(sr.calls[0]) != 1 || len(v5.Steps) != 2 {
		t.Errorf("Course 5: calls %+v, %d Steps; want a call with itself only and the covered view (2 Steps)", sr.calls, len(v5.Steps))
	}
	sr.calls = nil
	v6, err := svc.CourseView(ctx, "2026-11-09", 3, 6)
	if err != nil {
		t.Fatal(err)
	}
	if len(sr.calls) != 1 || len(sr.calls[0]) != 2 {
		t.Errorf("Course 6 calls = %+v, want one call with Courses 5 and 6 (the cooked Course 4 is left out)", sr.calls)
	}
	if len(v6.Steps) != 4 {
		t.Errorf("Course 6 shows %d Steps, want 4: Course 5 takes the jar", len(v6.Steps))
	}
}

func TestATimerOnAMealScopeSeesWhatTheEarlierCoursesWillTake(t *testing.T) {
	svc, _ := twoLasagnes(t)
	// Step 1 is Béchamel's Simmer: covered (no timer) for Course 5, a 20 minute Passive Step for Course 6.
	if _, _, err := svc.StartTimer(ctx, service.StartInput{Scope: "meal:2026-11-09/3/5", Step: intp(1)}); !errors.Is(err, service.ErrNotPassiveStep) {
		t.Errorf("Course 5, covered Step: err = %v, want ErrNotPassiveStep", err)
	}
	tm, _, err := svc.StartTimer(ctx, service.StartInput{Scope: "meal:2026-11-09/3/6", Step: intp(1)})
	if err != nil || tm.DurationSeconds != 1200 {
		t.Errorf("Course 6 Simmer timer = %+v, %v; want 1200 s", tm, err)
	}
}
