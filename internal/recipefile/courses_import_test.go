package recipefile_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// crs-e1: Courses and Whole meal in Import Review (docs/dev/design/crs-e1.md). The household in these tests has
// Main (id 1, main), Side (2), Starter (3), Dessert (4) and an archived Soup (5), in that order, and the
// Ingredient "Rice" (g) that miniRecipe uses.

const (
	idMain = int64(1) + iota
	idSide
	idStarter
	idDessert
	idSoup
)

func courseEx() recipefile.Existing {
	return recipefile.Existing{
		Ingredients: []ingredientT{ing(50, "Rice", "g")},
		Courses: []recipefile.CourseRef{
			{ID: idMain, Name: "Main", Main: true},
			{ID: idSide, Name: "Side"},
			{ID: idStarter, Name: "Starter"},
			{ID: idDessert, Name: "Dessert"},
			{ID: idSoup, Name: "Soup", Archived: true},
		},
	}
}

func riceWith(name string, courses ...string) recipefile.Recipe {
	r := miniRecipe(name)
	r.Courses = courses
	return r
}

func commitOf(t *testing.T, f recipefile.File, ex recipefile.Existing, d recipefile.Decisions) recipefile.Commit {
	t.Helper()
	c, err := recipefile.BuildCommit(f, ex, d, noImages)
	if err != nil {
		t.Fatalf("BuildCommit: %v", err)
	}
	return c
}

func courseRow(t *testing.T, p recipefile.Plan, key string) recipefile.CourseMatch {
	t.Helper()
	for _, c := range p.Courses {
		if c.Key == key {
			return c
		}
	}
	t.Fatalf("no course row %q in %+v", key, p.Courses)
	return recipefile.CourseMatch{}
}

func TestAFileWithoutCoursesGivesTheMainCourse(t *testing.T) {
	f := fileOf(miniRecipe("Plain rice"))
	p := plan(t, f, courseEx(), recipefile.Decisions{})
	if !p.Ready || len(p.Courses) != 0 {
		t.Fatalf("plan = %+v, want ready with no Course rows", p)
	}
	c := commitOf(t, f, courseEx(), recipefile.Decisions{})
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idMain}) {
		t.Fatalf("CourseIDs = %v, want the main Course", got)
	}
	if len(c.NewCourses) != 0 || len(c.UnarchiveCourses) != 0 || len(c.Recipes[0].NewCourseKeys) != 0 {
		t.Fatalf("nothing is created: %+v", c)
	}
}

func TestAnEmptyCoursesListGivesTheMainCourse(t *testing.T) {
	f := fileOf(riceWith("Plain rice"))
	f.Recipes[0].Courses = []string{}
	c := commitOf(t, f, courseEx(), recipefile.Decisions{})
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idMain}) {
		t.Fatalf("CourseIDs = %v", got)
	}
}

func TestNamesMatchByNameKeyAndComeOutInHouseholdOrder(t *testing.T) {
	// Case and spacing are ignored; accents are not folded; the Course ids come in household order, not file order.
	f := fileOf(riceWith("Rice and peas", "  SIDE ", "main", "Dessert"))
	p := plan(t, f, courseEx(), recipefile.Decisions{})
	if !p.Ready || len(p.Problems) != 0 {
		t.Fatalf("plan = %+v", p)
	}
	for _, key := range []string{"side", "main", "dessert"} {
		row := courseRow(t, p, key)
		if row.Status != recipefile.CourseExact || !row.Resolved || row.Match == nil {
			t.Errorf("%s row = %+v, want an exact, resolved match", key, row)
		}
	}
	if row := courseRow(t, p, "side"); row.Name != "SIDE" { // the first spelling in the file, trimmed and collapsed
		t.Errorf("side display name = %q", row.Name)
	}
	if row := courseRow(t, p, "side"); !reflect.DeepEqual(row.UsedBy, []string{"$.recipes[0].courses[0]"}) {
		t.Errorf("side used by %v", row.UsedBy)
	}
	c := commitOf(t, f, courseEx(), recipefile.Decisions{})
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idMain, idSide, idDessert}) {
		t.Fatalf("CourseIDs = %v, want [Main Side Dessert]", got)
	}
}

