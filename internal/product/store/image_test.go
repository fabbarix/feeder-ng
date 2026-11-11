package store_test

import (
	"context"
	"errors"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/barcode"
	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/product"
	"github.com/fabbarix/feeder-ng/internal/product/store"
	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// PP: the Product Picture (column products.image, migration 1312).

const (
	picA  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	picB  = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	ghost = "cccccccccccccccccccccccccccccccc" // never uploaded
)

// fakeImages: ids in `have` exist; Delete removes them and is recorded.
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

func (f *fx) withImages(im *fakeImages) *store.Store {
	return store.New(f.db, clock.NewFake(testkit.StartTime), store.WithImages(im))
}

func (f *fx) pictured(t *testing.T, s *store.Store, name, image string, barcodes ...string) store.Detail {
	t.Helper()
	d, err := s.CreateProduct(ctx, store.NewProduct{Input: product.Input{Name: name, IngredientID: f.tomato, PackSize: 700, Image: image}, Barcodes: barcodes})
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func TestCreateKeepsThePictureAndEveryReaderReturnsIt(t *testing.T) {
	f := newFx(t)
	s := f.withImages(newImages(picA))
	d := f.pictured(t, s, "Passata", picA, "8001234567897")
	if d.Image != picA || d.ImageURL != "/api/images/"+picA {
		t.Fatalf("Create = %+v", d.Product)
	}
	if back, err := s.Product(ctx, d.ID); err != nil || back.Image != picA || back.ImageURL != "/api/images/"+picA {
		t.Errorf("Product = %+v, %v", back.Product, err)
	}
	list, _ := s.Products(ctx, store.Filter{})
	if len(list) != 1 || list[0].Image != picA || list[0].ImageURL == "" {
		t.Errorf("Products = %+v; the list must carry the picture for thumbnails", list)
	}
	res, err := s.Resolve(ctx, "8001234567897", barcode.FormatEAN13, nil)
	if err != nil || res.Product == nil || res.Product.ImageURL != "/api/images/"+picA {
		t.Errorf("Resolve = %+v, %v; a scan result needs the picture", res.Product, err)
	}
}

func TestAProductWithoutAPictureHasNoneAndNoURL(t *testing.T) {
	f := newFx(t)
	d := f.prod(t, "Rice", f.rice, 1000)
	if d.Image != "" || d.ImageURL != "" {
		t.Errorf("Product = %+v", d.Product)
	}
}

func TestCreateRefusesAPictureThatWasNeverUploaded(t *testing.T) {
	f := newFx(t)
	_, err := f.withImages(newImages()).CreateProduct(ctx, store.NewProduct{Input: product.Input{Name: "Passata", IngredientID: f.tomato, PackSize: 700, Image: ghost}})
	var ve *product.ValidationError
	if !errors.As(err, &ve) || ve.Field != "image" {
		t.Fatalf("err = %v, want a ValidationError on field image", err)
	}
	if list, _ := f.s.Products(ctx, store.Filter{}); len(list) != 0 {
		t.Errorf("nothing may be created: %+v", list)
	}
}

func TestSetImageSetsReplacesAndClearsAndDropsUnusedFiles(t *testing.T) {
	f := newFx(t)
	im := newImages(picA, picB)
	s := f.withImages(im)
	p := f.prod(t, "Passata", f.tomato, 700)
	set := func(v string) (store.Detail, error) { return s.SetImage(ctx, p.ID, v) }

	if got, err := set(picA); err != nil || got.Image != picA {
		t.Fatalf("set = %+v, %v", got.Product, err)
	}
	if len(im.deleted) != 0 {
		t.Errorf("deleted %v while setting the first picture", im.deleted)
	}
	if got, err := set(picB); err != nil || got.Image != picB {
		t.Fatalf("replace = %+v, %v", got.Product, err)
	}
	if len(im.deleted) != 1 || im.deleted[0] != picA {
		t.Errorf("deleted = %v, want the replaced picture only", im.deleted)
	}
	if got, err := set(""); err != nil || got.Image != "" || got.ImageURL != "" {
		t.Fatalf("clear = %+v, %v", got.Product, err)
	}
	if len(im.deleted) != 2 || im.deleted[1] != picB {
		t.Errorf("deleted = %v, want the cleared picture too", im.deleted)
	}
}

func TestSetImageToTheSameIDDeletesNothing(t *testing.T) {
	f := newFx(t)
	im := newImages(picA)
	s := f.withImages(im)
	p := f.pictured(t, s, "Passata", picA)
	if _, err := s.SetImage(ctx, p.ID, picA); err != nil || len(im.deleted) != 0 || !im.have[picA] {
		t.Errorf("err = %v, deleted = %v; saving the same picture again must keep its file", err, im.deleted)
	}
}

func TestSetImageRefusesAPictureThatWasNeverUploadedAndKeepsTheOldOne(t *testing.T) {
	f := newFx(t)
	s := f.withImages(newImages(picA))
	p := f.pictured(t, s, "Passata", picA)
	_, err := s.SetImage(ctx, p.ID, ghost)
	var ve *product.ValidationError
	if !errors.As(err, &ve) || ve.Field != "image" {
		t.Fatalf("err = %v, want a ValidationError on field image", err)
	}
	if back, _ := s.Product(ctx, p.ID); back.Image != picA {
		t.Errorf("the old picture must stay: %q", back.Image)
	}
}

func TestSetImageOnAnUnknownProductIsNotFound(t *testing.T) {
	f := newFx(t)
	if _, err := f.withImages(newImages(picA)).SetImage(ctx, 999, picA); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("err = %v", err)
	}
}

func TestUpdateProductAndArchivingKeepThePicture(t *testing.T) {
	f := newFx(t)
	im := newImages(picA)
	s := f.withImages(im)
	p := f.pictured(t, s, "Passata", picA)
	name := "Passata rustica"
	if got, err := s.UpdateProduct(ctx, p.ID, &name, nil); err != nil || got.Image != picA {
		t.Fatalf("rename = %+v, %v; the picture must stay", got.Product, err)
	}
	if got, err := s.SetArchived(ctx, p.ID, true); err != nil || got.Image != picA || !im.have[picA] {
		t.Fatalf("archive = %+v, %v; an archived Product keeps its picture", got.Product, err)
	}
	if got, err := s.SetArchived(ctx, p.ID, false); err != nil || got.Image != picA {
		t.Fatalf("unarchive = %+v, %v", got.Product, err)
	}
}

func TestDeletingAProductRemovesItsPictureFile(t *testing.T) {
	f := newFx(t)
	im := newImages(picA)
	s := f.withImages(im)
	p := f.pictured(t, s, "Passata", picA)
	if err := s.DeleteProduct(ctx, p.ID); err != nil {
		t.Fatal(err)
	}
	if im.have[picA] {
		t.Error("the picture file must be deleted with its Product (the nightly sweep is only the safety net)")
	}
}

func TestDeletingABoughtProductKeepsItsPictureFile(t *testing.T) {
	f := newFx(t)
	im := newImages(picA)
	s := f.withImages(im)
	p := f.pictured(t, s, "Passata", picA)
	if _, err := s.RecordPurchase(ctx, p.ID, nil, "2026-11-09"); err != nil {
		t.Fatal(err)
	}
	if err := s.DeleteProduct(ctx, p.ID); !errors.Is(err, store.ErrBought) {
		t.Fatalf("err = %v", err)
	}
	if !im.have[picA] {
		t.Error("a refused delete must not remove the picture")
	}
}

func TestAFileAnotherProductStillUsesIsNotDeleted(t *testing.T) {
	f := newFx(t)
	im := newImages(picA)
	s := f.withImages(im)
	a := f.pictured(t, s, "Passata", picA)
	f.pictured(t, s, "Passata big", picA) // a hand-made request may reuse an id
	if _, err := s.SetImage(ctx, a.ID, ""); err != nil {
		t.Fatal(err)
	}
	if !im.have[picA] || len(im.deleted) != 0 {
		t.Errorf("deleted = %v; the other Product still shows it", im.deleted)
	}
}
