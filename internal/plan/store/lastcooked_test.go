package store_test

import "testing"

// Beta.5 F7: Last cooked is a function of planned_meals, owned by the plan store (reconcile §7.2, §7.3).
// "Cooked, fresh, any Course; the Planned Meal's date counts" (plan 2.7).

// insertMeal writes a Planned Meal row directly, so a test can set any state, Course and Leftover link.
func (f *fixture) insertMeal(t *testing.T, date string, slot, course, recipe int64, state string, fromDate any, resolvedAt any) {
	t.Helper()
	// A Leftover-served meal names the slot and Course of the fresh meal that produced it (from_date, from_meal_slot_id, from_course_id).
	var fromSlot, fromCourse any
	if fromDate != nil {
		fromSlot, fromCourse = slot, course
	}
	if _, err := f.db.Exec(`INSERT INTO planned_meals (date, meal_slot_id, course_id, recipe_id, batches, portions, state, from_date, from_meal_slot_id, from_course_id, resolved_at, created_at, updated_at)
		VALUES (?, ?, ?, ?, 1, 3, ?, ?, ?, ?, ?, '2026-11-01T00:00:00Z', '2026-11-01T00:00:00Z')`,
		date, slot, course, recipe, state, fromDate, fromSlot, fromCourse, resolvedAt); err != nil {
		t.Fatal(err)
	}
}

func TestLastCookedIsTheLatestCookedDatePerRecipe(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.insertMeal(t, "2026-10-03", f.dinner, c.main, f.chicken, "cooked", nil, nil)
	f.insertMeal(t, "2026-10-20", f.dinner, c.main, f.chicken, "cooked", nil, nil)
	f.insertMeal(t, "2026-10-11", f.dinner, c.main, f.chicken, "cooked", nil, nil)
	f.insertMeal(t, "2026-11-02", f.lunch, c.main, f.pasta, "cooked", nil, nil)
	got, err := f.st.LastCooked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got[f.chicken] != "2026-10-20" || got[f.pasta] != "2026-11-02" {
		t.Errorf("LastCooked = %v, want chicken 2026-10-20 and pasta 2026-11-02", got)
	}
}

func TestLastCookedLeavesOutARecipeNeverCooked(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.insertMeal(t, "2026-11-02", f.dinner, c.main, f.chicken, "cooked", nil, nil)
	got, err := f.st.LastCooked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got[f.soup]; ok || len(got) != 1 {
		t.Errorf("LastCooked = %v, want only chicken (soup was never planned)", got)
	}
}

func TestLastCookedCountsOnlyCookedMeals(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.insertMeal(t, "2026-11-05", f.dinner, c.main, f.chicken, "planned", nil, nil)
	f.insertMeal(t, "2026-11-06", f.dinner, c.main, f.pasta, "skipped", nil, nil)
	f.insertMeal(t, "2026-10-01", f.lunch, c.main, f.soup, "cooked", nil, nil)
	got, err := f.st.LastCooked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := got[f.chicken]; ok {
		t.Errorf("a planned meal counted: %v", got)
	}
	if _, ok := got[f.pasta]; ok {
		t.Errorf("a skipped (Not cooked) meal counted: %v", got)
	}
	if got[f.soup] != "2026-10-01" {
		t.Errorf("LastCooked = %v, want soup 2026-10-01", got)
	}
}

func TestLastCookedIgnoresAMealServedFromALeftover(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.insertMeal(t, "2026-11-02", f.dinner, c.main, f.chicken, "cooked", nil, nil)
	// Wednesday 2026-11-04: the Leftover of Monday's chicken is served; nothing was cooked.
	f.insertMeal(t, "2026-11-04", f.dinner, c.main, f.chicken, "cooked", "2026-11-02", nil)
	got, err := f.st.LastCooked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got[f.chicken] != "2026-11-02" {
		t.Errorf("LastCooked = %v, want chicken 2026-11-02 (the Leftover served on the 4th does not count)", got)
	}
}

func TestLastCookedOfARecipeOnlyServedFromALeftoverIsAbsent(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.insertMeal(t, "2026-11-04", f.dinner, c.main, f.pasta, "cooked", "2026-11-02", nil)
	got, err := f.st.LastCooked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if len(got) != 0 {
		t.Errorf("LastCooked = %v, want empty", got)
	}
}

func TestLastCookedCountsAnyCourse(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.insertMeal(t, "2026-11-03", f.dinner, c.dessert, f.soup, "cooked", nil, nil)
	f.insertMeal(t, "2026-11-04", f.dinner, c.side, f.pasta, "cooked", nil, nil)
	got, err := f.st.LastCooked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got[f.soup] != "2026-11-03" || got[f.pasta] != "2026-11-04" {
		t.Errorf("LastCooked = %v, want soup 2026-11-03 (Dessert) and pasta 2026-11-04 (Side)", got)
	}
}

func TestLastCookedUsesThePlannedMealsDateNotTheDayItWasMarked(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	// Cooked on the 2nd, marked a week later.
	f.insertMeal(t, "2026-11-02", f.dinner, c.main, f.chicken, "cooked", nil, "2026-11-09T08:00:00Z")
	got, err := f.st.LastCooked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got[f.chicken] != "2026-11-02" {
		t.Errorf("LastCooked = %v, want 2026-11-02, the meal's date", got)
	}
}

func TestLastCookedForgetsAMealMarkedNotCookedAgain(t *testing.T) {
	f := newFixture(t)
	c := f.courses(t)
	f.insertMeal(t, "2026-10-05", f.dinner, c.main, f.chicken, "cooked", nil, nil)
	f.insertMeal(t, "2026-11-02", f.dinner, c.main, f.chicken, "cooked", nil, nil)
	if _, err := f.db.Exec(`UPDATE planned_meals SET state = 'skipped' WHERE date = '2026-11-02'`); err != nil {
		t.Fatal(err)
	}
	got, err := f.st.LastCooked(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if got[f.chicken] != "2026-10-05" {
		t.Errorf("LastCooked = %v, want 2026-10-05 (the later meal is Not cooked now)", got)
	}
}
