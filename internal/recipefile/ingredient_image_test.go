package recipefile_test

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// IM2: an Ingredient definition in a Recipe File may carry an optional `image` (data URL or https URL, like a Recipe's).
// Files without it stay valid and import exactly as before.

func ingredientAt(root map[string]any, i int) map[string]any {
	return root["ingredients"].([]any)[i].(map[string]any)
}

func TestSchemaAcceptsAnOptionalIngredientImageAndOldFilesStayValid(t *testing.T) {
	if _, err := recipefile.Parse(mutate(t, func(r map[string]any) {})); err != nil {
		t.Fatalf("the example without pictures must stay valid: %v", err)
	}
	data := mutate(t, func(r map[string]any) { ingredientAt(r, 4)["image"] = pngDataURL(t, 8, 6) }) // onion
	f, err := recipefile.Parse(data)
	if err != nil {
		t.Fatalf("an Ingredient with an image: %v", err)
	}
	if f.Ingredients[4].Name != "onion" || !strings.HasPrefix(f.Ingredients[4].Image, "data:image/png;base64,") {
		t.Errorf("parsed Ingredient = %+v; the image must be kept", f.Ingredients[4])
	}
}

func TestSchemaRefusesABadIngredientImage(t *testing.T) {
	for _, bad := range []string{"not a url", "http://img.example.com/a.png", "data:text/html;base64,AAAA"} {
		if _, err := recipefile.Parse(mutate(t, func(r map[string]any) { ingredientAt(r, 0)["image"] = bad })); err == nil {
			t.Errorf("image %q must be refused like a Recipe image", bad)
		}
	}
}

func TestResolveImagesResolvesIngredientImagesByPath(t *testing.T) {
	ff := &fakeFetcher{byURL: map[string][]byte{"https://img.example.com/lemon.png": pngBytes(t, 9, 5)}}
	f := exampleFile(t)
	f.Ingredients[4].Image = pngDataURL(t, 20, 10)                     // onion: a data URL
	f.Ingredients[3].Image = "https://img.example.com/lemon.png"       // lemon: downloaded
	f.Ingredients[5].Image = "https://img.example.com/never-there.png" // red pepper: fails, only a warning
	set := recipefile.ResolveImages(context.Background(), f, ff)
	if r, ok := set.Images["$.ingredients[4].image"]; !ok || r.Width != 20 || r.Height != 10 {
		t.Errorf("onion = %+v, %v", r, ok)
	}
	if r, ok := set.Images["$.ingredients[3].image"]; !ok || r.Width != 9 {
		t.Errorf("lemon = %+v, %v", r, ok)
	}
	if _, ok := set.Images["$.ingredients[5].image"]; ok {
		t.Error("a failed image must not be in the set")
	}
	var warned bool
	for _, w := range set.Warnings {
		if w.Path == "$.ingredients[5].image" && w.Code == recipefile.WarnImageFailed && w.Message == recipefile.ImageFailedMessage {
			warned = true
		}
	}
	if !warned {
		t.Errorf("warnings = %+v, want image_failed at $.ingredients[5].image", set.Warnings)
	}
}

func TestNewIngredientsCarryTheirImagePathAndExistingOnesAreLeftAlone(t *testing.T) {
	f := exampleFile(t)
	f.Ingredients[4].Image = pngDataURL(t, 8, 6) // onion
	f.Ingredients[3].Image = pngDataURL(t, 8, 6) // lemon
	set := recipefile.ResolveImages(context.Background(), f, &fakeFetcher{})
	existing := recipefile.Existing{Ingredients: []ingredient.Ingredient{{ID: 5, Name: "lemon", Base: units.Piece}}}
	d := recipefile.Decisions{}
	c, err := recipefile.BuildCommit(f, existing, d, set)
	if err != nil {
		t.Fatal(err)
	}
	var onion, lemon *recipefile.NewIngredient
	for i := range c.NewIngredients {
		switch c.NewIngredients[i].Key {
		case "onion":
			onion = &c.NewIngredients[i]
		case "lemon":
			lemon = &c.NewIngredients[i]
		}
	}
	if onion == nil || onion.ImagePath != "$.ingredients[4].image" {
		t.Fatalf("onion = %+v; a NEW Ingredient carries the path of its picture", onion)
	}
	if onion.Input.Image != "" {
		t.Errorf("Input.Image = %q; the store fills it after saving the image", onion.Input.Image)
	}
	if _, ok := c.Images["$.ingredients[4].image"]; !ok {
		t.Error("Commit.Images must hold the onion picture")
	}
	if lemon != nil {
		t.Error("lemon already exists, so it is not created")
	}
	if _, ok := c.Images["$.ingredients[3].image"]; ok {
		t.Error("the picture of an EXISTING Ingredient is dropped: an import never changes what the household already has")
	}
}

