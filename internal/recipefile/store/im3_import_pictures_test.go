package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/docs/spec"
	"github.com/fabbarix/feeder-ng/internal/imaging"
	"github.com/fabbarix/feeder-ng/internal/recipefile"
	"github.com/fabbarix/feeder-ng/internal/recipefile/store"
)

// IM3: an existing Ingredient with no picture adopts the file's picture, written with
// UPDATE ingredients SET image=? WHERE id=? AND image='' so a picture set in the meantime wins. A no-op update removes the saved
// file again, through images.Guarded (never a file some record uses).

const onionImg = "$.ingredients[4].image"

func onionImage(t *testing.T, f *fixture) string {
	t.Helper()
	var id string
	if err := f.db.QueryRow(`SELECT image FROM ingredients WHERE name_key = 'onion'`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	return id
}

// secondImport reviews the example again over what exists, with a picture for the onion definition, replacing both Recipes.
func secondImport(t *testing.T, f *fixture, ex recipefile.Existing) recipefile.Commit {
	t.Helper()
	file, err := recipefile.Parse(spec.Example)
	if err != nil {
		t.Fatal(err)
	}
	imgs := recipefile.ImageSet{Images: map[string]imaging.Result{onionImg: {WebP: webpOf(t, 8, 6), Width: 8, Height: 6}}}
	c, err := recipefile.BuildCommit(file, ex, replaceBoth(), imgs)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

// planned makes sure the Commit adopts the onion picture the way BuildCommit does (AddedImage + Commit.Images), whatever BuildCommit does today.
func planned(t *testing.T, f *fixture, c recipefile.Commit) recipefile.Commit {
	t.Helper()
	var id int64
	if err := f.db.QueryRow(`SELECT id FROM ingredients WHERE name_key = 'onion'`).Scan(&id); err != nil {
		t.Fatal(err)
	}
	c.AddedImages = []recipefile.AddedImage{{IngredientID: id, ImagePath: onionImg}}
	if c.Images == nil {
		c.Images = map[string]imaging.Result{}
	}
	c.Images[onionImg] = imaging.Result{WebP: webpOf(t, 8, 6), Width: 8, Height: 6}
	return c
}

func TestApplyGivesAnExistingIngredientWithoutAPictureTheFilesPicture(t *testing.T) {
	f := newFixture(t)
	_, ex := f.firstApply(t)
	c := secondImport(t, f, ex)
	if len(c.AddedImages) != 1 {
		t.Fatalf("AddedImages = %+v; the review must have planned the onion picture", c.AddedImages)
	}
	res, err := f.s.Apply(ctx, c)
	if err != nil {
		t.Fatal(err)
	}
	if res.PicturesAdded != 1 || res.IngredientsCreated != 0 {
		t.Fatalf("result = %+v", res)
	}
	if id := onionImage(t, f); id == "" {
		t.Error("onion.image is empty; it must hold the adopted picture")
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

func TestApplyKeepsAPictureSetAfterTheReviewAndRemovesTheOrphanFile(t *testing.T) {
	f := newFixture(t)
	_, ex := f.firstApply(t) // the review sees onion without a picture
	c := secondImport(t, f, ex)
	c = planned(t, f, c) // what the review plans for the onion, written out so these tests only exercise Apply
	// ...then somebody gives the onion a picture before the import is confirmed.
	winner, err := imaging.NewStore(f.images).Save(webpOf(t, 9, 9))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.Exec(`UPDATE ingredients SET image=? WHERE name_key='onion'`, winner); err != nil {
		t.Fatal(err)
	}
	res, err := f.s.Apply(ctx, c)
	if err != nil {
		t.Fatalf("a picture that arrived meanwhile is not an error: %v", err)
	}
	if res.PicturesAdded != 0 {
		t.Errorf("PicturesAdded = %d; the picture that was already there won", res.PicturesAdded)
	}
	if got := onionImage(t, f); got != winner {
		t.Errorf("onion.image = %q, want the picture set meanwhile (%q)", got, winner)
	}
	if f.imageFiles(t) != 1 {
		t.Errorf("image files = %d, want 1 (the winner); the file saved for the import must be removed", f.imageFiles(t))
	}
	if !imaging.NewStore(f.images).Exists(winner) {
		t.Error("the winner's file must never be deleted")
	}
}

func TestApplyNeverReplacesAnExistingPicture(t *testing.T) {
	f := newFixture(t)
	_, _ = f.firstApply(t)
	old, err := imaging.NewStore(f.images).Save(webpOf(t, 7, 7))
	if err != nil {
		t.Fatal(err)
	}
	f.db.Exec(`UPDATE ingredients SET image=? WHERE name_key='onion'`, old)
	ex, err := f.s.Existing(ctx) // now the review knows the onion has a picture
	if err != nil {
		t.Fatal(err)
	}
	c := secondImport(t, f, ex)
	if len(c.AddedImages) != 0 {
		t.Fatalf("AddedImages = %+v; an existing picture is never replaced", c.AddedImages)
	}
	if _, err := f.s.Apply(ctx, c); err != nil {
		t.Fatal(err)
	}
	if got := onionImage(t, f); got != old {
		t.Errorf("onion.image = %q, want it unchanged (%q)", got, old)
	}
	if f.imageFiles(t) != 1 {
		t.Errorf("image files = %d, want only the existing picture", f.imageFiles(t))
	}
}

func TestApplyRollsBackAnAdoptedPictureWhenTheImportFails(t *testing.T) {
	f := newFixture(t)
	_, ex := f.firstApply(t)
	c := secondImport(t, f, ex)
	c = planned(t, f, c)          // what the review plans for the onion, written out so these tests only exercise Apply
	c.Recipes[1].ReplaceID = 4242 // stale: Apply rolls back
	if _, err := f.s.Apply(ctx, c); !errors.Is(err, store.ErrStale) {
		t.Fatalf("got %v, want ErrStale", err)
	}
	if id := onionImage(t, f); id != "" {
		t.Errorf("onion.image = %q; a failed import changes nothing", id)
	}
	if f.imageFiles(t) != 0 {
		t.Errorf("image files = %d; a failed import must not leave the picture behind", f.imageFiles(t))
	}
}
