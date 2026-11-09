package recipefile_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

func TestExtractTemplateTakesTheFencedBlockOfRecipeFileMD(t *testing.T) {
	tpl, err := recipefile.ExtractTemplate(spec.RecipeFileMD)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(tpl, "You convert recipes into a Feeder Recipe File") {
		t.Fatalf("starts with %q", tpl[:40])
	}
	if !strings.HasSuffix(tpl, "The recipe to convert follows.") {
		t.Fatalf("ends with %q", tpl[len(tpl)-40:])
	}
	for _, want := range []string{"{{SCHEMA}}", "{{EXAMPLE}}", "11. Several recipes"} {
		if strings.Count(tpl, want) != 1 {
			t.Fatalf("template must contain %q exactly once", want)
		}
	}
	if strings.Contains(tpl, "````") {
		t.Fatal("the fences must be removed")
	}
}

func TestExtractTemplateFailsWithoutABlock(t *testing.T) {
	if _, err := recipefile.ExtractTemplate("# nothing here\n"); !errors.Is(err, recipefile.ErrNoTemplate) {
		t.Fatalf("got %v", err)
	}
}

func TestAgentPromptInlinesSchemaAndExample(t *testing.T) {
	tpl, _ := recipefile.ExtractTemplate(spec.RecipeFileMD)
	got := recipefile.AgentPrompt(tpl, string(spec.Schema), string(spec.Example))
	if strings.Contains(got, "{{") {
		t.Fatal("placeholders left in the prompt")
	}
	if !strings.Contains(got, strings.TrimSpace(string(spec.Schema))) || !strings.Contains(got, strings.TrimSpace(string(spec.Example))) {
		t.Fatal("schema and example must be inlined verbatim")
	}
	if i, j := strings.Index(got, "JSON Schema:\n{"), strings.Index(got, "Example of a valid file:\n{"); i < 0 || j < i {
		t.Fatalf("order wrong: schema at %d, example at %d", i, j)
	}
	if !strings.HasSuffix(got, "\nThe recipe to convert follows.") {
		t.Fatal("the prompt ends with the template's last line")
	}
}

func TestAgentPromptDoesNotReprocessInsertedText(t *testing.T) {
	// A schema or example that itself contains a placeholder must not be expanded again.
	got := recipefile.AgentPrompt("A {{SCHEMA}} B {{EXAMPLE}}", "s {{EXAMPLE}}", "e")
	if got != "A s {{EXAMPLE}} B e" {
		t.Fatalf("got %q", got)
	}
}
