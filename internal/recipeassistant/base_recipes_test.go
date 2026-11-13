package recipeassistant_test

import (
	"os"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// BR-C (beta.6, Base recipes): the Recipe Assistant follows the Recipe File by projection
// (docs/dev/design/base-recipes.md §11.2). OutputSchema's code does not change; its input does.

func anyOfTypes(t *testing.T, name string, s map[string]any) []string {
	t.Helper()
	list, ok := s["anyOf"].([]any)
	if !ok {
		t.Fatalf("%s: want anyOf, got %v", name, s)
	}
	var out []string
	for _, b := range list {
		bm := b.(map[string]any)
		switch {
		case bm["type"] != nil:
			out = append(out, bm["type"].(string))
		case bm["$ref"] != nil:
			out = append(out, bm["$ref"].(string))
		}
	}
	return out
}

// HF-schema (1.0.0-beta.6.1): the four Base recipe fields are no longer unions. A union costs the structured-outputs grammar
// compiler exponentially, and the two line-level ones sat inside arrays of objects; the model writes an explicit "none".
func TestOutputSchemaProjectsTheBaseRecipeFieldsAsRequiredPlainTypesWithASentinel(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	recipeProps := defs["recipe"].(map[string]any)["properties"].(map[string]any)
	lineProps := defs["quantity"].(map[string]any)["properties"].(map[string]any)
	recipeReq := toStrings(defs["recipe"].(map[string]any)["required"])
	lineReq := toStrings(defs["quantity"].(map[string]any)["required"])

	for _, tc := range []struct {
		name     string
		props    map[string]any
		req      []string
		wantType string // "" when the property is a $ref
		wantRef  string
		sentinel string // the description must tell the model what to write for none
	}{
		{"baseRecipe", recipeProps, recipeReq, "boolean", "", "false"},
		{"yieldUnit", recipeProps, recipeReq, "", "#/$defs/unit", `Write "" unless baseRecipe is true`},
		{"recipe", lineProps, lineReq, "", "#/$defs/recipeRef", `Write name "" and cue ""`},
		{"neededAtStep", lineProps, lineReq, "integer", "", "Write -1"},
	} {
		p, ok := tc.props[tc.name].(map[string]any)
		if !ok {
			t.Errorf("%s is missing from the projection", tc.name)
			continue
		}
		if !contains(tc.req, tc.name) {
			t.Errorf("%s must be required (the model writes its none value)", tc.name)
		}
		if _, has := p["anyOf"]; has {
			t.Errorf("%s: must not be a union: %v", tc.name, p)
		}
		if tc.wantType != "" && p["type"] != tc.wantType {
			t.Errorf("%s: type = %v, want %q", tc.name, p["type"], tc.wantType)
		}
		if tc.wantRef != "" && p["$ref"] != tc.wantRef {
			t.Errorf("%s: $ref = %v, want %q", tc.name, p["$ref"], tc.wantRef)
		}
		if d, _ := p["description"].(string); !strings.Contains(d, tc.sentinel) {
			t.Errorf("%s: description %q must say %q", tc.name, d, tc.sentinel)
		}
	}
}

func TestOutputSchemaProjectsRecipeRefWithBothFieldsRequired(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	ref, ok := defs["recipeRef"].(map[string]any)
	if !ok {
		t.Fatal("$defs.recipeRef is missing from the projection")
	}
	if ref["type"] != "object" || ref["additionalProperties"] != false {
		t.Errorf("recipeRef = %v", ref)
	}
	if req := toStrings(ref["required"]); len(req) != 2 || !contains(req, "name") || !contains(req, "cue") {
		t.Errorf("the model writes both name and cue, cue empty for none: required = %v", req)
	}
}

func TestOutputSchemaGoldenHoldsTheBaseRecipeFields(t *testing.T) {
	// The golden is regenerated with -update once the schema has the fields, and reviewed in the diff.
	raw, err := os.ReadFile("testdata/output-schema.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{`"baseRecipe"`, `"yieldUnit"`, `"neededAtStep"`, `"recipeRef"`, `"cue"`} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("testdata/output-schema.golden.json lacks %s", want)
		}
	}
}

