package recipeassistant_test

import (
	"bytes"
	"encoding/json"
	"flag"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/santhosh-tekuri/jsonschema/v6"

	"github.com/fabbarix/feeder-ng/docs/spec"
	ra "github.com/fabbarix/feeder-ng/internal/recipeassistant"
)

var update = flag.Bool("update", false, "rewrite golden files")

func projected(t *testing.T) []byte {
	t.Helper()
	out, err := ra.OutputSchema(spec.Schema)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func decode(t *testing.T, b []byte) map[string]any {
	t.Helper()
	var m map[string]any
	if err := json.Unmarshal(b, &m); err != nil {
		t.Fatalf("not JSON: %v\n%s", err, b)
	}
	return m
}

// The keywords structured outputs accept (design §4.6).
var allowedKeywords = map[string]bool{
	"type": true, "properties": true, "required": true, "items": true, "enum": true, "const": true,
	"$defs": true, "$ref": true, "anyOf": true, "description": true, "additionalProperties": true, "format": true,
}

// walkSchemas calls f for every schema object, with its JSON path.
func walkSchemas(path string, s any, f func(path string, s map[string]any)) {
	m, ok := s.(map[string]any)
	if !ok {
		return
	}
	f(path, m)
	if props, ok := m["properties"].(map[string]any); ok {
		for k, v := range props {
			walkSchemas(path+".properties."+k, v, f)
		}
	}
	if defs, ok := m["$defs"].(map[string]any); ok {
		for k, v := range defs {
			walkSchemas(path+".$defs."+k, v, f)
		}
	}
	if items, ok := m["items"]; ok {
		walkSchemas(path+".items", items, f)
	}
	if any_, ok := m["anyOf"].([]any); ok {
		for i, v := range any_ {
			walkSchemas(path+".anyOf["+string(rune('0'+i))+"]", v, f)
		}
	}
}

func TestOutputSchemaUsesOnlyAcceptedKeywords(t *testing.T) {
	root := decode(t, projected(t))
	n := 0
	walkSchemas("$", root, func(path string, s map[string]any) {
		n++
		for k := range s {
			if !allowedKeywords[k] {
				t.Errorf("%s: keyword %q is not accepted by structured outputs", path, k)
			}
		}
		if _, isList := s["type"].([]any); isList {
			t.Errorf("%s: type must be a single string, got a list", path)
		}
		if s["type"] == "object" && s["additionalProperties"] != false {
			t.Errorf("%s: an object must have additionalProperties:false, got %v", path, s["additionalProperties"])
		}
		if f, ok := s["format"].(string); ok && f != "date-time" && f != "uri" {
			t.Errorf("%s: format %q", path, f)
		}
	})
	if n < 15 {
		t.Fatalf("only %d schemas found: the walk is broken or the projection dropped too much", n)
	}
}

func TestOutputSchemaDropsTheDocumentedKeywordsEverywhere(t *testing.T) {
	raw := projected(t)
	if !json.Valid(raw) {
		t.Fatal("the projection is not JSON")
	}
	out := string(raw)
	for _, k := range []string{`"$schema"`, `"$id"`, `"title"`, `"minimum"`, `"maximum"`, `"exclusiveMinimum"`, `"minLength"`, `"maxLength"`, `"minItems"`, `"maxItems"`, `"uniqueItems"`, `"pattern"`, `"default"`, `"if"`, `"then"`, `"else"`, `"not"`, `"allOf"`} {
		if strings.Contains(out, k+":") {
			t.Errorf("%s survived the projection", k)
		}
	}
}

func TestOutputSchemaKeepsTheStructure(t *testing.T) {
	root := decode(t, projected(t))
	props := root["properties"].(map[string]any)
	if root["type"] != "object" {
		t.Error("top-level type")
	}
	req := toStrings(root["required"])
	for _, want := range []string{"format", "version", "recipes"} {
		if !contains(req, want) {
			t.Errorf("required lost %q: %v", want, req)
		}
	}
	// Every property is required (an explicit "none" instead of a missing field), noRecipe included.
	if len(req) != len(props) || !contains(req, "noRecipe") {
		t.Errorf("required = %v, want every property", req)
	}
	if _, ok := props["exportedAt"]; ok {
		t.Error("exportedAt must be removed")
	}
	if nr, ok := props["noRecipe"].(map[string]any); !ok || nr["type"] != "boolean" {
		t.Errorf("noRecipe must be a boolean property, got %v", props["noRecipe"])
	}
	for _, k := range []string{"format", "version", "ingredients", "recipes"} {
		if _, ok := props[k]; !ok {
			t.Errorf("property %q lost", k)
		}
	}
	defs := root["$defs"].(map[string]any)
	for _, k := range []string{"name", "unit", "image", "ingredient", "quantity", "step", "recipe"} {
		if _, ok := defs[k]; !ok {
			t.Errorf("$defs.%s lost", k)
		}
	}
	// enum and const survive.
	if f := props["format"].(map[string]any); f["const"] != "feeder-recipe-file" {
		t.Errorf("format const: %v", f)
	}
	step := defs["step"].(map[string]any)["properties"].(map[string]any)
	if kind := step["kind"].(map[string]any); len(toStrings(kind["enum"])) != 3 {
		t.Errorf("step kind enum: %v", kind)
	}
	// Descriptions are kept: they steer the model.
	if d, _ := step["after"].(map[string]any)["description"].(string); !strings.Contains(d, "0-based") {
		t.Errorf("step.after description lost: %v", step["after"])
	}
	// source stays a closed object; its url loses format uri (it may be "" for none) and both fields are required.
	src := defs["recipe"].(map[string]any)["properties"].(map[string]any)["source"].(map[string]any)
	if src["additionalProperties"] != false || src["properties"].(map[string]any)["url"].(map[string]any)["format"] != nil ||
		len(toStrings(src["required"])) != 2 {
		t.Errorf("source: %v", src)
	}
	// Every object of the projection requires all its properties.
	var walk func(any)
	walk = func(v any) {
		switch o := v.(type) {
		case map[string]any:
			if p, ok := o["properties"].(map[string]any); ok && len(toStrings(o["required"])) != len(p) {
				t.Errorf("an object leaves properties optional: %v", toStrings(o["required"]))
			}
			for _, c := range o {
				walk(c)
			}
		case []any:
			for _, c := range o {
				walk(c)
			}
		}
	}
	walk(root)
}

func TestOutputSchemaRewritesNullableIntegersAsAnyOf(t *testing.T) {
	defs := decode(t, projected(t))["$defs"].(map[string]any)
	shelf := defs["ingredient"].(map[string]any)["properties"].(map[string]any)["shelfLifeDays"].(map[string]any)
	cooldown := defs["recipe"].(map[string]any)["properties"].(map[string]any)["cooldownDays"].(map[string]any)
	for name, s := range map[string]map[string]any{"shelfLifeDays": shelf, "cooldownDays": cooldown} {
		any_, ok := s["anyOf"].([]any)
		if !ok || len(any_) != 2 {
			t.Errorf("%s: want anyOf of two, got %v", name, s)
			continue
		}
		types := []string{any_[0].(map[string]any)["type"].(string), any_[1].(map[string]any)["type"].(string)}
		if !(contains(types, "integer") && contains(types, "null")) {
			t.Errorf("%s: anyOf types %v", name, types)
		}
		if _, has := s["type"]; has {
			t.Errorf("%s: type must move into anyOf", name)
		}
	}
}

func TestOutputSchemaReplacesTheImageAnyOfWithAPlainString(t *testing.T) {
	img := decode(t, projected(t))["$defs"].(map[string]any)["image"].(map[string]any)
	if img["type"] != "string" {
		t.Errorf("image: %v", img)
	}
	if _, has := img["anyOf"]; has {
		t.Error("image keeps its anyOf")
	}
	d, _ := img["description"].(string)
	if !strings.Contains(d, "https") || !strings.Contains(d, "source") {
		t.Errorf("image description must say it is an https URL that appears in the source: %q", d)
	}
}

func TestOutputSchemaIsDeterministic(t *testing.T) {
	a, b := projected(t), projected(t)
	if !bytes.Equal(a, b) {
		t.Fatal("two projections differ")
	}
	if !json.Valid(a) {
		t.Fatal("output must be valid JSON")
	}
}

func TestOutputSchemaRejectsGarbage(t *testing.T) {
	for _, in := range []string{"", "not json", "[]", "null", `"str"`} {
		if _, err := ra.OutputSchema([]byte(in)); err == nil {
			t.Errorf("%q must be an error", in)
		}
	}
}

func TestOutputSchemaMatchesTheGoldenFile(t *testing.T) {
	got := projected(t)
	path := filepath.Join("testdata", "output-schema.golden.json")
	if *update {
		if err := os.WriteFile(path, got, 0o644); err != nil {
			t.Fatal(err)
		}
	}
	want, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("golden file missing: run `go test ./internal/recipeassistant -run Golden -update`, review the diff, commit it (%v)", err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("the projection changed; if intended, regenerate with -update and review")
	}
}

func compile(t *testing.T, schema []byte) *jsonschema.Schema {
	t.Helper()
	doc, err := jsonschema.UnmarshalJSON(bytes.NewReader(schema))
	if err != nil {
		t.Fatal(err)
	}
	c := jsonschema.NewCompiler()
	c.DefaultDraft(jsonschema.Draft2020)
	if err := c.AddResource("mem://output.json", doc); err != nil {
		t.Fatal(err)
	}
	s, err := c.Compile("mem://output.json")
	if err != nil {
		t.Fatalf("the projection must be a valid schema: %v", err)
	}
	return s
}

// fullAnswer is a small answer as the model writes it under the projection: every field present, "none" spelled out.
func fullAnswer() map[string]any {
	none := map[string]any{"ingredient": "butter", "quantity": 10.0, "unit": "g", "note": "", "optional": false, "recipe": nil, "neededAtStep": nil}
	return map[string]any{"format": "feeder-recipe-file", "version": 1.0, "noRecipe": false,
		"ingredients": []any{map[string]any{"name": "butter", "baseUnit": "g", "conversions": []any{}, "image": "", "shelfLifeDays": nil}},
		"recipes": []any{map[string]any{
			"name": "Buttered toast", "description": "", "yield": 1.0, "readyMeal": false, "baseRecipe": false, "yieldUnit": "", "tags": []any{}, "image": "",
			"cooldownDays": nil, "leftoverUseByDays": nil, "reheatMinutes": nil, "courses": []any{}, "wholeMeal": nil, "source": map[string]any{"url": "", "attribution": ""},
			"ingredients": []any{none},
			"steps": []any{map[string]any{"text": "Toast the bread.", "kind": "active", "durationMinutes": 3.0, "leadTimeMinutes": 0.0,
				"after": []any{}, "uses": []any{}, "image": ""}},
		}}}
}

func TestProjectedSchemaAcceptsAnAnswerWithEveryFieldWritten(t *testing.T) {
	s := compile(t, projected(t))
	if err := s.Validate(fullAnswer()); err != nil {
		t.Fatalf("a full answer is rejected by the projection: %v", err)
	}
	// The spec example leaves optional fields out, which the projection no longer allows.
	var ex map[string]any
	if err := json.Unmarshal(spec.Example, &ex); err != nil {
		t.Fatal(err)
	}
	delete(ex, "exportedAt")
	if err := s.Validate(ex); err == nil {
		t.Fatal("an answer that leaves fields out must be rejected: every field is required")
	}
}

func TestProjectedSchemaAcceptsNoRecipeAndLooseValuesThatParseStillChecks(t *testing.T) {
	s := compile(t, projected(t))
	noRecipe := map[string]any{"format": "feeder-recipe-file", "version": 1, "recipes": []any{}, "ingredients": []any{}, "noRecipe": true}
	if err := s.Validate(noRecipe); err != nil {
		t.Fatalf("noRecipe answer: %v", err)
	}
	// Rules that were dropped are enforced later (Parse, CheckFile), not here.
	loose := fullAnswer()
	r := loose["recipes"].([]any)[0].(map[string]any)
	r["name"], r["yield"] = "", -1.0
	r["steps"].([]any)[0].(map[string]any)["kind"] = "passive"
	if err := s.Validate(loose); err != nil {
		t.Fatalf("the projection must not enforce dropped rules: %v", err)
	}
}

func TestProjectedSchemaStillRejectsUnknownPropertiesAndWrongTypes(t *testing.T) {
	s := compile(t, projected(t))
	for name, doc := range map[string]map[string]any{
		"extra top-level":   {"format": "feeder-recipe-file", "version": 1, "recipes": []any{}, "extra": 1},
		"wrong const":       {"format": "other", "version": 1, "recipes": []any{}},
		"missing recipes":   {"format": "feeder-recipe-file", "version": 1},
		"exportedAt gone":   {"format": "feeder-recipe-file", "version": 1, "recipes": []any{}, "exportedAt": "2026-01-01T00:00:00Z"},
		"noRecipe not bool": {"format": "feeder-recipe-file", "version": 1, "recipes": []any{}, "noRecipe": "yes"},
	} {
		if err := s.Validate(doc); err == nil {
			t.Errorf("%s: must be rejected", name)
		}
	}
}

func toStrings(v any) []string {
	var out []string
	for _, x := range v.([]any) {
		out = append(out, x.(string))
	}
	return out
}

func contains(s []string, v string) bool {
	for _, x := range s {
		if x == v {
			return true
		}
	}
	return false
}
