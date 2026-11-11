package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/recipefile/store"
)

// IM2: Ingredient pictures in a Recipe File, both ways.

func TestApplySavesThePictureOfANewIngredientAndLinksIt(t *testing.T) {
	f := newFixture(t)
	imgs := recipefile.ImageSet{Images: map[string]imaging.Result{"$.ingredients[4].image": {WebP: webpOf(t, 8, 6), Width: 8, Height: 6}}} // onion
	res, err := f.s.Apply(ctx, exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, imgs))
	if err != nil {
		t.Fatal(err)
	}
	if res.IngredientsCreated != 9 {
		t.Fatalf("result = %+v", res)
	}
	var id string
	if err := f.db.QueryRow(`SELECT image FROM ingredients WHERE name_key = 'onion'`).Scan(&id); err != nil || id == "" {
		t.Fatalf("onion.image = %q, %v; want the saved picture's id", id, err)
	}
	if f.imageFiles(t) != 1 {
		t.Errorf("image files = %d, want 1", f.imageFiles(t))
	}
	var others int
	f.db.QueryRow(`SELECT count(*) FROM ingredients WHERE name_key <> 'onion' AND image <> ''`).Scan(&others)
	if others != 0 {
		t.Errorf("%d other Ingredients got a picture", others)
	}
}

func TestApplyRemovesTheSavedPictureWhenTheImportFails(t *testing.T) {
	f := newFixture(t)
	imgs := recipefile.ImageSet{Images: map[string]imaging.Result{"$.ingredients[4].image": {WebP: webpOf(t, 8, 6), Width: 8, Height: 6}}}
	c := exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, imgs)
	c.Recipes[1].Action = recipefile.ActionReplace // a Recipe that no longer exists: stale, so Apply rolls back
	c.Recipes[1].ReplaceID = 4242
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	if f.imageFiles(t) != 0 {
		t.Errorf("image files = %d; a failed import must not leave pictures behind", f.imageFiles(t))
	}
}

func TestExportableCarriesIngredientPictures(t *testing.T) {
	f := newFixture(t)
	imgs := recipefile.ImageSet{Images: map[string]imaging.Result{"$.ingredients[4].image": {WebP: webpOf(t, 8, 6), Width: 8, Height: 6}}}
	res, err := f.s.Apply(ctx, exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, imgs))
	if err != nil {
		t.Fatal(err)
	}
	in, err := f.s.Exportable(ctx, []int64{res.Recipes[0].ID})
	if err != nil {
		t.Fatal(err)
	}
	var with int
	for _, ing := range in.Ingredients {
		if ing.Name == "onion" {
			if ing.Image == "" {
				t.Error("onion must carry its picture id into the export")
			}
			with++
		} else if ing.Image != "" {
			t.Errorf("%s has a picture it never had", ing.Name)
		}
	}
	if with != 1 {
		t.Fatalf("onion exported %d times (the first Recipe uses onion)", with)
	}
	file, warns := recipefile.Build(in)
	if len(warns) != 0 {
		t.Fatalf("warnings: %+v", warns)
	}
	var embedded bool
	for _, i := range file.Ingredients {
		embedded = embedded || (i.Name == "onion" && len(i.Image) > len("data:image/webp;base64,"))
	}
	if !embedded {
		t.Error("the exported file must embed the onion picture")
	}
}

func TestRecipeFileRoundTripKeepsIngredientPictures(t *testing.T) {
	src := newFixture(t)
	imgs := recipefile.ImageSet{Images: map[string]imaging.Result{"$.ingredients[4].image": {WebP: webpOf(t, 8, 6), Width: 8, Height: 6}}}
	res, err := src.s.Apply(ctx, exampleCommit(t, recipefile.Existing{}, recipefile.Decisions{}, imgs))
	if err != nil {
		t.Fatal(err)
	}
	in, _ := src.s.Exportable(ctx, []int64{res.Recipes[0].ID, res.Recipes[1].ID})
	file, _ := recipefile.Build(in)

	dst := newFixture(t)
	set := recipefile.ResolveImages(ctx, file, nil)
	c, err := recipefile.BuildCommit(file, recipefile.Existing{}, recipefile.Decisions{}, set)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := dst.s.Apply(ctx, c); err != nil {
		t.Fatal(err)
	}
	var id string
	if err := dst.db.QueryRow(`SELECT image FROM ingredients WHERE name_key = 'onion'`).Scan(&id); err != nil || id == "" {
		t.Errorf("after the round trip onion.image = %q, %v", id, err)
	}
}
