package store_test

import (
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/product/store"
)

// PPX: a missing Picture is a typed error (product.ErrPictureMissing), and FillImage gives a Product a Picture only when it has none
// (docs/dev/design/ppx-product-picture-sync.md).

func TestAPictureThatWasNeverUploadedIsATypedMissingError(t *testing.T) {
	f := newFx(t)
	s := f.withImages(newImages(picA))
	p := f.pictured(t, s, "Passata", picA)

	_, createErr := s.CreateProduct(ctx, store.NewProduct{Input: product.Input{Name: "Other", IngredientID: f.tomato, PackSize: 700, Image: ghost}})
	_, setErr := s.SetImage(ctx, p.ID, ghost)
	for name, err := range map[string]error{"CreateProduct": createErr, "SetImage": setErr} {
		var ve *product.ValidationError
		if !errors.As(err, &ve) || ve.Field != "image" {
			t.Errorf("%s: err = %v, want a ValidationError on field image", name, err)
		}
		if !errors.Is(err, product.ErrPictureMissing) {
			t.Errorf("%s: errors.Is(err, ErrPictureMissing) = false for %v", name, err)
		}
		if !errors.Is(err, product.ErrInvalid) {
			t.Errorf("%s: it must stay a ValidationError (HTTP 400 invalid_product): %v", name, err)
		}
	}
}

func TestAMalformedPictureIdIsInvalidButNotMissing(t *testing.T) {
	err := product.Input{Name: "Passata", IngredientID: 1, PackSize: 700, Image: "jar.png"}.Validate()
	if !errors.Is(err, product.ErrInvalid) || errors.Is(err, product.ErrPictureMissing) {
		t.Errorf("Validate = %v; want invalid, not ErrPictureMissing (a malformed id is not retried without the picture)", err)
	}
}

func TestFillImageGivesAProductWithoutAPictureTheOne(t *testing.T) {
	f := newFx(t)
	im := newImages(picA)
	s := f.withImages(im)
	p := f.pictured(t, s, "Passata", "")
	filled, err := s.FillImage(ctx, p.ID, picA)
	if err != nil || !filled {
		t.Fatalf("FillImage = %v, %v; want true", filled, err)
	}
	if back, _ := s.Product(ctx, p.ID); back.Image != picA || back.ImageURL != "/api/images/"+picA {
		t.Errorf("Product = %+v", back)
	}
	if len(im.deleted) != 0 {
		t.Errorf("deleted %v; a fill never deletes a file", im.deleted)
	}
}

func TestFillImageKeepsTheExistingPictureAndDeletesNothing(t *testing.T) {
	f := newFx(t)
	im := newImages(picA, picB)
	s := f.withImages(im)
	p := f.pictured(t, s, "Passata", picA)
	filled, err := s.FillImage(ctx, p.ID, picB)
	if err != nil || filled {
		t.Fatalf("FillImage = %v, %v; want false, nil", filled, err)
	}
	if back, _ := s.Product(ctx, p.ID); back.Image != picA {
		t.Errorf("Product picture = %q; the existing one stays", back.Image)
	}
	if len(im.deleted) != 0 || !im.have[picB] {
		t.Errorf("deleted %v; the unused file is left for the nightly clean-up", im.deleted)
	}
}

func TestFillImageTwiceTheFirstWins(t *testing.T) {
	f := newFx(t)
	s := f.withImages(newImages(picA, picB))
	p := f.pictured(t, s, "Passata", "")
	first, err1 := s.FillImage(ctx, p.ID, picA)
	second, err2 := s.FillImage(ctx, p.ID, picB)
	if err1 != nil || err2 != nil || !first || second {
		t.Fatalf("fills = %v %v, errors %v %v; want true then false", first, second, err1, err2)
	}
	if back, _ := s.Product(ctx, p.ID); back.Image != picA {
		t.Errorf("picture = %q, want %q", back.Image, picA)
	}
}

func TestFillImageRefusesAMissingFileWithTheTypedErrorAndWritesNothing(t *testing.T) {
	f := newFx(t)
	s := f.withImages(newImages())
	p := f.pictured(t, s, "Passata", "")
	filled, err := s.FillImage(ctx, p.ID, ghost)
	if filled || !errors.Is(err, product.ErrPictureMissing) {
		t.Fatalf("FillImage = %v, %v; want false and ErrPictureMissing", filled, err)
	}
	if back, _ := s.Product(ctx, p.ID); back.Image != "" {
		t.Errorf("picture = %q, want none", back.Image)
	}
}

func TestFillImageOnAnUnknownProductIsNotFound(t *testing.T) {
	f := newFx(t)
	if _, err := f.withImages(newImages(picA)).FillImage(ctx, 999, picA); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestFillImageWithNoPictureDoesNothing(t *testing.T) {
	f := newFx(t)
	s := f.withImages(newImages())
	p := f.pictured(t, s, "Passata", "")
	if filled, err := s.FillImage(ctx, p.ID, ""); filled || err != nil {
		t.Errorf("FillImage(\"\") = %v, %v; want false, nil", filled, err)
	}
}
