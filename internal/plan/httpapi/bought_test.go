package httpapi_test

import (
	"fmt"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit/crsc2"
)

// B5-BO: the plan API says what a Planned Meal was bought for and when a Pinned or Bought one breaks a hard rule, and
// Regenerate's dry run lists the Bought ones it would replace (ADR 0013; docs/dev/design/b5-bo.md §8). The fixture is
// crsc2: Monday Dinner 19:00 serving Main then Side for Anna and Sam; today is Monday 2026-11-09 12:00.

type boMeal struct {
	RecipeID int64 `json:"recipeId"`
	Pinned   bool  `json:"pinned"`
	Bought   *struct {
		Ingredients []struct {
			ID   int64  `json:"id"`
			Name string `json:"name"`
		} `json:"ingredients"`
	} `json:"bought"`
	Warning *struct {
		Code         string `json:"code"`
		MemberID     int64  `json:"memberId"`
		IngredientID int64  `json:"ingredientId"`
	} `json:"warning"`
}

type boSlot struct {
	Courses []struct {
		CourseID int64   `json:"courseId"`
		Meal     *boMeal `json:"meal"`
	} `json:"courses"`
}

// boWorld has Roast chicken (400 g chicken thighs, 100 g cream) and Green beans (Side), Bought meals as the tests ask.
type boWorld struct {
	*crsc2.World
	roast, beans, chicken, cream int64
}

func newBoWorld(t *testing.T) *boWorld {
	t.Helper()
	w := &boWorld{World: crsc2.New(t)}
	w.chicken, w.cream = w.Ingredient("chicken thighs"), w.Ingredient("cream")
	w.roast = w.Recipe("Roast chicken", crsc2.RecipeSpec{Lines: []crsc2.Line{{Ingredient: w.chicken, Grams: 400}, {Ingredient: w.cream, Grams: 100}}})
	w.beans = w.Recipe("Green beans", crsc2.RecipeSpec{Courses: []int64{w.Side}})
	w.Settle()
	return w
}

// bought records a purchase of the Ingredients for the Planned Meal (Lot 900).
func (w *boWorld) bought(meal int64, ingredients ...int64) {
	w.T.Helper()
	for _, ing := range ingredients {
		w.Exec(`INSERT INTO planned_meal_bought(planned_meal_id,ingredient_id,lot_id,quantity,bought_at) VALUES (?,?,900,100,'2026-11-09T11:00:00Z')`, meal, ing)
	}
}

func (w *boWorld) cell(date string, course int64) *boMeal {
	w.T.Helper()
	r := w.User.Get("/api/plan?from=" + date + "&to=" + date)
	var out struct {
		Slots []boSlot `json:"slots"`
	}
	r.MustJSON(w.T, &out)
	if r.Status != 200 || len(out.Slots) != 1 {
		w.T.Fatalf("GET /api/plan = %d %s", r.Status, r.Body)
	}
	for _, c := range out.Slots[0].Courses {
		if c.CourseID == course {
			return c.Meal
		}
	}
	w.T.Fatalf("no Course %d in %s", course, r.Body)
	return nil
}

func TestABoughtMealNamesTheIngredientsBoughtForIt(t *testing.T) {
	w := newBoWorld(t)
	main := w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, w.beans, "planned", false)
	w.bought(main, w.cream, w.chicken)
	m := w.cell(crsc2.Today, w.Main)
	if m == nil || m.Bought == nil || len(m.Bought.Ingredients) != 2 {
		t.Fatalf("Main meal = %+v, want it Bought for 2 Ingredients", m)
	}
	if got := m.Bought.Ingredients; got[0].Name != "chicken thighs" || got[0].ID != w.chicken || got[1].Name != "cream" || got[1].ID != w.cream {
		t.Errorf("bought.ingredients = %+v, want chicken thighs then cream (by name)", got)
	}
	if side := w.cell(crsc2.Today, w.Side); side == nil || side.Bought != nil {
		t.Errorf("Side meal = %+v, want bought null: Main and Side are Bought independently", side)
	}
}

