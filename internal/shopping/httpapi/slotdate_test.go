package httpapi_test

import (
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// ---- B5-SD: the slot time the list reads is the date's (ADR 0014) ----

// seedMondayDinner adds a Planned Meal of the Dinner slot 90 on today (Monday 2026-11-09, clock 12:00), never marked
// Cooked or Not cooked, and sets the slot's usual time and the date's own time.
func seedMondayDinner(t *testing.T, env *testkit.Env, recipeID int64, usual, dates string) {
	t.Helper()
	exec := func(q string, args ...any) {
		t.Helper()
		if _, err := env.DB.Exec(q, args...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	exec(`UPDATE meal_slots SET time = ? WHERE id = 90`, usual)
	exec(`INSERT INTO planned_meals(date,meal_slot_id,course_id,recipe_id,batches,portions,created_at,updated_at)
		VALUES ('2026-11-09',90,(SELECT id FROM courses WHERE name='Main'),?,1,4,'2026-11-08T12:00:00Z','2026-11-08T12:00:00Z')`, recipeID)
	if dates != "" {
		exec(`INSERT INTO meal_slot_dates(slot_id,date,time,updated_at) VALUES (90,'2026-11-09',?,'2026-11-08T12:00:00Z')`, dates)
	}
}

func TestADateMovedLaterIsNotAPastMealEvenIfTheUsualTimeHasPassed(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	seedMondayDinner(t, env, 100, "08:00", "20:00") // usually 08:00 (over at 12:00), this Monday at 20:00 (ahead)
	v := getList(t, c, "")
	if len(v.Lines) != 1 || v.Lines[0].Quantity != 600 {
		t.Fatalf("Lines = %+v, want rice 600 g (both dinners count)", v.Lines)
	}
	if got := v.Lines[0].PastPlannedMeals; len(got) != 0 {
		t.Errorf("pastPlannedMeals = %+v, want none: Monday's dinner is at 20:00, still ahead", got)
	}
}

func TestADateMovedEarlierIsAPastMealEvenIfTheUsualTimeIsAhead(t *testing.T) {
	env := testkit.Start(t)
	c := env.LoginUser(t)
	rice := seedIngredient(t, env, "rice", "g")
	seedCourseDinner(t, env, courseMeal{"Main", "Risotto", rice, 300, 1})
	seedMondayDinner(t, env, 100, "19:00", "08:00") // usually 19:00, this Monday at 08:00 (over)
	v := getList(t, c, "")
	want := listPast{Date: "2026-11-09", MealSlotID: 90, MealSlotName: "Dinner", CourseName: "Main"}
	if len(v.Lines) != 1 || len(v.Lines[0].PastPlannedMeals) != 1 || v.Lines[0].PastPlannedMeals[0] != want {
		t.Errorf("Lines = %+v, want rice naming Monday's dinner (its 08:00 has passed)", v.Lines)
	}
}
