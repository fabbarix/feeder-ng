package recipefile_test

import (
	"encoding/json"
	"reflect"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipe"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// crs-e1: the Recipe File's `courses` and `wholeMeal` (docs/spec/recipe-file.md, docs/dev/design/crs-e1.md).

// ---- schema ------------------------------------------------------------------------------------------------

func schemaRecipeProps(t *testing.T) map[string]any {
	t.Helper()
	var root map[string]any
	if err := json.Unmarshal(spec.Schema, &root); err != nil {
		t.Fatal(err)
	}
	defs := root["$defs"].(map[string]any)
	return defs["recipe"].(map[string]any)["properties"].(map[string]any)
}

func TestTheSchemaDeclaresCoursesAndAWholeMealWithNoDefault(t *testing.T) {
	props := schemaRecipeProps(t)
	courses, ok := props["courses"].(map[string]any)
	if !ok {
		t.Fatal("the recipe schema has no `courses`")
	}
	if courses["type"] != "array" || courses["uniqueItems"] != true || courses["maxItems"] != float64(20) {
		t.Errorf("courses = %v, want an array of unique items, at most 20", courses)
	}
	if items, _ := courses["items"].(map[string]any); items["type"] != "string" || items["minLength"] != float64(1) || items["maxLength"] != float64(40) {
		t.Errorf("courses items = %v, want strings of 1 to 40 characters", courses["items"])
	}
	if _, has := courses["enum"]; has {
		t.Error("courses must not carry an enum: the schema is the same for every Household")
	}
	whole, ok := props["wholeMeal"].(map[string]any)
	if !ok {
		t.Fatal("the recipe schema has no `wholeMeal`")
	}
	if !reflect.DeepEqual(whole["type"], []any{"boolean", "null"}) {
		t.Errorf("wholeMeal type = %v, want [boolean null]", whole["type"])
	}
	if _, has := whole["default"]; has {
		t.Error("wholeMeal has no schema default: absent means the Ready Meal rule, not false")
	}
}

func TestTheFormatStaysVersionOne(t *testing.T) {
	var root map[string]any
	if err := json.Unmarshal(spec.Schema, &root); err != nil {
		t.Fatal(err)
	}
	v := root["properties"].(map[string]any)["version"].(map[string]any)
	if v["const"] != float64(1) || recipefile.Version != 1 {
		t.Fatalf("version = %v / %d, want 1: both fields are backwards compatible additions", v["const"], recipefile.Version)
	}
}

func TestParseAcceptsCoursesAndWholeMeal(t *testing.T) {
	for name, tc := range map[string]struct {
		courses any
		whole   any
	}{
		"names and true":      {[]any{"Main", "Side"}, true},
		"names and false":     {[]any{"Dessert"}, false},
		"null whole meal":     {[]any{"Main"}, nil},
		"empty courses":       {[]any{}, true},
		"twenty names":        {twentyNames(), false},
		"a 40 character name": {[]any{strings.Repeat("é", 40)}, true},
	} {
		t.Run(name, func(t *testing.T) {
			data := mutate(t, func(root map[string]any) {
				recipeAt(root, 0)["courses"] = tc.courses
				recipeAt(root, 0)["wholeMeal"] = tc.whole
			})
			f, err := recipefile.Parse(data)
			if err != nil {
				t.Fatalf("Parse: %v", err)
			}
			if want, _ := tc.courses.([]any); len(f.Recipes[0].Courses) != len(want) {
				t.Errorf("courses = %v", f.Recipes[0].Courses)
			}
			if tc.whole == nil {
				if f.Recipes[0].WholeMeal != nil {
					t.Errorf("a null wholeMeal parses as absent, got %v", *f.Recipes[0].WholeMeal)
				}
			} else if f.Recipes[0].WholeMeal == nil || *f.Recipes[0].WholeMeal != tc.whole.(bool) {
				t.Errorf("wholeMeal = %v", f.Recipes[0].WholeMeal)
			}
		})
	}
}

func twentyNames() []any {
	out := make([]any, 20)
	for i := range out {
		out[i] = "Course " + string(rune('A'+i))
	}
	return out
}

func TestParseRejectsBadCoursesAndWholeMeal(t *testing.T) {
	for name, tc := range map[string]struct {
		field string
		value any
		path  string
	}{
		"courses not an array": {"courses", "Main", "$.recipes[0].courses"},
		"empty name":           {"courses", []any{"Main", ""}, "$.recipes[0].courses[1]"},
		"name too long":        {"courses", []any{strings.Repeat("a", 41)}, "$.recipes[0].courses[0]"},
		"name not a string":    {"courses", []any{1}, "$.recipes[0].courses[0]"},
		"repeated name":        {"courses", []any{"Side", "Side"}, "$.recipes[0].courses"},
		"twenty-one names":     {"courses", append(twentyNames(), "one more"), "$.recipes[0].courses"},
		"whole meal a string":  {"wholeMeal", "yes", "$.recipes[0].wholeMeal"},
		"whole meal a number":  {"wholeMeal", 1, "$.recipes[0].wholeMeal"},
	} {
		t.Run(name, func(t *testing.T) {
			data := mutate(t, func(root map[string]any) { recipeAt(root, 0)[tc.field] = tc.value })
			_, err := recipefile.Parse(data)
			var se *recipefile.SchemaError
			if !asSchemaError(err, &se) {
				t.Fatalf("Parse err = %v, want a schema error", err)
			}
			if !hasPath(se.Errors, tc.path, "") {
				t.Errorf("errors = %+v, want one at %s", se.Errors, tc.path)
			}
		})
	}
}

func asSchemaError(err error, target **recipefile.SchemaError) bool {
	se, ok := err.(*recipefile.SchemaError)
	if ok {
		*target = se
	}
	return ok
}

func TestAFileWithoutCoursesOrWholeMealStillParses(t *testing.T) {
	f := mustParse(t, mutate(t, func(root map[string]any) {
		for _, r := range root["recipes"].([]any) {
			delete(r.(map[string]any), "courses")
			delete(r.(map[string]any), "wholeMeal")
		}
	}))
	for _, r := range f.Recipes {
		if len(r.Courses) != 0 || r.WholeMeal != nil {
			t.Fatalf("recipe %q = %+v", r.Name, r)
		}
	}
}

// ---- the published example and the spec ---------------------------------------------------------------------

func TestTheExampleShowsCoursesAndWholeMeal(t *testing.T) {
	f := exampleFile(t)
	if got := f.Recipes[0].Courses; !reflect.DeepEqual(got, []string{"Main"}) {
		t.Errorf("first Recipe courses = %v, want [Main]", got)
	}
	if w := f.Recipes[0].WholeMeal; w == nil || !*w {
		t.Errorf("the traybake is a Whole meal in the example, got %v", w)
	}
	rm := f.Recipes[1]
	if !rm.ReadyMeal || len(rm.Courses) == 0 || rm.WholeMeal == nil {
		t.Errorf("the Ready Meal shows both fields: %+v", rm)
	}
}

func TestTheSpecDocumentsBothFields(t *testing.T) {
	md := spec.RecipeFileMD
	for _, want := range []string{"| `courses` |", "| `wholeMeal` |", "course.NameKey", "no schema default", "Import Review"} {
		if !strings.Contains(md, want) {
			t.Errorf("recipe-file.md must mention %q", want)
		}
	}
	if strings.Contains(strings.ToLower(md), "dish type") {
		t.Error("recipe-file.md uses the avoided term \"dish type\" (GLOSSARY: Course)")
	}
}

// ---- export ------------------------------------------------------------------------------------------------

func courseExportRecipes() []recipe.Recipe {
	yes, no := true, false
	line := []recipe.Line{{IngredientID: 2, Ingredient: "garlic", Quantity: 1, Unit: "clove"}}
	return []recipe.Recipe{
		{ID: 1, Input: recipe.Input{Name: "Stew", Yield: 4, Lines: line, WholeMeal: &yes}, Courses: []recipe.CourseRef{{ID: 1, Name: "Main"}}},
		{ID: 2, Input: recipe.Input{Name: "Salad", Yield: 2, Lines: line, WholeMeal: &no}, Courses: []recipe.CourseRef{{ID: 2, Name: "Side"}, {ID: 3, Name: "Starter"}}},
	}
}

func courseExportInput() recipefile.ExportInput {
	in := exportFixture()
	in.Recipes = courseExportRecipes()
	return in
}

func TestExportWritesCourseNamesInHouseholdOrderAndTheStoredWholeMeal(t *testing.T) {
	f, warns := recipefile.Build(courseExportInput())
	if len(warns) != 0 {
		t.Fatalf("warnings: %+v", warns)
	}
	if got := f.Recipes[0].Courses; !reflect.DeepEqual(got, []string{"Main"}) {
		t.Errorf("Stew courses = %v", got)
	}
	if got := f.Recipes[1].Courses; !reflect.DeepEqual(got, []string{"Side", "Starter"}) {
		t.Errorf("Salad courses = %v, want the Recipe's order", got)
	}
	if w := f.Recipes[0].WholeMeal; w == nil || !*w {
		t.Errorf("Stew wholeMeal = %v, want true", w)
	}
	if w := f.Recipes[1].WholeMeal; w == nil || *w {
		t.Errorf("Salad wholeMeal = %v, want an explicit false", w)
	}
}

func TestExportKeepsFalseInTheJSON(t *testing.T) {
	f, _ := recipefile.Build(courseExportInput())
	data, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	var back struct {
		Recipes []map[string]any `json:"recipes"`
	}
	if err := json.Unmarshal(data, &back); err != nil {
		t.Fatal(err)
	}
	if v, ok := back.Recipes[1]["wholeMeal"]; !ok || v != false {
		t.Errorf("Salad JSON wholeMeal = %v (present %v), want false", v, ok)
	}
	if _, ok := back.Recipes[0]["courses"]; !ok {
		t.Error("Stew JSON has no courses")
	}
}

func TestAnExportedFileParsesAndRoundTrips(t *testing.T) {
	f, _ := recipefile.Build(courseExportInput())
	data, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	back, err := recipefile.Parse(data)
	if err != nil {
		t.Fatalf("the exported file must validate against the schema: %v", err)
	}
	for i := range f.Recipes {
		if !reflect.DeepEqual(back.Recipes[i].Courses, f.Recipes[i].Courses) || !reflect.DeepEqual(back.Recipes[i].WholeMeal, f.Recipes[i].WholeMeal) {
			t.Errorf("recipe %d: courses %v / %v, wholeMeal %v / %v", i, back.Recipes[i].Courses, f.Recipes[i].Courses, back.Recipes[i].WholeMeal, f.Recipes[i].WholeMeal)
		}
	}
}

func TestExportThenImportIntoTheSameHouseholdKeepsCoursesAndWholeMeal(t *testing.T) {
	f, _ := recipefile.Build(courseExportInput())
	data, _ := recipefile.Marshal(f)
	back, err := recipefile.Parse(data)
	if err != nil {
		t.Fatal(err)
	}
	ex := courseEx()
	ex.Ingredients = []ingredient.Ingredient{ing(2, "garlic", "g")}
	c := commitOf(t, back, ex, recipefile.Decisions{})
	if got := c.Recipes[1].Input.CourseIDs; !reflect.DeepEqual(got, []int64{idSide, idStarter}) {
		t.Errorf("Salad CourseIDs = %v", got)
	}
	if w := c.Recipes[1].Input.WholeMeal; w == nil || *w {
		t.Errorf("Salad WholeMeal = %v, want false", w)
	}
	if w := c.Recipes[0].Input.WholeMeal; w == nil || !*w {
		t.Errorf("Stew WholeMeal = %v, want true", w)
	}
}

func TestExportOfARecipeWithoutStoredCoursesOmitsBoth(t *testing.T) {
	// A caller that has no Courses (the old fixtures) writes neither field.
	f, _ := recipefile.Build(exportFixture())
	if len(f.Recipes[1].Courses) != 0 || f.Recipes[1].WholeMeal != nil {
		t.Fatalf("recipe = %+v", f.Recipes[1])
	}
}

// ---- Agent Prompt -------------------------------------------------------------------------------------------

func TestTheTemplateHasOneCoursesPlaceholderAndTheRewordedRule8(t *testing.T) {
	tpl, err := recipefile.ExtractTemplate(spec.RecipeFileMD)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(tpl, "{{COURSES}}") != 1 {
		t.Fatalf("the template must contain {{COURSES}} exactly once")
	}
	if strings.Contains(strings.ToLower(tpl), "dish type") {
		t.Error("rule 8 still says \"dish type\", an avoided word (GLOSSARY: Course)")
	}
	var rule8 string
	for _, line := range strings.Split(tpl, "\n") {
		if strings.HasPrefix(line, "8. ") {
			rule8 = line
		}
	}
	if !strings.Contains(rule8, "cooking method or style") || !strings.Contains(rule8, `"traybake"`) || strings.Contains(rule8, "soup") {
		t.Errorf("rule 8 = %q, want main protein, cooking method or style, with no soup (a soup is a Course now)", rule8)
	}
	for _, want := range []string{`"courses"`, `"wholeMeal"`, "ONLY from the list below", "Never invent a Course"} {
		if !strings.Contains(tpl, want) {
			t.Errorf("the template must say %q", want)
		}
	}
}

func TestAgentPromptListsTheCoursesOneLineEachWithTheMainOneAsDefault(t *testing.T) {
	tpl, _ := recipefile.ExtractTemplate(spec.RecipeFileMD)
	courses := []recipefile.PromptCourse{{Name: "Main", Main: true}, {Name: "Side"}, {Name: "Starter"}, {Name: "Dessert"}}
	got := recipefile.AgentPrompt(tpl, string(spec.Schema), string(spec.Example), courses)
	if strings.Contains(got, "{{") {
		t.Fatal("placeholders left in the prompt")
	}
	want := "- Main (default)\n- Side\n- Starter\n- Dessert\n"
	if !strings.Contains(got, want) {
		t.Fatalf("the prompt must list the Courses as %q", want)
	}
	defaults := 0
	for _, line := range strings.Split(got, "\n") {
		if strings.HasPrefix(line, "- ") && strings.Contains(line, "(default)") {
			defaults++
		}
	}
	if defaults != 1 {
		t.Errorf("exactly one Course list line is the default, got %d", defaults)
	}
	// The list sits inside rule 13, before rule 14.
	i, j, k := strings.Index(got, "13. Courses:"), strings.Index(got, "- Main (default)"), strings.Index(got, "14. Whole meal:")
	if i < 0 || j < i || k < j {
		t.Errorf("order wrong: rule 13 at %d, list at %d, rule 14 at %d", i, j, k)
	}
}

func TestAgentPromptWithAnotherMainCourseAndNoCourses(t *testing.T) {
	tpl, _ := recipefile.ExtractTemplate(spec.RecipeFileMD)
	got := recipefile.AgentPrompt(tpl, "S", "E", []recipefile.PromptCourse{{Name: "Soup"}, {Name: "Dinner", Main: true}})
	if !strings.Contains(got, "- Soup\n- Dinner (default)\n") {
		t.Errorf("the default marks the main Course wherever it sits in the order")
	}
	none := recipefile.AgentPrompt(tpl, "S", "E", nil)
	if !strings.Contains(none, "(no Courses defined)") || strings.Contains(none, "{{") {
		t.Errorf("no Courses must give the placeholder line, got a prompt without it or with placeholders left")
	}
}

func TestACourseNameWithAPlaceholderIsNotExpandedAgain(t *testing.T) {
	got := recipefile.AgentPrompt("A {{COURSES}} B {{SCHEMA}}", "s", "e", []recipefile.PromptCourse{{Name: "{{SCHEMA}}", Main: true}})
	if got != "A - {{SCHEMA}} (default) B s" {
		t.Fatalf("got %q", got)
	}
}