func TestAPinnedMealCanBeBoughtToo(t *testing.T) {
	w := newBoWorld(t)
	main := w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", true)
	w.bought(main, w.chicken)
	if m := w.cell(crsc2.Today, w.Main); m == nil || !m.Pinned || m.Bought == nil || len(m.Bought.Ingredients) != 1 {
		t.Errorf("meal = %+v, want Pinned and Bought both", m)
	}
}

func TestAMealNothingWasBoughtForHasNullBoughtAndNullWarning(t *testing.T) {
	w := newBoWorld(t)
	w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
	r := w.User.Get("/api/plan?from=" + crsc2.Today + "&to=" + crsc2.Today)
	if r.Status != 200 || !contains(r.Body, `"bought":null`) || !contains(r.Body, `"warning":null`) {
		t.Errorf("GET /api/plan = %d %s, want \"bought\":null and \"warning\":null on the meal", r.Status, r.Body)
	}
}

func contains(b []byte, s string) bool { return strings.Contains(string(b), s) }

func TestABoughtMealThatNowBreaksAHardRuleStaysAndSaysWhich(t *testing.T) {
	cases := []struct {
		name   string
		break_ func(w *boWorld)
		code   string
		check  func(t *testing.T, w *boWorld, m *boMeal)
	}{
		{"its Recipe was archived", func(w *boWorld) { w.Exec(`UPDATE recipes SET archived = 1 WHERE id = ?`, w.roast) }, "archived", nil},
		{"the Recipe lost the Course", func(w *boWorld) {
			w.Exec(`DELETE FROM recipe_courses WHERE recipe_id = ? AND course_id = ?`, w.roast, w.Main)
		}, "course_lost", nil},
		{"a Member now excludes an Ingredient", func(w *boWorld) {
			w.Exec(`INSERT INTO member_ingredient_exclusions(member_id, ingredient_id) VALUES (?, ?)`, w.Sam, w.cream)
		}, "excluded", func(t *testing.T, w *boWorld, m *boMeal) {
			if m.Warning.MemberID != w.Sam || m.Warning.IngredientID != w.cream {
				t.Errorf("warning = %+v, want Sam and cream", m.Warning)
			}
		}},
		{"a Member now excludes the Recipe", func(w *boWorld) {
			w.Exec(`INSERT INTO member_recipe_preferences(member_id, recipe_id, state) VALUES (?, ?, 'exclusion')`, w.Anna, w.roast)
		}, "excluded", func(t *testing.T, w *boWorld, m *boMeal) {
			if m.Warning.MemberID != w.Anna || m.Warning.IngredientID != 0 {
				t.Errorf("warning = %+v, want Anna and no Ingredient", m.Warning)
			}
		}},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			w := newBoWorld(t)
			main := w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
			w.bought(main, w.chicken)
			c.break_(w)
			m := w.cell(crsc2.Today, w.Main)
			if m == nil || m.Warning == nil || m.Warning.Code != c.code {
				t.Fatalf("meal = %+v, want warning %q", m, c.code)
			}
			if c.check != nil {
				c.check(t, w, m)
			}
			if m.Bought == nil {
				t.Errorf("the meal lost its Bought: %+v", m)
			}
		})
	}
}

func TestAPinnedMealThatBreaksAHardRuleGetsTheSameWarning(t *testing.T) {
	w := newBoWorld(t)
	w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", true)
	w.Exec(`UPDATE recipes SET archived = 1 WHERE id = ?`, w.roast)
	if m := w.cell(crsc2.Today, w.Main); m == nil || m.Warning == nil || m.Warning.Code != "archived" {
		t.Errorf("meal = %+v, want an archived warning on a Pinned meal", m)
	}
}

