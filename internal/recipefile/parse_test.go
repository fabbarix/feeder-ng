package recipefile_test

import (
	"bytes"
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
)

func TestParseAcceptsTheSpecExample(t *testing.T) {
	f := exampleFile(t)
	if f.Format != recipefile.Format || f.Version != recipefile.Version {
		t.Fatalf("format/version = %q/%d", f.Format, f.Version)
	}
	if len(f.Ingredients) != 9 || len(f.Recipes) != 2 {
		t.Fatalf("ingredients=%d recipes=%d, want 9 and 2", len(f.Ingredients), len(f.Recipes))
	}
	tikka := f.Recipes[0]
	if tikka.Name != "Chicken tikka traybake" || tikka.Yield != 4 || len(tikka.Ingredients) != 8 || len(tikka.Steps) != 6 {
		t.Fatalf("first recipe wrong: %+v", tikka)
	}
	if tikka.CooldownDays == nil || *tikka.CooldownDays != 10 || tikka.LeftoverUseByDays == nil || *tikka.LeftoverUseByDays != 2 {
		t.Fatalf("overrides lost: %v %v", tikka.CooldownDays, tikka.LeftoverUseByDays)
	}
	adv := tikka.Steps[0]
	if adv.Kind != "advance" || adv.LeadTimeMinutes == nil || *adv.LeadTimeMinutes != 240 || len(adv.Uses) != 4 {
		t.Fatalf("advance step wrong: %+v", adv)
	}
	if got := tikka.Steps[3].After; len(got) != 2 || got[0] != 1 || got[1] != 2 {
		t.Fatalf("after = %v, want [1 2]", got)
	}
	if !f.Recipes[1].ReadyMeal || f.Recipes[1].Yield != 2 {
		t.Fatalf("ready meal wrong: %+v", f.Recipes[1])
	}
	garam := f.Ingredients[2]
	if garam.Name != "garam masala" || len(garam.Conversions) != 2 || garam.Conversions[0].ToBase != 6 {
		t.Fatalf("conversions wrong: %+v", garam)
	}
	if f.Ingredients[4].ShelfLifeDays == nil || *f.Ingredients[4].ShelfLifeDays != 30 || f.Ingredients[2].ShelfLifeDays != nil {
		t.Fatal("shelf life must be a pointer: 30 for onion, nil for garam masala")
	}
}

func TestParseIgnoresALeadingBOM(t *testing.T) {
	if _, err := recipefile.Parse(append([]byte("\xef\xbb\xbf"), spec.Example...)); err != nil {
		t.Fatalf("BOM must be ignored: %v", err)
	}
}

func TestParseRejectsInvalidJSON(t *testing.T) {
	for _, in := range []string{"", "not json", `{"format":`, `[1,2]`} {
		_, err := recipefile.Parse([]byte(in))
		if !errors.Is(err, recipefile.ErrSyntax) && !errors.Is(err, recipefile.ErrSchema) {
			t.Errorf("Parse(%q) = %v, want a syntax (or, for an array, schema) error", in, err)
		}
	}
	if _, err := recipefile.Parse([]byte("not json")); !errors.Is(err, recipefile.ErrSyntax) {
		t.Fatalf("plain text must be ErrSyntax, got %v", err)
	}
}

func TestParseRejectsOversizedFiles(t *testing.T) {
	big := bytes.Repeat([]byte(" "), recipefile.MaxFileBytes+1)
	if _, err := recipefile.Parse(big); !errors.Is(err, recipefile.ErrTooLarge) {
		t.Fatalf("got %v, want ErrTooLarge", err)
	}
}

func TestParseRejectsUnknownVersionsBeforeAnyOtherError(t *testing.T) {
	cases := map[string]any{"2": float64(2), "0": float64(0), `"1"`: "1", "1.5": 1.5}
	for text, v := range cases {
		data := mutate(t, func(root map[string]any) {
			root["version"] = v
			delete(root, "recipes") // also invalid: the version must still win
		})
		_, err := recipefile.Parse(data)
		var ve *recipefile.VersionError
		if !errors.Is(err, recipefile.ErrUnsupportedVersion) || !errors.As(err, &ve) || ve.Version != text {
			t.Errorf("version %s: got %v, want VersionError{%s}", text, err, text)
		}
	}
}