func TestAnIngredientNoRecipeUsesIsNotCreatedAndItsImageIsNotKept(t *testing.T) {
	f := exampleFile(t)
	f.Ingredients = append(f.Ingredients, recipefile.Ingredient{Name: "saffron", BaseUnit: "g", Image: pngDataURL(t, 8, 6)})
	set := recipefile.ResolveImages(context.Background(), f, &fakeFetcher{})
	c, err := recipefile.BuildCommit(f, recipefile.Existing{}, recipefile.Decisions{}, set)
	if err != nil {
		t.Fatal(err)
	}
	for p := range c.Images {
		if strings.HasPrefix(p, "$.ingredients[9]") {
			t.Errorf("image %s of an unused Ingredient must not be saved", p)
		}
	}
}

// Export.

func TestBuildEmbedsIngredientPicturesAndOmitsMissingOnes(t *testing.T) {
	in := exportFixture()
	g := in.Ingredients[2]
	g.Image = "fedcba9876543210fedcba9876543210"
	in.Ingredients[2] = g // garlic has a picture, chicken thighs has none
	var asked []string
	in.Image = func(id string) (string, error) {
		asked = append(asked, id)
		return "data:image/webp;base64,UklGRg==", nil
	}
	f, warns := recipefile.Build(in)
	if len(warns) != 0 {
		t.Fatalf("warnings: %+v", warns)
	}
	byName := map[string]recipefile.Ingredient{}
	for _, i := range f.Ingredients {
		byName[i.Name] = i
	}
	if byName["garlic"].Image != "data:image/webp;base64,UklGRg==" {
		t.Errorf("garlic image = %q, want the embedded data URL", byName["garlic"].Image)
	}
	if byName["Chicken Thighs"].Image != "" {
		t.Errorf("an Ingredient without a picture exports none: %q", byName["Chicken Thighs"].Image)
	}
	var sawGarlic bool
	for _, id := range asked {
		sawGarlic = sawGarlic || id == "fedcba9876543210fedcba9876543210"
	}
	if !sawGarlic {
		t.Errorf("Image() was asked for %v; it must be asked for the Ingredient picture too", asked)
	}
}

func TestBuildWarnsAndLeavesOutAnIngredientPictureThatCannotBeRead(t *testing.T) {
	in := exportFixture()
	g := in.Ingredients[2]
	g.Image = "fedcba9876543210fedcba9876543210"
	in.Ingredients[2] = g
	in.Image = func(id string) (string, error) {
		if id == g.Image {
			return "", context.DeadlineExceeded
		}
		return "data:image/webp;base64,UklGRg==", nil
	}
	f, warns := recipefile.Build(in)
	var at string
	for _, w := range warns {
		if w.Code == recipefile.WarnImageFailed && strings.HasPrefix(w.Path, "$.ingredients[") {
			at = w.Path
		}
	}
	if at == "" {
		t.Fatalf("warnings = %+v, want image_failed at the Ingredient's path", warns)
	}
	for _, i := range f.Ingredients {
		if i.Name == "garlic" && i.Image != "" {
			t.Error("a failed picture is left out")
		}
	}
}

func TestAnExportedFileWithIngredientPicturesPassesTheSchema(t *testing.T) {
	in := exportFixture()
	g := in.Ingredients[2]
	g.Image = "fedcba9876543210fedcba9876543210"
	in.Ingredients[2] = g
	in.Image = func(string) (string, error) { return "data:image/webp;base64,UklGRg==", nil }
	f, _ := recipefile.Build(in)
	data, err := json.Marshal(f)
	if err != nil {
		t.Fatal(err)
	}
	back, err := recipefile.Parse(data)
	if err != nil {
		t.Fatalf("the exported file must be a valid Recipe File: %v", err)
	}
	var found bool
	for _, i := range back.Ingredients {
		found = found || (i.Name == "garlic" && i.Image != "")
	}
	if !found {
		t.Error("the picture must survive Marshal then Parse")
	}
}