func TestAnUnpinnedMealNothingWasBoughtForGetsNoWarning(t *testing.T) {
	w := newBoWorld(t)
	w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
	w.Exec(`UPDATE recipes SET archived = 1 WHERE id = ?`, w.roast)
	if m := w.cell(crsc2.Today, w.Main); m != nil && m.Warning != nil {
		t.Errorf("warning = %+v, want none: the planner replans an unpinned meal, nothing is held", m.Warning)
	}
}

// --- POST /api/plan/regenerate?dryRun=1 ---

type boDryRun struct {
	Replaces int `json:"replaces"`
	Bought   []struct {
		Date         string   `json:"date"`
		MealSlotName string   `json:"mealSlotName"`
		CourseName   string   `json:"courseName"`
		RecipeName   string   `json:"recipeName"`
		Ingredients  []string `json:"ingredients"`
	} `json:"bought"`
}

func TestRegenerateDryRunNamesTheBoughtPlannedMealsItWouldReplaceAndWritesNothing(t *testing.T) {
	w := newBoWorld(t)
	main := w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
	w.Meal(crsc2.Today, w.Slot, w.Side, w.beans, "planned", true) // Pinned: Regenerate never replaces it
	w.bought(main, w.cream, w.chicken)
	gen := w.Count(`SELECT generation FROM plan_state WHERE id = 1`)
	rows := w.Count(`SELECT count(*) FROM planned_meals`)

	r := w.User.Post("/api/plan/regenerate?dryRun=1", nil)
	var out boDryRun
	r.MustJSON(t, &out)
	if r.Status != 200 {
		t.Fatalf("dry run = %d %s", r.Status, r.Body)
	}
	if out.Replaces != 1 {
		t.Errorf("replaces = %d, want 1 (Monday's Main; the Pinned Side stays)", out.Replaces)
	}
	if len(out.Bought) != 1 {
		t.Fatalf("bought = %+v, want only Monday's Main", out.Bought)
	}
	b := out.Bought[0]
	if b.Date != crsc2.Today || b.MealSlotName != "Dinner" || b.CourseName != "Main" || b.RecipeName != "Roast chicken" ||
		fmt.Sprint(b.Ingredients) != "[chicken thighs cream]" {
		t.Errorf("bought[0] = %+v, want Monday Dinner Main, Roast chicken, [chicken thighs cream]", b)
	}
	if g := w.Count(`SELECT generation FROM plan_state WHERE id = 1`); g != gen {
		t.Errorf("generation %d -> %d: a dry run bumps nothing", gen, g)
	}
	if n := w.Count(`SELECT count(*) FROM planned_meals`); n != rows {
		t.Errorf("%d -> %d Planned Meals: a dry run writes nothing", rows, n)
	}
}

func TestRegenerateDryRunWithNothingBoughtAnswersAnEmptyListNotNull(t *testing.T) {
	w := newBoWorld(t)
	w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
	r := w.User.Post("/api/plan/regenerate?dryRun=1", nil)
	if r.Status != 200 || !contains(r.Body, `"bought":[]`) || !contains(r.Body, `"replaces":1`) {
		t.Errorf("dry run = %d %s, want {\"replaces\":1,\"bought\":[]}", r.Status, r.Body)
	}
}

func TestRegenerateWithoutDryRunStillRegenerates(t *testing.T) {
	w := newBoWorld(t)
	w.Meal(crsc2.Today, w.Slot, w.Main, w.roast, "planned", false)
	gen := w.Count(`SELECT generation FROM plan_state WHERE id = 1`)
	if r := w.User.Post("/api/plan/regenerate", nil); r.Status != 200 {
		t.Fatalf("regenerate = %d %s", r.Status, r.Body)
	}
	if g := w.Count(`SELECT generation FROM plan_state WHERE id = 1`); g != gen+1 {
		t.Errorf("generation %d -> %d, want one more", gen, g)
	}
}