func TestAgentPromptGoldenHoldsRules15And16(t *testing.T) {
	raw, err := os.ReadFile("testdata/agent-prompt-template.golden.txt")
	if err != nil {
		t.Fatal(err)
	}
	for _, want := range []string{"\n15. Base recipes:", "\n16. A line that calls for another recipe", `"baseRecipe": true`, `"cue"`} {
		if !strings.Contains(string(raw), want) {
			t.Errorf("testdata/agent-prompt-template.golden.txt lacks %q", want)
		}
	}
	got, err := recipefile.ExtractTemplate(spec.RecipeFileMD)
	if err != nil {
		t.Fatal(err)
	}
	if got != string(raw) {
		t.Error("the golden must equal ExtractTemplate(recipe-file.md): regenerate it by hand and review the diff")
	}
}

func TestTheAddendumDoesNotMentionBaseRecipes(t *testing.T) {
	// "the addendum is unchanged": the rules live in the Agent Prompt, the schema carries the fields.
	if strings.Contains(strings.ToLower(ra.Addendum), "base recipe") {
		t.Error("the Recipe Assistant addendum stays as it was")
	}
}

// ---- pruneNone, through Finish ---------------------------------------------------------------------------------

// baseAnswer is a model answer with every field spelled out, as the output schema forces it: nothing is a Base recipe.
func baseAnswer(recipeJSON string) []byte {
	return []byte(`{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[{"name":"lasagne sheets","baseUnit":"g","conversions":[],"image":"","shelfLifeDays":null},
	                {"name":"béchamel","baseUnit":"ml","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[{"name":"Lasagne","description":"","yield":4,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],
	  "image":"","cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "baseRecipe":false,"yieldUnit":"",
	  "ingredients":[{"ingredient":"lasagne sheets","quantity":250,"unit":"g","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1},
	                 {"ingredient":"béchamel","quantity":500,"unit":"ml","note":"","optional":false,` + recipeJSON + `}],
	  "steps":[{"text":"Cook.","kind":"active","durationMinutes":5,"leadTimeMinutes":0,"after":[],"uses":[],"image":""},
	           {"text":"Layer.","kind":"active","durationMinutes":5,"leadTimeMinutes":0,"after":[0],"uses":[],"image":""}]}]}`)
}

func finishBase(t *testing.T, recipeJSON string) recipefile.Recipe {
	t.Helper()
	fin, err := ra.Finish(baseAnswer(recipeJSON), ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v (%+v)", err, err)
	}
	return fin.File.Recipes[0]
}

func TestFinishDropsTheNoneSentinelsOfRecipeNeededAtStepYieldUnitAndBaseRecipe(t *testing.T) {
	r := finishBase(t, `"recipe":{"name":"","cue":""},"neededAtStep":-1`)
	for i, l := range r.Ingredients {
		if l.Recipe != nil || l.NeededAtStep != nil {
			t.Errorf("line %d: the none sentinels read as absent: %+v", i, l)
		}
	}
	if r.YieldUnit != "" {
		t.Errorf("a blank yieldUnit reads as absent, got %q", r.YieldUnit)
	}
	if r.BaseRecipe != nil {
		t.Errorf("baseRecipe false reads as absent (a plannable Recipe), got %v", *r.BaseRecipe)
	}
}

func TestFinishKeepsAMarkWithItsCueAndDropsABlankCue(t *testing.T) {
	r := finishBase(t, `"recipe":{"name":"Béchamel","cue":"see page 42"},"neededAtStep":1`)
	l := r.Ingredients[1]
	if l.Recipe == nil || l.Recipe.Name != "Béchamel" || l.Recipe.Cue != "see page 42" || l.NeededAtStep == nil || *l.NeededAtStep != 1 {
		t.Fatalf("line = %+v", l)
	}
	r = finishBase(t, `"recipe":{"name":"Béchamel","cue":""},"neededAtStep":-1`)
	if l := r.Ingredients[1]; l.Recipe == nil || l.Recipe.Name != "Béchamel" || l.Recipe.Cue != "" || l.NeededAtStep != nil {
		t.Fatalf("a blank cue is none: %+v", l)
	}
}

func TestFinishKeepsNeededAtStepZero(t *testing.T) {
	// 0 is the first Step, not "none": the integer must not be pruned like a plain number's 0.
	r := finishBase(t, `"recipe":{"name":"Béchamel","cue":""},"neededAtStep":0`)
	if l := r.Ingredients[1]; l.NeededAtStep == nil || *l.NeededAtStep != 0 {
		t.Fatalf("neededAtStep 0 was lost: %+v", l.NeededAtStep)
	}
}

