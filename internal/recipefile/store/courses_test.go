package store_test

import (
	"errors"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/recipefile/store"
)

// crs-e1: Courses and Whole meal in the Recipe File store (docs/dev/design/crs-e1.md). The migration seeds
// Main (the main Course), Side, Starter and Dessert, in that order.

func (f *fixture) courseID(t *testing.T, key string) int64 {
	t.Helper()
	var id int64
	if err := f.db.QueryRow(`SELECT id FROM courses WHERE name_key = ?`, key).Scan(&id); err != nil {
		t.Fatalf("course %q: %v", key, err)
	}
	return id
}

func (f *fixture) archivedCourse(t *testing.T, name, key string) int64 {
	t.Helper()
	res, err := f.db.Exec(`INSERT INTO courses (name, name_key, position, is_main, archived, created_at)
		VALUES (?, ?, (SELECT MAX(position) + 1 FROM courses), 0, 1, '2026-11-09T12:00:00Z')`, name, key)
	if err != nil {
		t.Fatal(err)
	}
	id, _ := res.LastInsertId()
	return id
}

func riceFile(recipes ...recipefile.Recipe) recipefile.File {
	return recipefile.File{
		Format: recipefile.Format, Version: recipefile.Version,
		Ingredients: []recipefile.Ingredient{{Name: "rice", BaseUnit: "g"}},
		Recipes:     recipes,
	}
}

func riceRecipe(name string, courses ...string) recipefile.Recipe {
	return recipefile.Recipe{
		Name: name, Yield: 2, Courses: courses,
		Ingredients: []recipefile.Line{{Ingredient: "rice", Quantity: 200, Unit: "g"}},
	}
}

func (f *fixture) commit(t *testing.T, file recipefile.File, d recipefile.Decisions) recipefile.Commit {
	t.Helper()
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	c, err := recipefile.BuildCommit(file, ex, d, recipefile.ImageSet{})
	if err != nil {
		t.Fatalf("BuildCommit: %v", err)
	}
	return c
}

