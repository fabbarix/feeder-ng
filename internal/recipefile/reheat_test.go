package recipefile_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

// R12: the optional `reheatMinutes` of a Recipe (integer 1 to 30). It is an additive, backwards compatible addition to
// Recipe File v1: files without it stay valid and the version stays 1 (docs/dev/design/r12-reheat.md).

func TestParseReadsTheReheatTimeOfTheExample(t *testing.T) {
	f := exampleFile(t)
	if got := f.Recipes[0].ReheatMinutes; got == nil || *got != 4 {
		t.Fatalf("the example's first Recipe has reheatMinutes 4, got %v", got)
	}
	if f.Recipes[1].ReheatMinutes != nil {
		t.Fatal("the example's second Recipe has none: absent must stay nil")
	}
}

func TestOldFilesWithoutReheatMinutesStayValid(t *testing.T) {
	data := mutate(t, func(r map[string]any) {
		for i := range r["recipes"].([]any) {
			delete(recipeAt(r, i), "reheatMinutes")
		}
	})
	f, err := recipefile.Parse(data)
	if err != nil {
		t.Fatalf("a v1 file without reheatMinutes must parse: %v", err)
	}
	for _, rec := range f.Recipes {
		if rec.ReheatMinutes != nil {
			t.Fatalf("%s: ReheatMinutes = %d, want nil", rec.Name, *rec.ReheatMinutes)
		}
	}
	if f.Version != 1 {
		t.Fatalf("version = %d: the field is a minor addition, the version stays 1", f.Version)
	}
}

func TestParseAcceptsNullAndRejectsOutOfRangeReheatMinutes(t *testing.T) {
	if _, err := recipefile.Parse(mutate(t, func(r map[string]any) { recipeAt(r, 0)["reheatMinutes"] = nil })); err != nil {
		t.Fatalf("null means not set: %v", err)
	}
	for name, v := range map[string]any{"zero": 0, "negative": -1, "above 30": 31, "fraction": 2.5, "text": "four"} {
		t.Run(name, func(t *testing.T) {
			_, err := recipefile.Parse(mutate(t, func(r map[string]any) { recipeAt(r, 0)["reheatMinutes"] = v }))
			var se *recipefile.SchemaError
			if !errors.Is(err, recipefile.ErrSchema) || !errors.As(err, &se) || !hasPath(se.Errors, "$.recipes[0].reheatMinutes", "") {
				t.Fatalf("got %v, want a schema error at $.recipes[0].reheatMinutes", err)
			}
		})
	}
}

func TestBuildExportsTheReheatTimeAndOmitsAnUnsetOne(t *testing.T) {
	in := exportFixture()
	in.Recipes[0].ReheatMinutes = intp(7)
	f, _ := recipefile.Build(in)
	if got := f.Recipes[0].ReheatMinutes; got == nil || *got != 7 {
		t.Fatalf("exported reheatMinutes = %v, want 7", got)
	}
	if f.Recipes[1].ReheatMinutes != nil {
		t.Fatal("a Recipe without a reheat time exports none")
	}
	data, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Count(string(data), `"reheatMinutes"`) != 1 {
		t.Fatalf("exactly one Recipe has the key, got:\n%s", data)
	}
}

func TestExportThenParseKeepsTheReheatTime(t *testing.T) {
	in := exportFixture()
	in.Recipes[0].ReheatMinutes = intp(30)
	f, _ := recipefile.Build(in)
	data, err := recipefile.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	back, err := recipefile.Parse(data)
	if err != nil {
		t.Fatalf("the export must validate: %v", err)
	}
	if got := back.Recipes[0].ReheatMinutes; got == nil || *got != 30 {
		t.Fatalf("round trip reheatMinutes = %v, want 30", got)
	}
}

func TestTheAgentPromptTellsTheAgentAboutReheatMinutes(t *testing.T) {
	tpl, err := recipefile.ExtractTemplate(spec.RecipeFileMD)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(tpl, "reheatMinutes") {
		t.Fatal("the template (not only the inlined schema) must have a rule about reheatMinutes")
	}
	for _, want := range []string{"1", "30", "Leftover"} {
		if !strings.Contains(tpl, want) {
			t.Errorf("the reheatMinutes rule should mention %q", want)
		}
	}
	prompt := recipefile.AgentPrompt(tpl, string(spec.Schema), string(spec.Example), nil)
	// the schema and the example are inlined too, so the key shows up there as well
	if strings.Count(prompt, "reheatMinutes") < 3 {
		t.Fatalf("expected the rule, the schema and the example to mention reheatMinutes, got %d", strings.Count(prompt, "reheatMinutes"))
	}
}

func TestRecipeFileMDDocumentsReheatMinutes(t *testing.T) {
	md := string(spec.RecipeFileMD)
	i := strings.Index(md, "| `reheatMinutes` |")
	if i < 0 {
		t.Fatal("docs/spec/recipe-file.md needs a `reheatMinutes` row in the Recipes table")
	}
	if !strings.Contains(md, "backwards compatible") && !strings.Contains(md, "backward compatible") {
		t.Error("recipe-file.md should say the field is an optional, backwards compatible addition to v1")
	}
}

func TestImportCommitCarriesTheReheatTime(t *testing.T) {
	c, err := recipefile.BuildCommit(exampleFile(t), recipefile.Existing{}, recipefile.Decisions{}, noImages)
	if err != nil {
		t.Fatal(err)
	}
	if got := c.Recipes[0].Input.ReheatMinutes; got == nil || *got != 4 {
		t.Fatalf("imported ReheatMinutes = %v, want 4", got)
	}
	if c.Recipes[1].Input.ReheatMinutes != nil {
		t.Fatal("a Recipe without the field is imported without a reheat time")
	}
}