func TestFinishAcceptsABaseRecipeAnswerWithTheNonesOfARecipeThatIsNotServed(t *testing.T) {
	raw := `{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[{"name":"milk","baseUnit":"ml","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[{"name":"Béchamel","description":"","yield":1,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],
	  "image":"","cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "baseRecipe":true,"yieldUnit":"l",
	  "ingredients":[{"ingredient":"milk","quantity":1000,"unit":"ml","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1}],
	  "steps":[]}]}`
	fin, err := ra.Finish([]byte(raw), ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v (%+v)", err, err)
	}
	r := fin.File.Recipes[0]
	if r.BaseRecipe == nil || !*r.BaseRecipe || r.YieldUnit != "l" || len(r.Courses) != 0 || r.WholeMeal != nil {
		t.Fatalf("recipe = %+v", r)
	}
}

func TestFinishRejectsABaseRecipeWithoutAYieldUnitWithThePath(t *testing.T) {
	raw := `{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[{"name":"milk","baseUnit":"ml","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[{"name":"Béchamel","description":"","yield":1,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],
	  "image":"","cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "baseRecipe":true,"yieldUnit":"",
	  "ingredients":[{"ingredient":"milk","quantity":1000,"unit":"ml","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1}],
	  "steps":[]}]}`
	_, err := ra.Finish([]byte(raw), ra.FinishInput{Kind: ra.KindText})
	if ra.CodeOf(err) != ra.CodeInvalidOutput {
		t.Fatalf("code = %q, want invalid_output", ra.CodeOf(err))
	}
	e := err.(*ra.Error)
	var found bool
	for _, p := range e.Paths {
		if p.Path == "$.recipes[0].yieldUnit" {
			found = true
		}
	}
	if !found {
		t.Errorf("paths = %+v, want one at $.recipes[0].yieldUnit so the repair turn can fix it", e.Paths)
	}
}

// ---- round 2 --------------------------------------------------------------------------------------------------

func TestOutputSchemaCueDescriptionSaysWriteEmptyTextWhenThereIsNoCue(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	cue := defs["recipeRef"].(map[string]any)["properties"].(map[string]any)["cue"].(map[string]any)
	d, _ := cue["description"].(string)
	if strings.Contains(d, "Omit it") || !strings.Contains(d, `""`) {
		t.Errorf("cue description = %q: the projection requires cue, so the model must be told to write \"\"", d)
	}
	raw, err := os.ReadFile("testdata/output-schema.golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(raw), "Omit it when the source gives none") {
		t.Error("the golden still carries the old cue description")
	}
}

// ---- round 3 --------------------------------------------------------------------------------------------------

func TestFinishAcceptsAUseWithNoteAndOptionalSpelledOut(t *testing.T) {
	raw := []byte(`{"format":"feeder-recipe-file","version":1,"noRecipe":false,
	 "ingredients":[{"name":"rice","baseUnit":"g","conversions":[],"image":"","shelfLifeDays":null}],
	 "recipes":[{"name":"Rice","description":"","yield":2,"readyMeal":false,"courses":[],"wholeMeal":null,"tags":[],
	  "image":"","cooldownDays":null,"leftoverUseByDays":null,"reheatMinutes":null,"source":{"url":"","attribution":""},
	  "baseRecipe":false,"yieldUnit":"",
	  "ingredients":[{"ingredient":"rice","quantity":200,"unit":"g","note":"","optional":false,"recipe":{"name":"","cue":""},"neededAtStep":-1}],
	  "steps":[{"text":"Boil.","kind":"active","durationMinutes":5,"leadTimeMinutes":0,"after":[],"image":"",
	   "uses":[{"ingredient":"rice","quantity":200,"unit":"g","note":"","optional":false}]}]}]}`)
	fin, err := ra.Finish(raw, ra.FinishInput{Kind: ra.KindText})
	if err != nil {
		t.Fatalf("Finish: %v (%+v)", err, err)
	}
	if u := fin.File.Recipes[0].Steps[0].Uses; len(u) != 1 || u[0].Ingredient != "rice" || u[0].Note != "" {
		t.Errorf("uses = %+v", u)
	}
}