func (f *fixture) recipeCourses(t *testing.T, recipeID int64) []string {
	t.Helper()
	rows, err := f.db.Query(`SELECT c.name FROM recipe_courses rc JOIN courses c ON c.id = rc.course_id
		WHERE rc.recipe_id = ? ORDER BY c.position`, recipeID)
	if err != nil {
		t.Fatal(err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var n string
		if err := rows.Scan(&n); err != nil {
			t.Fatal(err)
		}
		out = append(out, n)
	}
	return out
}

func (f *fixture) wholeMeal(t *testing.T, recipeID int64) bool {
	t.Helper()
	var w int
	if err := f.db.QueryRow(`SELECT whole_meal FROM recipes WHERE id = ?`, recipeID).Scan(&w); err != nil {
		t.Fatal(err)
	}
	return w == 1
}

func TestExistingListsEveryCourseInHouseholdOrderArchivedOnesIncluded(t *testing.T) {
	f := newFixture(t)
	soup := f.archivedCourse(t, "Soup", "soup")
	ex, err := f.s.Existing(ctx)
	if err != nil {
		t.Fatal(err)
	}
	want := []recipefile.CourseRef{
		{ID: f.courseID(t, "main"), Name: "Main", Main: true},
		{ID: f.courseID(t, "side"), Name: "Side"},
		{ID: f.courseID(t, "starter"), Name: "Starter"},
		{ID: f.courseID(t, "dessert"), Name: "Dessert"},
		{ID: soup, Name: "Soup", Archived: true},
	}
	if !reflect.DeepEqual(ex.Courses, want) {
		t.Fatalf("Courses = %+v\nwant     %+v", ex.Courses, want)
	}
}

func TestApplyWritesTheMatchedCoursesAndTheWholeMealDefault(t *testing.T) {
	f := newFixture(t)
	ready := recipefile.Recipe{
		Name: "Lasagne pack", Yield: 2, ReadyMeal: true,
		Ingredients: []recipefile.Line{{Ingredient: "lasagne pack", Quantity: 1, Unit: "piece"}},
	}
	no := false
	explicit := riceRecipe("Pilaf", "main")
	explicit.WholeMeal = &no
	file := riceFile(riceRecipe("Rice and peas", "dessert", "SIDE"), ready, explicit, riceRecipe("Plain rice"))
	res, err := f.s.Apply(ctx, f.commit(t, file, recipefile.Decisions{}))
	if err != nil {
		t.Fatal(err)
	}
	if got := f.recipeCourses(t, res.Recipes[0].ID); !reflect.DeepEqual(got, []string{"Side", "Dessert"}) {
		t.Errorf("Rice and peas Courses = %v", got)
	}
	if f.wholeMeal(t, res.Recipes[0].ID) {
		t.Error("an ordinary Recipe without wholeMeal is not a Whole meal")
	}
	if got := f.recipeCourses(t, res.Recipes[1].ID); !reflect.DeepEqual(got, []string{"Main"}) || !f.wholeMeal(t, res.Recipes[1].ID) {
		t.Errorf("Ready Meal: Courses %v, whole meal %v; want Main and a Whole meal", got, f.wholeMeal(t, res.Recipes[1].ID))
	}
	if f.wholeMeal(t, res.Recipes[2].ID) {
		t.Error("an explicit false is kept")
	}
	if got := f.recipeCourses(t, res.Recipes[3].ID); !reflect.DeepEqual(got, []string{"Main"}) {
		t.Errorf("a Recipe without courses gets the main Course, got %v", got)
	}
	if res.CoursesCreated != 0 || res.CoursesUnarchived != 0 || f.count(t, "courses") != 4 {
		t.Errorf("nothing is created silently: %+v, %d Courses", res, f.count(t, "courses"))
	}
}

func TestApplyAddsTheCourseLastAndLinksEveryRecipeThatUsesIt(t *testing.T) {
	f := newFixture(t)
	file := riceFile(riceRecipe("Lentil soup", "  Soupe   du jour ", "Main"), riceRecipe("Pea soup", "soupe DU jour"))
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soupe du jour", Action: recipefile.ActionAdd}}}
	res, err := f.s.Apply(ctx, f.commit(t, file, d))
	if err != nil {
		t.Fatal(err)
	}
	if res.CoursesCreated != 1 || f.count(t, "courses") != 5 {
		t.Fatalf("created %d, courses %d", res.CoursesCreated, f.count(t, "courses"))
	}
	var name string
	var pos, archived, main int
	if err := f.db.QueryRow(`SELECT name, position, archived, is_main FROM courses WHERE name_key = 'soupe du jour'`).Scan(&name, &pos, &archived, &main); err != nil {
		t.Fatal(err)
	}
	if name != "Soupe du jour" || pos != 4 || archived != 0 || main != 0 {
		t.Errorf("new Course = %q position %d archived %d main %d, want \"Soupe du jour\" last, active, not main", name, pos, archived, main)
	}
	if got := f.recipeCourses(t, res.Recipes[0].ID); !reflect.DeepEqual(got, []string{"Main", "Soupe du jour"}) {
		t.Errorf("Lentil soup Courses = %v", got)
	}
	if got := f.recipeCourses(t, res.Recipes[1].ID); !reflect.DeepEqual(got, []string{"Soupe du jour"}) {
		t.Errorf("Pea soup Courses = %v, want only the added Course (no main Course on top)", got)
	}
}

func TestApplyUnarchivesTheCourseAndLinksTheRecipe(t *testing.T) {
	f := newFixture(t)
	soup := f.archivedCourse(t, "Soup", "soup")
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "soup", Action: recipefile.ActionUnarchive}}}
	res, err := f.s.Apply(ctx, f.commit(t, riceFile(riceRecipe("Lentil soup", "soup")), d))
	if err != nil {
		t.Fatal(err)
	}
	if res.CoursesUnarchived != 1 || res.CoursesCreated != 0 {
		t.Fatalf("result = %+v", res)
	}
	var archived int
	f.db.QueryRow(`SELECT archived FROM courses WHERE id = ?`, soup).Scan(&archived)
	if archived != 0 {
		t.Error("the Course is still archived")
	}
	if got := f.recipeCourses(t, res.Recipes[0].ID); !reflect.DeepEqual(got, []string{"Soup"}) {
		t.Errorf("Courses = %v", got)
	}
}

func TestApplyIsStaleWhenAnAddedNameWasTakenSinceTheReview(t *testing.T) {
	f := newFixture(t)
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "brunch", Action: recipefile.ActionAdd}}}
	c := f.commit(t, riceFile(riceRecipe("Pancakes", "Brunch")), d)
	// Somebody adds "brunch" before the Confirm.
	f.db.Exec(`INSERT INTO courses (name, name_key, position, is_main, archived, created_at) VALUES ('BRUNCH', 'brunch', 4, 0, 0, '2026-11-09T12:00:00Z')`)
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	if f.count(t, "recipes") != 0 || f.count(t, "courses") != 5 {
		t.Fatalf("recipes %d, courses %d: nothing may be written", f.count(t, "recipes"), f.count(t, "courses"))
	}
}

func TestApplyIsStaleWhenTheAddWouldPassTwentyActiveCourses(t *testing.T) {
	f := newFixture(t)
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "brunch", Action: recipefile.ActionAdd}}}
	c := f.commit(t, riceFile(riceRecipe("Pancakes", "Brunch")), d)
	for i := 0; i < 16; i++ {
		f.db.Exec(`INSERT INTO courses (name, name_key, position, is_main, archived, created_at) VALUES (?, ?, ?, 0, 0, '2026-11-09T12:00:00Z')`,
			"Extra "+string(rune('A'+i)), "extra "+string(rune('a'+i)), 10+i)
	}
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	if f.count(t, "recipes") != 0 {
		t.Fatal("nothing may be written")
	}
}

