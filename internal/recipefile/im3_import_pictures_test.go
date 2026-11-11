package recipefile_test

import (
	"context"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// IM3: an EXISTING Ingredient with NO picture adopts the picture of the file's definition on import.
// An existing picture is never replaced. Import Review flags the row ("Adds a picture to Garlic").
// Example file: ingredients[3] = lemon (piece), [4] = onion (piece).

const (
	lemonPath = "$.ingredients[3].image"
	onionPath = "$.ingredients[4].image"
	someImage = "0123456789abcdef0123456789abcdef"
)

func existingLemon(image string) recipefile.Existing {
	return recipefile.Existing{Ingredients: []ingredient.Ingredient{{ID: 5, Name: "lemon", Base: units.Piece, Image: image}}}
}

func fileWithPictures(t *testing.T, paths ...int) (recipefile.File, recipefile.ImageSet) {
	t.Helper()
	f := exampleFile(t)
	for _, i := range paths {
		f.Ingredients[i].Image = pngDataURL(t, 8, 6)
	}
	return f, recipefile.ResolveImages(context.Background(), f, &fakeFetcher{})
}

func TestReviewFlagsAnExistingIngredientWithoutAPictureThatTheFilePicturesAndNoOtherRow(t *testing.T) {
	f, set := fileWithPictures(t, 3, 4) // lemon exists without a picture; onion is new
	p := recipefile.BuildPlan(f, existingLemon(""), recipefile.Decisions{}, set)
	if m := matchOf(t, p, "lemon"); !m.AddsImage {
		t.Errorf("lemon = %+v; an existing Ingredient with no picture gets the file's one, so the row says so", m)
	}
	if m := matchOf(t, p, "onion"); m.AddsImage {
		t.Error("onion is created WITH its picture; adds-a-picture is only for Ingredients the household already has")
	}
	if m := matchOf(t, p, "garam masala"); m.AddsImage {
		t.Error("a row whose definition has no picture adds none")
	}
}

func TestReviewDoesNotFlagWhenTheExistingIngredientHasAPicture(t *testing.T) {
	f, set := fileWithPictures(t, 3)
	p := recipefile.BuildPlan(f, existingLemon(someImage), recipefile.Decisions{}, set)
	if matchOf(t, p, "lemon").AddsImage {
		t.Error("an existing picture is never replaced, so nothing is added")
	}
}

func TestReviewDoesNotFlagWhenTheFilePictureCouldNotBeFetched(t *testing.T) {
	f := exampleFile(t)
	f.Ingredients[3].Image = "https://img.example.com/gone.png"
	set := recipefile.ResolveImages(context.Background(), f, &fakeFetcher{})
	p := recipefile.BuildPlan(f, existingLemon(""), recipefile.Decisions{}, set)
	if matchOf(t, p, "lemon").AddsImage {
		t.Error("no picture resolved, so none is added (the image_failed warning says why)")
	}
	if len(set.Warnings) != 1 {
		t.Errorf("warnings = %+v", set.Warnings)
	}
}

func TestReviewFlagsTheIngredientTheUserChoseNotTheOneWithTheSameName(t *testing.T) {
	f, set := fileWithPictures(t, 4) // the file's onion
	ex := recipefile.Existing{Ingredients: []ingredient.Ingredient{
		{ID: 7, Name: "yellow onion", Base: units.Piece},
		{ID: 8, Name: "red onion", Base: units.Piece, Image: someImage},
	}}
	use := func(id int64) recipefile.Decisions {
		return recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "onion", Action: recipefile.ActionUse, IngredientID: id}}}
	}
	if m := matchOf(t, recipefile.BuildPlan(f, ex, use(7), set), "onion"); !m.AddsImage {
		t.Error("the file's onion is used as 'yellow onion' (no picture): it adopts the file's picture")
	}
	if m := matchOf(t, recipefile.BuildPlan(f, ex, use(8), set), "onion"); m.AddsImage {
		t.Error("used as 'red onion' (has a picture): nothing is added")
	}
	create := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{{Key: "onion", Action: recipefile.ActionCreate}}}
	if m := matchOf(t, recipefile.BuildPlan(f, ex, create, set), "onion"); m.AddsImage {
		t.Error("creating a new Ingredient adds no picture to an existing one")
	}
}

func TestCommitAdoptsThePictureForAnExistingIngredientWithoutOne(t *testing.T) {
	f, set := fileWithPictures(t, 3, 4)
	c, err := recipefile.BuildCommit(f, existingLemon(""), recipefile.Decisions{}, set)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.AddedImages) != 1 || c.AddedImages[0] != (recipefile.AddedImage{IngredientID: 5, ImagePath: lemonPath}) {
		t.Fatalf("AddedImages = %+v, want lemon (id 5) with %s", c.AddedImages, lemonPath)
	}
	if _, ok := c.Images[lemonPath]; !ok {
		t.Error("Commit.Images must hold the picture the existing Ingredient adopts")
	}
	for _, n := range c.NewIngredients {
		if n.Key == "lemon" {
			t.Error("lemon exists and is not created")
		}
	}
	// the new onion still takes its picture the IM2 way
	if _, ok := c.Images[onionPath]; !ok {
		t.Error("the new onion's picture must still be in Commit.Images")
	}
}