func TestTwoSpellingsOfOneCourseCountOnce(t *testing.T) {
	f := fileOf(riceWith("Rice", "Side", "side", "SIDE  "))
	c := commitOf(t, f, courseEx(), recipefile.Decisions{})
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idSide}) {
		t.Fatalf("CourseIDs = %v, want [Side] once", got)
	}
	p := plan(t, f, courseEx(), recipefile.Decisions{})
	if len(p.Courses) != 1 || len(p.Courses[0].UsedBy) != 3 {
		t.Fatalf("one row used three times, got %+v", p.Courses)
	}
}

func TestOneRowPerNameAcrossRecipesAndNoRowForASkippedRecipe(t *testing.T) {
	f := fileOf(riceWith("A", "Salad"), riceWith("B", "salad", "Side"), riceWith("C", "Brunch"))
	ex := courseEx()
	ex.Recipes = []recipefile.RecipeRef{{ID: 9, Name: "C"}}
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 2, Action: recipefile.ActionSkip}}}
	p := plan(t, f, ex, d)
	if len(courseRowsWithStatus(p, recipefile.CourseUnknown)) != 1 {
		t.Fatalf("rows = %+v, want one unknown row (salad); Brunch belongs to a skipped Recipe", p.Courses)
	}
	salad := courseRow(t, p, "salad")
	if !reflect.DeepEqual(salad.UsedBy, []string{"$.recipes[0].courses[0]", "$.recipes[1].courses[0]"}) {
		t.Fatalf("salad used by %v", salad.UsedBy)
	}
}

func courseRowsWithStatus(p recipefile.Plan, status string) []recipefile.CourseMatch {
	var out []recipefile.CourseMatch
	for _, c := range p.Courses {
		if c.Status == status {
			out = append(out, c)
		}
	}
	return out
}

func TestAnUnknownNameDefaultsToTheMainCourseAndNeverCreatesOne(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "Soupe"))
	p := plan(t, f, courseEx(), recipefile.Decisions{})
	row := courseRow(t, p, "soupe")
	if row.Status != recipefile.CourseUnknown || row.Match != nil || !row.Resolved {
		t.Fatalf("row = %+v", row)
	}
	if row.Effective == nil || row.Effective.Action != recipefile.ActionUse || row.Effective.CourseID != idMain {
		t.Fatalf("effective = %+v, want use the main Course", row.Effective)
	}
	if !p.Ready {
		t.Fatal("the default answer keeps the review ready")
	}
	c := commitOf(t, f, courseEx(), recipefile.Decisions{})
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idMain}) {
		t.Fatalf("CourseIDs = %v, want the main Course", got)
	}
	if len(c.NewCourses) != 0 {
		t.Fatalf("Import created a Course silently: %+v", c.NewCourses)
	}
}

func TestAnUnknownNameCanUseAnotherCourse(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "Soupe", "Side"))
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soupe", Action: recipefile.ActionUse, CourseID: idStarter}}}
	c := commitOf(t, f, courseEx(), d)
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idSide, idStarter}) {
		t.Fatalf("CourseIDs = %v, want [Side Starter]", got)
	}
	if row := courseRow(t, plan(t, f, courseEx(), d), "soupe"); row.Effective == nil || row.Effective.CourseID != idStarter {
		t.Fatalf("effective = %+v", row.Effective)
	}
}

func TestSkippingANameLeavesItOut(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "Soupe", "Side"))
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soupe", Action: recipefile.ActionSkip}}}
	c := commitOf(t, f, courseEx(), d)
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idSide}) {
		t.Fatalf("CourseIDs = %v, want [Side]", got)
	}
}

func TestARecipeWhoseNamesAreAllSkippedGetsTheMainCourse(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "Soupe"))
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soupe", Action: recipefile.ActionSkip}}}
	c := commitOf(t, f, courseEx(), d)
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idMain}) {
		t.Fatalf("CourseIDs = %v, want the main Course", got)
	}
}