func TestApplyIsStaleWhenAnUnarchivedOrAssignedCourseIsGone(t *testing.T) {
	f := newFixture(t)
	file := riceFile(riceRecipe("Pancakes", "Side"))
	c := f.commit(t, file, recipefile.Decisions{})
	if _, err := f.db.Exec(`DELETE FROM courses WHERE name_key = 'side'`); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.Apply(ctx, c); err == nil {
		t.Fatal("a Recipe whose Course no longer exists must not be written")
	} else if !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	if f.count(t, "recipes") != 0 {
		t.Fatal("nothing may be written")
	}
}

func TestAFailedApplyLeavesNoAddedCourse(t *testing.T) {
	f := newFixture(t)
	d := recipefile.Decisions{Courses: []recipefile.CourseDecision{{Key: "brunch", Action: recipefile.ActionAdd}}}
	c := f.commit(t, riceFile(riceRecipe("Pancakes", "Brunch")), d)
	c.Recipes[0].Action = recipefile.ActionReplace
	c.Recipes[0].ReplaceID = 4242 // no such Recipe
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	if f.count(t, "courses") != 4 {
		t.Fatalf("%d Courses after a failed Apply, want the 4 seeded ones", f.count(t, "courses"))
	}
}

func TestReplaceTakesTheFilesCoursesAndWholeMealOverTheStoredOnes(t *testing.T) {
	f := newFixture(t)
	first, err := f.s.Apply(ctx, f.commit(t, riceFile(riceRecipe("Pilaf")), recipefile.Decisions{}))
	if err != nil {
		t.Fatal(err)
	}
	id := first.Recipes[0].ID
	if got := f.recipeCourses(t, id); !reflect.DeepEqual(got, []string{"Main"}) || f.wholeMeal(t, id) {
		t.Fatalf("first import: Courses %v, whole meal %v", got, f.wholeMeal(t, id))
	}
	yes := true
	next := riceRecipe("Pilaf", "Starter", "Side")
	next.WholeMeal = &yes
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionReplace}}}
	res, err := f.s.Apply(ctx, f.commit(t, riceFile(next), d))
	if err != nil {
		t.Fatal(err)
	}
	if res.Recipes[0].ID != id || res.Recipes[0].Action != "replaced" {
		t.Fatalf("result = %+v", res.Recipes)
	}
	if got := f.recipeCourses(t, id); !reflect.DeepEqual(got, []string{"Side", "Starter"}) || !f.wholeMeal(t, id) {
		t.Errorf("after replace: Courses %v, whole meal %v; want [Side Starter] and a Whole meal", got, f.wholeMeal(t, id))
	}
	// A replace whose file says nothing about wholeMeal gets the default, not the stored true.
	d2 := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionReplace}}}
	if _, err := f.s.Apply(ctx, f.commit(t, riceFile(riceRecipe("Pilaf", "Main")), d2)); err != nil {
		t.Fatal(err)
	}
	if f.wholeMeal(t, id) {
		t.Error("an absent wholeMeal on a replace must give the default (false), not keep the stored true")
	}
}

func TestExportableCarriesCourseNamesAndWholeMeal(t *testing.T) {
	f := newFixture(t)
	yes := true
	r := riceRecipe("Pilaf", "dessert", "main")
	r.WholeMeal = &yes
	res, err := f.s.Apply(ctx, f.commit(t, riceFile(r), recipefile.Decisions{}))
	if err != nil {
		t.Fatal(err)
	}
	in, err := f.s.Exportable(ctx, []int64{res.Recipes[0].ID})
	if err != nil {
		t.Fatal(err)
	}
	file, _ := recipefile.Build(in)
	if got := file.Recipes[0].Courses; !reflect.DeepEqual(got, []string{"Main", "Dessert"}) {
		t.Errorf("exported courses = %v, want household order", got)
	}
	if w := file.Recipes[0].WholeMeal; w == nil || !*w {
		t.Errorf("exported wholeMeal = %v", w)
	}
}

func TestAnExportedFileImportsBackIntoAnotherHouseholdWithTheSameCourses(t *testing.T) {
	src := newFixture(t)
	no := false
	r := riceRecipe("Salad", "starter", "side")
	r.WholeMeal = &no
	res, err := src.s.Apply(ctx, src.commit(t, riceFile(r), recipefile.Decisions{}))
	if err != nil {
		t.Fatal(err)
	}
	in, _ := src.s.Exportable(ctx, []int64{res.Recipes[0].ID})
	file, _ := recipefile.Build(in)
	data, err := recipefile.Marshal(file)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := recipefile.Parse(data)
	if err != nil {
		t.Fatalf("the exported file must validate: %v", err)
	}
	dst := newFixture(t)
	got, err := dst.s.Apply(ctx, dst.commit(t, parsed, recipefile.Decisions{}))
	if err != nil {
		t.Fatal(err)
	}
	if names := dst.recipeCourses(t, got.Recipes[0].ID); !reflect.DeepEqual(names, []string{"Side", "Starter"}) || dst.wholeMeal(t, got.Recipes[0].ID) {
		t.Errorf("imported: Courses %v, whole meal %v", names, dst.wholeMeal(t, got.Recipes[0].ID))
	}
}
