package spec_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
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