func TestCommitNeverReplacesAnExistingPicture(t *testing.T) {
	f, set := fileWithPictures(t, 3)
	c, err := recipefile.BuildCommit(f, existingLemon(someImage), recipefile.Decisions{}, set)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.AddedImages) != 0 {
		t.Errorf("AddedImages = %+v", c.AddedImages)
	}
	if _, ok := c.Images[lemonPath]; ok {
		t.Error("the file's picture is not kept: it would only be an orphan file")
	}
}

func TestOnlyOneFileDefinitionGivesAnExistingIngredientItsPicture(t *testing.T) {
	// "lemon" and "onion" of the file are both answered "use the existing Ingredient 5": it takes one picture, not two.
	f, set := fileWithPictures(t, 3, 4)
	ex := existingLemon("")
	d := recipefile.Decisions{Ingredients: []recipefile.IngredientDecision{
		{Key: "onion", Action: recipefile.ActionUse, IngredientID: 5},
	}}
	c, err := recipefile.BuildCommit(f, ex, d, set)
	if err != nil {
		t.Fatal(err)
	}
	var n int
	for _, a := range c.AddedImages {
		if a.IngredientID == 5 {
			n++
		}
	}
	if n != 1 {
		t.Errorf("Ingredient 5 got %d AddedImages, want exactly 1 (the first definition in the file wins)", n)
	}
	if len(c.AddedImages) == 1 && c.AddedImages[0].ImagePath != lemonPath {
		t.Errorf("path = %s, want %s (file order)", c.AddedImages[0].ImagePath, lemonPath)
	}
}

func TestAnExistingIngredientNoKeptRecipeUsesGainsNothing(t *testing.T) {
	f, set := fileWithPictures(t, 3)
	d := recipefile.Decisions{Recipes: []recipefile.RecipeDecision{{Index: 0, Action: recipefile.ActionSkip}, {Index: 1, Action: recipefile.ActionSkip}}}
	c, err := recipefile.BuildCommit(f, existingLemon(""), d, set)
	if err != nil {
		t.Fatal(err)
	}
	if len(c.AddedImages) != 0 || len(c.Images) != 0 {
		t.Errorf("skipped Recipes use nothing, so nothing is added: %+v %d", c.AddedImages, len(c.Images))
	}
}

// ResolveImages sees no Existing (the User has not chosen which Ingredient a name stands for yet), so it still resolves
// every definition's picture: it must not throw away the picture of a name that matches an existing Ingredient without one.
func TestResolveImagesKeepsThePictureOfADefinitionThatMatchesAnExistingIngredient(t *testing.T) {
	f, set := fileWithPictures(t, 3)
	if _, ok := set.Images[lemonPath]; !ok {
		t.Errorf("images = %v; the lemon picture must be resolved so a lemon without a picture can adopt it", set.Images)
	}
	_ = f
}

// The budget still holds, and Recipe and Step photos are resolved first, so Ingredient pictures can never starve them.
func TestIngredientPicturesDoNotStarveRecipePhotosWithinTheFetchBudget(t *testing.T) {
	const url = "https://img.example.com/p.png"
	f := exampleFile(t)
	f.Recipes[0].Image = url
	for i := range f.Recipes[0].Steps {
		f.Recipes[0].Steps[i].Image = url
	}
	for i := range f.Ingredients {
		f.Ingredients[i].Image = url
	}
	for len(f.Ingredients) < recipefile.MaxImagesFetched+5 {
		f.Ingredients = append(f.Ingredients, recipefile.Ingredient{Name: "x" + string(rune('a'+len(f.Ingredients))), BaseUnit: "g", Image: url})
	}
	ff := &fakeFetcher{byURL: map[string][]byte{url: pngBytes(t, 3, 3)}}
	set := recipefile.ResolveImages(context.Background(), f, ff)
	if len(ff.calls) != recipefile.MaxImagesFetched {
		t.Fatalf("%d downloads, want exactly %d", len(ff.calls), recipefile.MaxImagesFetched)
	}
	if _, ok := set.Images["$.recipes[0].image"]; !ok {
		t.Error("the Recipe photo must win over Ingredient pictures")
	}
	if len(set.Images) != recipefile.MaxImagesFetched || len(set.Warnings) != len(f.Ingredients)+1+len(f.Recipes[0].Steps)-recipefile.MaxImagesFetched {
		t.Errorf("images=%d warnings=%d", len(set.Images), len(set.Warnings))
	}
}
