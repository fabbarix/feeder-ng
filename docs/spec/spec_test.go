package spec_test

import (
	"encoding/json"
	"os"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

func TestEmbeddedFilesAreTheSpecFiles(t *testing.T) {
	var v map[string]any
	if err := json.Unmarshal(spec.Schema, &v); err != nil || v["title"] != "Feeder Recipe File v1" {
		t.Fatalf("schema not embedded: %v %v", err, v["title"])
	}
	if err := json.Unmarshal(spec.Example, &v); err != nil || v["format"] != "feeder-recipe-file" {
		t.Fatalf("example not embedded: %v", err)
	}
	if !strings.Contains(spec.RecipeFileMD, "## Agent Prompt") {
		t.Fatal("recipe-file.md not embedded")
	}
}

// BR-C (beta.6, Base recipes): the new fields are optional additions to version 1 (docs/dev/design/base-recipes.md §11.1).

func defsOf(t *testing.T) map[string]any {
	t.Helper()
	var root map[string]any
	if err := json.Unmarshal(spec.Schema, &root); err != nil {
		t.Fatal(err)
	}
	return root["$defs"].(map[string]any)
}

func propsOf(t *testing.T, def any) map[string]any {
	t.Helper()
	m, ok := def.(map[string]any)
	if !ok {
		t.Fatalf("not a schema object: %v", def)
	}
	p, ok := m["properties"].(map[string]any)
	if !ok {
		t.Fatalf("no properties: %v", m)
	}
	return p
}

func requiredOf(def any) []any {
	r, _ := def.(map[string]any)["required"].([]any)
	return r
}

func nullable(s any) bool {
	m, _ := s.(map[string]any)
	if list, ok := m["type"].([]any); ok {
		for _, t := range list {
			if t == "null" {
				return true
			}
		}
	}
	if any_, ok := m["anyOf"].([]any); ok {
		for _, b := range any_ {
			if bm, _ := b.(map[string]any); bm["type"] == "null" {
				return true
			}
		}
	}
	return false
}

func TestSchemaListsTheBaseRecipeFieldsAsOptionalAndNullable(t *testing.T) {
	defs := defsOf(t)
	recipe := propsOf(t, defs["recipe"])
	for _, name := range []string{"baseRecipe", "yieldUnit"} {
		p, ok := recipe[name]
		if !ok {
			t.Fatalf("recipe.%s is not in the schema", name)
		}
		if !nullable(p) {
			t.Errorf("recipe.%s must accept null: %v", name, p)
		}
		for _, r := range requiredOf(defs["recipe"]) {
			if r == name {
				t.Errorf("recipe.%s must stay optional (backwards compatible)", name)
			}
		}
	}
	line := propsOf(t, defs["quantity"])
	for _, name := range []string{"recipe", "neededAtStep"} {
		p, ok := line[name]
		if !ok {
			t.Fatalf("quantity.%s is not in the schema", name)
		}
		if !nullable(p) {
			t.Errorf("quantity.%s must accept null: %v", name, p)
		}
		for _, r := range requiredOf(defs["quantity"]) {
			if r == name {
				t.Errorf("quantity.%s must stay optional", name)
			}
		}
	}
}

func TestSchemaHasARecipeRefDefinitionForTheLineReference(t *testing.T) {
	defs := defsOf(t)
	ref, ok := defs["recipeRef"].(map[string]any)
	if !ok {
		t.Fatal("$defs.recipeRef is missing: the projection needs a named definition to make `recipe` anyOf [{$ref recipeRef}, null]")
	}
	if ref["additionalProperties"] != false {
		t.Error("recipeRef is a closed object")
	}
	p := propsOf(t, ref)
	if _, ok := p["name"]; !ok {
		t.Error("recipeRef.name")
	}
	if _, ok := p["cue"]; !ok {
		t.Error("recipeRef.cue")
	}
	req := requiredOf(ref)
	if len(req) != 1 || req[0] != "name" {
		t.Errorf("recipeRef requires its name only, got %v", req)
	}
	if !strings.Contains(string(spec.Schema), `#/$defs/recipeRef`) {
		t.Error("the line's `recipe` property must reference recipeRef")
	}
}

func TestSchemaStillRequiresOnlyWhatBeta5Required(t *testing.T) {
	defs := defsOf(t)
	if got := requiredOf(defs["recipe"]); len(got) != 3 {
		t.Errorf("recipe required = %v", got)
	}
	if got := requiredOf(defs["quantity"]); len(got) != 3 {
		t.Errorf("quantity required = %v", got)
	}
}

func TestAgentPromptHasTheTwoBaseRecipeRules(t *testing.T) {
	md := spec.RecipeFileMD
	start := strings.Index(md, "## Agent Prompt")
	end := strings.Index(md, "## Recipe Assistant")
	if start < 0 || end < start {
		t.Fatal("sections not found")
	}
	prompt := md[start:end]
	for _, want := range []string{
		"\n15. Base recipes:", `"baseRecipe": true`, `"yieldUnit"`, "sauce, a dough, a stock",
		"\n16. A line that calls for another recipe", `"recipe": { "name"`, `"cue"`, `"neededAtStep"`, "Never invent a recipe that the source does not point at",
	} {
		if !strings.Contains(prompt, want) {
			t.Errorf("the Agent Prompt must contain %q", want)
		}
	}
	if strings.Index(prompt, "\n14. Whole meal") > strings.Index(prompt, "\n15. Base recipes:") {
		t.Error("rule 15 follows rule 14")
	}
	if strings.Index(prompt, "\n15. Base recipes:") > strings.Index(prompt, "\n16. A line") {
		t.Error("rule 16 follows rule 15")
	}
}

func TestRecipeFileDocListsTheNewFieldsInItsTablesNotOnlyInTheScheduledSection(t *testing.T) {
	md := spec.RecipeFileMD
	if strings.Contains(md, "Scheduled for beta.6, not part of the format today") {
		t.Error("BR-C makes the fields part of the format: the 'not part of the format today' notice goes")
	}
	rec := md[strings.Index(md, "## Recipes"):strings.Index(md, "### Steps and timing")]
	for _, f := range []string{"`baseRecipe`", "`yieldUnit`", "`recipe`", "`neededAtStep`"} {
		if !strings.Contains(rec, f) {
			t.Errorf("the Recipes tables must list %s", f)
		}
	}
}

func TestTheBaseRecipesFixtureIsValidAndUsesEveryNewField(t *testing.T) {
	raw, err := os.ReadFile("fixtures/base-recipes.json")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := recipefile.Parse(raw); err != nil {
		t.Fatalf("fixtures/base-recipes.json must satisfy the schema: %v", err)
	}
	for _, field := range []string{`"baseRecipe"`, `"yieldUnit"`, `"recipe"`, `"neededAtStep"`, `"cue"`} {
		if !strings.Contains(string(raw), field) {
			t.Errorf("the fixture should exercise %s", field)
		}
	}
}

func TestThePublishedExampleStaysValidAndFreeOfBeta6Fields(t *testing.T) {
	if _, err := recipefile.Parse(spec.Example); err != nil {
		t.Fatalf("the beta.5 example is still a valid file: %v", err)
	}
}
