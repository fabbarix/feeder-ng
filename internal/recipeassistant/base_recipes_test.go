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

func TestOutputSchemaProjectsTheBaseRecipeFieldsAsRequiredAnyOfNull(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	recipeProps := defs["recipe"].(map[string]any)["properties"].(map[string]any)
	lineProps := defs["quantity"].(map[string]any)["properties"].(map[string]any)
	recipeReq := toStrings(defs["recipe"].(map[string]any)["required"])
	lineReq := toStrings(defs["quantity"].(map[string]any)["required"])

	for _, tc := range []struct {
		name  string
		props map[string]any
		req   []string
		want  string // the non-null branch
	}{
		{"baseRecipe", recipeProps, recipeReq, "boolean"},
		{"yieldUnit", recipeProps, recipeReq, "#/$defs/unit"},
		{"recipe", lineProps, lineReq, "#/$defs/recipeRef"},
		{"neededAtStep", lineProps, lineReq, "integer"},
	} {
		p, ok := tc.props[tc.name].(map[string]any)
		if !ok {
			t.Errorf("%s is missing from the projection", tc.name)
			continue
		}
		if !contains(tc.req, tc.name) {
			t.Errorf("%s must be required (the model writes null for none)", tc.name)
		}
		types := anyOfTypes(t, tc.name, p)
		if len(types) != 2 || !contains(types, "null") || !contains(types, tc.want) {
			t.Errorf("%s: anyOf = %v, want [%s, null]", tc.name, types, tc.want)
		}
		if _, has := p["type"]; has {
			t.Errorf("%s: type must move into anyOf", tc.name)
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
	  "ingredients":[{"ingredient":"lasagne sheets","quantity":250,"unit":"g","note":"","optional":false,"recipe":null,"neededAtStep":null},
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

func TestFinishDropsRecipeNullAndNeededAtStepNullAndBlankYieldUnit(t *testing.T) {
	r := finishBase(t, `"recipe":null,"neededAtStep":null`)
	for i, l := range r.Ingredients {
		if l.Recipe != nil || l.NeededAtStep != nil {
			t.Errorf("line %d: null reads as absent: %+v", i, l)
		}
	}
	if r.YieldUnit != "" {
		t.Errorf("a blank yieldUnit reads as absent, got %q", r.YieldUnit)
	}
	if r.BaseRecipe == nil || *r.BaseRecipe {
		t.Errorf("false stays and means plannable, got %v", r.BaseRecipe)
	}
}

func TestFinishKeepsAMarkWithItsCueAndDropsABlankCue(t *testing.T) {
	r := finishBase(t, `"recipe":{"name":"Béchamel","cue":"see page 42"},"neededAtStep":1`)
	l := r.Ingredients[1]
	if l.Recipe == nil || l.Recipe.Name != "Béchamel" || l.Recipe.Cue != "see page 42" || l.NeededAtStep == nil || *l.NeededAtStep != 1 {
		t.Fatalf("line = %+v", l)
	}
	r = finishBase(t, `"recipe":{"name":"Béchamel","cue":""},"neededAtStep":null`)
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
	  "ingredients":[{"ingredient":"milk","quantity":1000,"unit":"ml","note":"","optional":false,"recipe":null,"neededAtStep":null}],
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
	  "ingredients":[{"ingredient":"milk","quantity":1000,"unit":"ml","note":"","optional":false,"recipe":null,"neededAtStep":null}],
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

func TestOutputSchemaUseHasNoRecipeOrNeededAtStep(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	items := defs["step"].(map[string]any)["properties"].(map[string]any)["uses"].(map[string]any)["items"].(map[string]any)
	use := items
	if ref, ok := items["$ref"].(string); ok {
		use = defs[strings.TrimPrefix(ref, "#/$defs/")].(map[string]any)
	}
	props := use["properties"].(map[string]any)
	for _, name := range []string{"recipe", "neededAtStep"} {
		if _, has := props[name]; has {
			t.Errorf("the projection's use has %q: the model would fill a field Import ignores", name)
		}
	}
	if len(toStrings(use["required"])) != len(props) {
		t.Errorf("a use requires all its properties: %v", use["required"])
	}
}

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
