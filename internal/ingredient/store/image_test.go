package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/ingredient/store"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// IM2: the Ingredient picture (column ingredients.image, migration 1310).

const (
	picA  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	picB  = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	ghost = "cccccccccccccccccccccccccccccccc" // never uploaded
)

// fakeImages is the image store: ids in `have` exist; Delete removes them and is recorded.
type fakeImages struct {
	have    map[string]bool
	deleted []string
}

func newImages(ids ...string) *fakeImages {
	f := &fakeImages{have: map[string]bool{}}
	for _, id := range ids {
		f.have[id] = true
	}
	return f
}
func (f *fakeImages) Exists(id string) bool { return f.have[id] }
func (f *fakeImages) Delete(_ context.Context, id string) error {
	delete(f.have, id)
	f.deleted = append(f.deleted, id)
	return nil
}

func withImages(f *fixture, im *fakeImages) *store.Store {
	return store.New(f.db, f.clk, store.WithImages(im))
}

func TestCreateKeepsThePictureAndGetReturnsIt(t *testing.T) {
	f := newFixture(t)
	s := withImages(f, newImages(picA))
	got, err := s.Create(ctx, ingredient.Input{Name: "Flour", Base: units.Gram, Image: picA})
	if err != nil || got.Image != picA {
		t.Fatalf("Create = %+v, %v", got, err)
	}
	back, err := s.Get(ctx, got.ID)
	if err != nil || back.Image != picA {
		t.Errorf("Get = %+v, %v; want the picture", back, err)
	}
	list, _ := s.List(ctx)
	if len(list) != 1 || list[0].Image != picA {
		t.Errorf("List = %+v; the picture must be listed too", list)
	}
}

func TestAnIngredientWithoutAPictureHasNone(t *testing.T) {
	f := newFixture(t)
	got := f.create(t, ingredient.Input{Name: "Salt", Base: units.Gram})
	if got.Image != "" {
		t.Errorf("Image = %q, want none", got.Image)
	}
}

func TestCreateRefusesAPictureThatWasNeverUploaded(t *testing.T) {
	f := newFixture(t)
	_, err := withImages(f, newImages()).Create(ctx, ingredient.Input{Name: "Flour", Base: units.Gram, Image: ghost})
	var ve *ingredient.ValidationError
	if !errors.As(err, &ve) || ve.Field != "image" {
		t.Fatalf("err = %v, want a ValidationError on field image", err)
	}
	if _, err := f.store.ByName(ctx, "Flour"); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("nothing may be created: %v", err)
	}
}

func TestUpdateSetsReplacesAndClearsThePictureAndDropsUnusedFiles(t *testing.T) {
	f := newFixture(t)
	im := newImages(picA, picB)
	s := withImages(f, im)
	ing, _ := s.Create(ctx, ingredient.Input{Name: "Flour", Base: units.Gram})
	set := func(v string) (ingredient.Ingredient, error) { return s.Update(ctx, ing.ID, store.Patch{Image: &v}) }

	if got, err := set(picA); err != nil || got.Image != picA {
		t.Fatalf("set = %+v, %v", got, err)
	}
	if len(im.deleted) != 0 {
		t.Errorf("deleted %v while setting the first picture", im.deleted)
	}
	if got, err := set(picB); err != nil || got.Image != picB {
		t.Fatalf("replace = %+v, %v", got, err)
	}
	if len(im.deleted) != 1 || im.deleted[0] != picA {
		t.Errorf("deleted = %v, want the replaced picture only", im.deleted)
	}
	if got, err := set(""); err != nil || got.Image != "" {
		t.Fatalf("clear = %+v, %v", got, err)
	}
	if len(im.deleted) != 2 || im.deleted[1] != picB {
		t.Errorf("deleted = %v, want the cleared picture too", im.deleted)
	}
}

func TestUpdateWithoutAnImagePatchKeepsThePicture(t *testing.T) {
	f := newFixture(t)
	s := withImages(f, newImages(picA))
	ing, _ := s.Create(ctx, ingredient.Input{Name: "Flour", Base: units.Gram, Image: picA})
	name := "Plain flour"
	got, err := s.Update(ctx, ing.ID, store.Patch{Name: &name})
	if err != nil || got.Image != picA {
		t.Fatalf("rename = %+v, %v; the picture must stay", got, err)
	}
}

func TestUpdateRefusesAPictureThatWasNeverUploaded(t *testing.T) {
	f := newFixture(t)
	s := withImages(f, newImages(picA))
	ing, _ := s.Create(ctx, ingredient.Input{Name: "Flour", Base: units.Gram, Image: picA})
	g := ghost
	_, err := s.Update(ctx, ing.ID, store.Patch{Image: &g})
	var ve *ingredient.ValidationError
	if !errors.As(err, &ve) || ve.Field != "image" {
		t.Fatalf("err = %v, want a ValidationError on field image", err)
	}
	if back, _ := s.Get(ctx, ing.ID); back.Image != picA {
		t.Errorf("the old picture must stay: %q", back.Image)
	}
}

func TestDeletingAnIngredientRemovesItsPictureFile(t *testing.T) {
	f := newFixture(t)
	im := newImages(picA)
	s := withImages(f, im)
	ing, _ := s.Create(ctx, ingredient.Input{Name: "Flour", Base: units.Gram, Image: picA})
	if err := s.Delete(ctx, ing.ID); err != nil {
		t.Fatal(err)
	}
	if im.have[picA] {
		t.Error("the picture file must be deleted with its Ingredient (the nightly sweep is only the safety net)")
	}
}

func TestMergeKeepsATargetPictureAndAdoptsTheSourceOneWhenTargetHasNone(t *testing.T) {
	f := newFixture(t)
	im := newImages(picA, picB)
	s := withImages(f, im)
	withPic, _ := s.Create(ctx, ingredient.Input{Name: "scallion", Base: units.Gram, Image: picA})
	srcPic, _ := s.Create(ctx, ingredient.Input{Name: "spring onion", Base: units.Gram, Image: picB})
	bare, _ := s.Create(ctx, ingredient.Input{Name: "green onion", Base: units.Gram})

	got, err := s.Merge(ctx, srcPic.ID, withPic.ID, ingredient.Resolution{})
	if err != nil || got.Image != picA {
		t.Fatalf("merge into an Ingredient with a picture = %+v, %v; its own picture wins", got, err)
	}
	if im.have[picB] {
		t.Error("the merged-away picture must be deleted")
	}

	im.have[picB] = true // the file was deleted by the first merge; upload it again before Create checks it
	srcPic2, _ := s.Create(ctx, ingredient.Input{Name: "shallot", Base: units.Gram, Image: picB})
	got, err = s.Merge(ctx, srcPic2.ID, bare.ID, ingredient.Resolution{})
	if err != nil || got.Image != picB {
		t.Fatalf("merge into an Ingredient without a picture = %+v, %v; it adopts the source picture", got, err)
	}
	if !im.have[picB] {
		t.Error("an adopted picture must not be deleted")
	}
}