func TestAnAnswerForAnotherCourseOrAnUnusedKeyIsIgnoredAndOneForAnArchivedOrMissingCourseIsStale(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "Soupe"))
	ignored := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "not in the file", Action: recipefile.ActionAdd}}}
	if c := commitOf(t, f, courseEx(), ignored); len(c.NewCourses) != 0 {
		t.Fatalf("an answer for a key that is not in the file must be ignored: %+v", c.NewCourses)
	}
	for _, id := range []int64{idSoup, 4242} { // archived, unknown
		d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soupe", Action: recipefile.ActionUse, CourseID: id}}}
		if _, err := recipefile.BuildCommit(f, courseEx(), d, noImages); !errors.Is(err, recipefile.ErrStale) {
			t.Errorf("use Course %d: err = %v, want ErrStale", id, err)
		}
	}
}

func TestAddCreatesTheCourseOnlyWhenAnswered(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "Main", "  Soupe   du  jour "), riceWith("Pea soup", "soupe du JOUR"))
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soupe du jour", Action: recipefile.ActionAdd}}}
	c := commitOf(t, f, courseEx(), d)
	if len(c.NewCourses) != 1 || c.NewCourses[0].Key != "soupe du jour" || c.NewCourses[0].Name != "Soupe du jour" {
		t.Fatalf("NewCourses = %+v, want one: the first spelling, trimmed and collapsed", c.NewCourses)
	}
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idMain}) {
		t.Errorf("recipe 0 existing CourseIDs = %v, want [Main]", got)
	}
	if got := c.Recipes[0].NewCourseKeys; !reflect.DeepEqual(got, []string{"soupe du jour"}) {
		t.Errorf("recipe 0 NewCourseKeys = %v", got)
	}
	// The second Recipe has only the added Course: it must not also get the main Course.
	if got := c.Recipes[1].Input.CourseIDs; len(got) != 0 {
		t.Errorf("recipe 1 existing CourseIDs = %v, want none", got)
	}
	if got := c.Recipes[1].NewCourseKeys; !reflect.DeepEqual(got, []string{"soupe du jour"}) {
		t.Errorf("recipe 1 NewCourseKeys = %v", got)
	}
	row := courseRow(t, plan(t, f, courseEx(), d), "soupe du jour")
	if row.Effective == nil || row.Effective.Action != recipefile.ActionAdd || !row.Resolved {
		t.Errorf("row = %+v", row)
	}
}

func TestAddingPastTwentyActiveCoursesIsAProblem(t *testing.T) {
	ex := courseEx()
	for i := int64(10); len(activeOf(ex)) < 20; i++ {
		ex.Courses = append(ex.Courses, recipefile.CourseRef{ID: i, Name: "Extra " + string(rune('A'+i-10))})
	}
	f := fileOf(riceWith("Lentil soup", "Soupe"))
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soupe", Action: recipefile.ActionAdd}}}
	p := plan(t, f, ex, d)
	if p.Ready || !hasProblem(p, "$.recipes[0].courses[0]", recipefile.ProblemTooManyCourses) {
		t.Fatalf("plan = %+v, want the too_many_courses Problem at the name", p)
	}
	var notReady *recipefile.NotReadyError
	if _, err := recipefile.BuildCommit(f, ex, d, noImages); !errors.As(err, &notReady) {
		t.Fatalf("BuildCommit err = %v, want NotReadyError", err)
	}
}

// exWithActive fills courseEx with extra active Courses until n are active (the archived Soup stays archived).
func exWithActive(n int) recipefile.Existing {
	ex := courseEx()
	for i := int64(10); len(activeOf(ex)) < n; i++ {
		ex.Courses = append(ex.Courses, recipefile.CourseRef{ID: i, Name: "Extra " + string(rune('A'+i-10))})
	}
	return ex
}

func TestUnarchivingPastTwentyActiveCoursesIsAProblem(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "Soup"))
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soup", Action: recipefile.ActionUnarchive}}}
	// 19 active + the unarchived Soup is exactly 20: allowed.
	if p := plan(t, f, exWithActive(19), d); !p.Ready {
		t.Fatalf("19 active + 1 unarchived = 20 must be Ready: %+v", p.Problems)
	}
	ex := exWithActive(20)
	p := plan(t, f, ex, d)
	if p.Ready || !hasProblem(p, "$.recipes[0].courses[0]", recipefile.ProblemTooManyCourses) {
		t.Fatalf("plan = %+v, want the too_many_courses Problem at the name", p)
	}
	var notReady *recipefile.NotReadyError
	if _, err := recipefile.BuildCommit(f, ex, d, noImages); !errors.As(err, &notReady) {
		t.Fatalf("BuildCommit err = %v, want NotReadyError", err)
	}
}

