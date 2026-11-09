package recipefile_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/png"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// exampleFile parses the published example (the spec's own fixture).
func exampleFile(t *testing.T) recipefile.File {
	t.Helper()
	f, err := recipefile.Parse(spec.Example)
	if err != nil {
		t.Fatalf("the spec example must parse: %v", err)
	}
	return f
}

// mutate applies f to the example as generic JSON and returns the bytes.
func mutate(t *testing.T, f func(root map[string]any)) []byte {
	t.Helper()
	var root map[string]any
	if err := json.Unmarshal(spec.Example, &root); err != nil {
		t.Fatal(err)
	}
	f(root)
	out, err := json.Marshal(root)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func recipeAt(root map[string]any, i int) map[string]any {
	return root["recipes"].([]any)[i].(map[string]any)
}

// pngDataURL is a valid w x h PNG as a data URL.
func pngDataURL(t *testing.T, w, h int) string {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for x := 0; x < w; x++ {
		for y := 0; y < h; y++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 40), G: uint8(y * 40), B: 90, A: 255})
		}
	}
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
}

// ing builds an existing Ingredient.
func ing(id int64, name, base string, conv ...units.Conversion) ingredient.Ingredient {
	return ingredient.Ingredient{ID: id, Name: name, Base: units.Base(base), Conversions: conv}
}

func hasPath(errs []recipefile.PathError, path, contains string) bool {
	for _, e := range errs {
		if e.Path == path && (contains == "" || bytes.Contains([]byte(e.Message), []byte(contains))) {
			return true
		}
	}
	return false
}

// ingredientT is the stored Ingredient type, short for table literals.
type ingredientT = ingredient.Ingredient

func mustParse(t *testing.T, data []byte) recipefile.File {
	t.Helper()
	f, err := recipefile.Parse(data)
	if err != nil {
		t.Fatalf("test fixture must be schema-valid: %v", err)
	}
	return f
}