func TestParseListsSchemaErrorsWithJSONPaths(t *testing.T) {
	tests := []struct {
		name     string
		mutate   func(root map[string]any)
		path     string
		contains string
	}{
		{"missing yield", func(r map[string]any) { delete(recipeAt(r, 0), "yield") }, "$.recipes[0]", "yield"},
		{"negative quantity", func(r map[string]any) {
			recipeAt(r, 0)["ingredients"].([]any)[1].(map[string]any)["quantity"] = -3
		}, "$.recipes[0].ingredients[1].quantity", ""},
		{"zero quantity in a step use", func(r map[string]any) {
			recipeAt(r, 0)["steps"].([]any)[0].(map[string]any)["uses"].([]any)[2].(map[string]any)["quantity"] = 0
		}, "$.recipes[0].steps[0].uses[2].quantity", ""},
		{"passive step without duration", func(r map[string]any) { delete(recipeAt(r, 0)["steps"].([]any)[3].(map[string]any), "durationMinutes") }, "$.recipes[0].steps[3]", "durationMinutes"},
		{"advance step without lead time", func(r map[string]any) { delete(recipeAt(r, 0)["steps"].([]any)[0].(map[string]any), "leadTimeMinutes") }, "$.recipes[0].steps[0]", "leadTimeMinutes"},
		{"unknown property", func(r map[string]any) { recipeAt(r, 0)["servings"] = 4 }, "$.recipes[0]", "servings"},
		{"bad base unit", func(r map[string]any) { r["ingredients"].([]any)[0].(map[string]any)["baseUnit"] = "kg" }, "$.ingredients[0].baseUnit", ""},
		{"empty recipes", func(r map[string]any) { r["recipes"] = []any{} }, "$.recipes", ""},
		{"wrong format", func(r map[string]any) { r["format"] = "something-else" }, "$.format", ""},
		{"ready meal with two lines", func(r map[string]any) {
			l := recipeAt(r, 1)["ingredients"].([]any)
			recipeAt(r, 1)["ingredients"] = append(l, l[0])
		}, "$.recipes[1].ingredients", ""},
		{"step kind", func(r map[string]any) { recipeAt(r, 0)["steps"].([]any)[1].(map[string]any)["kind"] = "boil" }, "$.recipes[0].steps[1].kind", ""},
		{"http image", func(r map[string]any) { recipeAt(r, 0)["image"] = "http://example.com/a.jpg" }, "$.recipes[0].image", ""},
		{"duplicate tag", func(r map[string]any) { recipeAt(r, 0)["tags"] = []any{"a", "a"} }, "$.recipes[0].tags", ""},
		{"name too long", func(r map[string]any) { recipeAt(r, 0)["name"] = strings.Repeat("x", 121) }, "$.recipes[0].name", ""},
		{"negative cool-down", func(r map[string]any) { recipeAt(r, 0)["cooldownDays"] = -1 }, "$.recipes[0].cooldownDays", ""},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := recipefile.Parse(mutate(t, tc.mutate))
			var se *recipefile.SchemaError
			if !errors.Is(err, recipefile.ErrSchema) || !errors.As(err, &se) {
				t.Fatalf("got %v, want a SchemaError", err)
			}
			if !hasPath(se.Errors, tc.path, tc.contains) {
				t.Fatalf("no error at %s containing %q in %+v", tc.path, tc.contains, se.Errors)
			}
		})
	}
}

func TestParseReportsAllErrorsOrderedByPath(t *testing.T) {
	data := mutate(t, func(r map[string]any) {
		recipeAt(r, 0)["yield"] = 0
		recipeAt(r, 0)["ingredients"].([]any)[0].(map[string]any)["quantity"] = -1
		recipeAt(r, 1)["name"] = ""
	})
	_, err := recipefile.Parse(data)
	var se *recipefile.SchemaError
	if !errors.As(err, &se) {
		t.Fatalf("got %v", err)
	}
	var paths []string
	for _, e := range se.Errors {
		paths = append(paths, e.Path)
	}
	want := []string{"$.recipes[0].ingredients[0].quantity", "$.recipes[0].yield", "$.recipes[1].name"}
	if len(paths) < 3 {
		t.Fatalf("paths = %v, want at least %v", paths, want)
	}
	idx := -1
	for _, w := range want {
		i := indexOf(paths, w)
		if i <= idx {
			t.Fatalf("paths = %v: %s missing or out of order", paths, w)
		}
		idx = i
	}
}

func indexOf(s []string, v string) int {
	for i, x := range s {
		if x == v {
			return i
		}
	}
	return -1
}