func TestAddAndUnarchiveTogetherCountTowardTheLimitAtTheRowThatPassesIt(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "Brunch", "Soup"))
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{
		{Key: "brunch", Action: recipefile.ActionAdd},
		{Key: "soup", Action: recipefile.ActionUnarchive},
	}}
	// 18 active + 2 = 20: allowed.
	if p := plan(t, f, exWithActive(18), d); !p.Ready {
		t.Fatalf("18 active + add + unarchive = 20 must be Ready: %+v", p.Problems)
	}
	// 19 active + add = 20 fits; the unarchive is the row that first passes 20.
	p := plan(t, f, exWithActive(19), d)
	if p.Ready || !hasProblem(p, "$.recipes[0].courses[1]", recipefile.ProblemTooManyCourses) {
		t.Fatalf("plan = %+v, want too_many_courses at the Soup row (courses[1])", p)
	}
	if hasProblem(p, "$.recipes[0].courses[0]", recipefile.ProblemTooManyCourses) {
		t.Errorf("the add row fits (20) and must not be flagged: %+v", p.Problems)
	}
}

func activeOf(ex recipefile.Existing) []recipefile.CourseRef {
	var out []recipefile.CourseRef
	for _, c := range ex.Courses {
		if !c.Archived {
			out = append(out, c)
		}
	}
	return out
}

func hasProblem(p recipefile.Plan, path, code string) bool {
	for _, pr := range p.Problems {
		if pr.Path == path && pr.Code == code {
			return true
		}
	}
	return false
}

func TestANameMatchingAnArchivedCourseNeedsAnAnswerToBringItBack(t *testing.T) {
	f := fileOf(riceWith("Lentil soup", "soup"))
	p := plan(t, f, courseEx(), recipefile.Decisions{})
	row := courseRow(t, p, "soup")
	if row.Status != recipefile.CourseArchived || row.Match == nil || row.Match.ID != idSoup || !row.Match.Archived {
		t.Fatalf("row = %+v", row)
	}
	if row.Effective == nil || row.Effective.Action != recipefile.ActionUse || row.Effective.CourseID != idMain {
		t.Fatalf("effective = %+v, want use the main Course by default", row.Effective)
	}
	c := commitOf(t, f, courseEx(), recipefile.Decisions{})
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idMain}) || len(c.UnarchiveCourses) != 0 {
		t.Fatalf("default: CourseIDs %v, unarchive %v; nothing is unarchived silently", got, c.UnarchiveCourses)
	}

	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soup", Action: recipefile.ActionUnarchive}}}
	c = commitOf(t, f, courseEx(), d)
	if !reflect.DeepEqual(c.UnarchiveCourses, []int64{idSoup}) {
		t.Fatalf("UnarchiveCourses = %v", c.UnarchiveCourses)
	}
	if got := c.Recipes[0].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idSoup}) {
		t.Fatalf("CourseIDs = %v, want the unarchived Course", got)
	}
}

func TestANameWithNoCharactersIsAProblemAtItsPath(t *testing.T) {
	f := fileOf(riceWith("Rice", "Side", "   "))
	p := plan(t, f, courseEx(), recipefile.Decisions{})
	if p.Ready || !hasProblem(p, "$.recipes[0].courses[1]", recipefile.ProblemCourseNameInvalid) {
		t.Fatalf("plan = %+v", p)
	}
}

func TestWithoutKnownCoursesTheFileDecidesAndNothingIsAdded(t *testing.T) {
	// A caller that passes no Courses (every older test) gets no CourseIDs and the file's own wholeMeal.
	f := fileOf(riceWith("Rice", "Side"))
	yes := true
	f.Recipes[0].WholeMeal = &yes
	ex := recipefile.Existing{Ingredients: []ingredientT{ing(50, "Rice", "g")}}
	c := commitOf(t, f, ex, recipefile.Decisions{})
	in := c.Recipes[0].Input
	if in.CourseIDs != nil || in.WholeMeal == nil || !*in.WholeMeal {
		t.Fatalf("input = %+v", in)
	}
	if p := plan(t, f, ex, recipefile.Decisions{}); len(p.Courses) != 0 || !p.Ready {
		t.Fatalf("plan = %+v", p)
	}
}

