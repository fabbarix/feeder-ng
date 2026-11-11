package recipeassistant_test

import (
	"os"
	"strings"
	"testing"

	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

// crs-e1: the Recipe Assistant and Courses (docs/dev/design/crs-e1.md). The output schema is a projection of the
// Recipe File schema, so it gains `courses` and `wholeMeal` as required properties; the model's "none" for them
// (`[]` and `null`) is pruned, an explicit `false` is kept.

func recipeProps(t *testing.T) (props map[string]any, required []any) {
	t.Helper()
	root := decode(t, projected(t))
	rec := root["$defs"].(map[string]any)["recipe"].(map[string]any)
	return rec["properties"].(map[string]any), rec["required"].([]any)
}

func TestTheProjectionHasCoursesAsARequiredListOfStringsWithNoEnum(t *testing.T) {
	props, required := recipeProps(t)
	courses, ok := props["courses"].(map[string]any)
	if !ok {
		t.Fatal("the projection has no `courses`")
	}
	if courses["type"] != "array" {
		t.Errorf("courses = %v, want an array", courses)
	}
	if items, _ := courses["items"].(map[string]any); items["type"] != "string" {
		t.Errorf("courses items = %v, want strings", courses["items"])
	}
	for _, k := range []string{"enum", "uniqueItems", "maxItems", "default"} {
		if _, has := courses[k]; has {
			t.Errorf("courses carries %q: the same schema serves every Household, and structured outputs refuse it", k)
		}
	}
	if !hasString(required, "courses") {
		t.Error("courses must be required in the projection")
	}
}

func TestTheProjectionHasWholeMealAsARequiredBooleanOrNull(t *testing.T) {
	props, required := recipeProps(t)
	whole, ok := props["wholeMeal"].(map[string]any)
	if !ok {
		t.Fatal("the projection has no `wholeMeal`")
	}
	branches, _ := whole["anyOf"].([]any)
	if len(branches) != 2 || branches[0].(map[string]any)["type"] != "boolean" || branches[1].(map[string]any)["type"] != "null" {
		t.Errorf("wholeMeal = %v, want anyOf [boolean, null]", whole)
	}
	if _, has := whole["type"]; has {
		t.Error("a type list must be projected to anyOf, not kept")
	}
	if _, has := whole["default"]; has {
		t.Error("wholeMeal has no default")
	}
	if !hasString(required, "wholeMeal") {
		t.Error("wholeMeal must be required in the projection")
	}
}

func hasString(list []any, s string) bool {
	for _, v := range list {
		if v == s {
			return true
		}
	}
	return false
}

func finishRecipe(t *testing.T, extra string) ra.Finished {
	t.Helper()
	raw := `{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[{"name":"rice","baseUnit":"g","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[{"name":"Rice","description":"","yield":2,"readyMeal":false,"tags":[],"image":"",` + extra + `
	  "cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "ingredients":[{"ingredient":"rice","quantity":200,"unit":"g","note":"","optional":false}],"steps":[]}]}`
	fin, err := ra.Finish([]byte(raw), ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v", err)
	}
	return fin
}

func TestFinishDropsAnEmptyCoursesListAndANullWholeMealSoTheImportDefaultsApply(t *testing.T) {
	r := finishRecipe(t, `"courses":[],"wholeMeal":null,`).File.Recipes[0]
	if len(r.Courses) != 0 || r.WholeMeal != nil {
		t.Fatalf("courses %v, wholeMeal %v: the model's none must read as absent", r.Courses, r.WholeMeal)
	}
}

func TestFinishKeepsTheCourseNamesAndAnExplicitFalseWholeMeal(t *testing.T) {
	r := finishRecipe(t, `"courses":["Side","Starter"],"wholeMeal":false,`).File.Recipes[0]
	if len(r.Courses) != 2 || r.Courses[0] != "Side" || r.Courses[1] != "Starter" {
		t.Errorf("courses = %v", r.Courses)
	}
	if r.WholeMeal == nil || *r.WholeMeal {
		t.Errorf("wholeMeal = %v, want an explicit false: false is an answer, not a none", r.WholeMeal)
	}
}

func TestFinishKeepsATrueWholeMeal(t *testing.T) {
	r := finishRecipe(t, `"courses":["Main"],"wholeMeal":true,`).File.Recipes[0]
	if r.WholeMeal == nil || !*r.WholeMeal {
		t.Errorf("wholeMeal = %v", r.WholeMeal)
	}
}

func TestTheTemplateGoldenAsksForCoursesAndHasNoDishType(t *testing.T) {
	b, err := os.ReadFile("testdata/agent-prompt-template.golden.txt")
	if err != nil {
		t.Fatal(err)
	}
	g := string(b)
	if strings.Count(g, "{{COURSES}}") != 1 {
		t.Error("the golden template must hold {{COURSES}} exactly once")
	}
	if strings.Contains(strings.ToLower(g), "dish type") {
		t.Error("rule 8 still says \"dish type\"")
	}
	if !strings.Contains(g, `8. Add 1–4 short lowercase "tags" (main protein, cooking method or style, e.g. "chicken", "traybake", "vegetarian").`) {
		t.Error("rule 8 is not the reworded one")
	}
	if !strings.Contains(g, "13. Courses:") || !strings.Contains(g, "14. Whole meal:") {
		t.Error("rules 13 and 14 are missing")
	}
}