// ---- wholeMeal ---------------------------------------------------------------------------------------------

func wholeOf(t *testing.T, f recipefile.File, ex recipefile.Existing, d recipefile.Decisions) bool {
	t.Helper()
	in := commitOf(t, f, ex, d).Recipes[0].Input
	if in.WholeMeal == nil {
		t.Fatal("the commit must carry an explicit Whole meal value for every Recipe, so a replace never keeps the old one")
	}
	return *in.WholeMeal
}

func readyMealRecipe(courses ...string) recipefile.File {
	f := readyMealFile("Lasagne pack", "lasagne pack")
	f.Recipes[0].Courses = courses
	return f
}

func TestWholeMealDefaultsFromTheReadyMealAndTheMatchedCourses(t *testing.T) {
	yes, no := true, false
	cases := []struct {
		name string
		file recipefile.File
		d    recipefile.Decisions
		want bool
	}{
		{"Ready Meal, no courses in the file", readyMealRecipe(), recipefile.Decisions{}, true},
		{"Ready Meal in Main and Side", readyMealRecipe("Side", "Main"), recipefile.Decisions{}, true},
		{"Ready Meal in Side only", readyMealRecipe("Side"), recipefile.Decisions{}, false},
		{"Ready Meal in an unknown Course defaults to Main", readyMealRecipe("Brunch"), recipefile.Decisions{}, true},
		{"Ready Meal whose unknown Course goes to Dessert", readyMealRecipe("Brunch"),
			recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "brunch", Action: recipefile.ActionUse, CourseID: idDessert}}}, false},
		{"Ready Meal whose only name is skipped gets Main", readyMealRecipe("Brunch"),
			recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "brunch", Action: recipefile.ActionSkip}}}, true},
		{"Ready Meal explicitly not a Whole meal", withWhole(readyMealRecipe("Main"), &no), recipefile.Decisions{}, false},
		{"Ready Meal explicitly a Whole meal outside Main", withWhole(readyMealRecipe("Side"), &yes), recipefile.Decisions{}, true},
		{"ordinary Recipe, absent", fileOf(riceWith("Rice", "Main")), recipefile.Decisions{}, false},
		{"ordinary Recipe, explicit true", withWhole(fileOf(riceWith("Stew", "Main")), &yes), recipefile.Decisions{}, true},
		{"ordinary Recipe, explicit false", withWhole(fileOf(riceWith("Stew", "Main")), &no), recipefile.Decisions{}, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ex := courseEx()
			if got := wholeOf(t, tc.file, ex, tc.d); got != tc.want {
				t.Errorf("WholeMeal = %v, want %v", got, tc.want)
			}
		})
	}
}

func withWhole(f recipefile.File, v *bool) recipefile.File {
	f.Recipes[0].WholeMeal = v
	return f
}

func TestAReplaceAlsoGetsAnExplicitWholeMealSoTheStoredValueIsNotKept(t *testing.T) {
	f := readyMealRecipe("Main")
	ex := courseEx()
	ex.Recipes = []recipefile.RecipeRef{{ID: 77, Name: "Lasagne pack"}}
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionReplace}}}
	c := commitOf(t, f, ex, d)
	if c.Recipes[0].Action != recipefile.ActionReplace || c.Recipes[0].Input.WholeMeal == nil || !*c.Recipes[0].Input.WholeMeal {
		t.Fatalf("recipe commit = %+v", c.Recipes[0])
	}
	if !reflect.DeepEqual(c.Recipes[0].Input.CourseIDs, []int64{idMain}) {
		t.Fatalf("CourseIDs = %v", c.Recipes[0].Input.CourseIDs)
	}
}

func TestAnAddedCourseDoesNotMakeAReadyMealAWholeMeal(t *testing.T) {
	// "Brunch" added as a Course is not the main Course, so a Ready Meal that only has it is not a Whole meal.
	f := readyMealRecipe("Brunch")
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "brunch", Action: recipefile.ActionAdd}}}
	if got := wholeOf(t, f, courseEx(), d); got {
		t.Fatal("WholeMeal = true, want false")
	}
}
