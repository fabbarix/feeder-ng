package httpapi

import (
	"context"
	"errors"
	"path/filepath"
	"testing"
	"time"

	"github.com/fabbarix/feeder-ng/internal/clock"
	"github.com/fabbarix/feeder-ng/internal/db"
	"github.com/fabbarix/feeder-ng/internal/product"
	productstore "github.com/fabbarix/feeder-ng/internal/product/store"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

// PPX: the adapter turns the store's typed missing-Picture error into service.ErrPictureMissing, so the scan service can match it with
// errors.Is, and FillPicture reaches the store's atomic FillImage (docs/dev/design/ppx-product-picture-sync.md).

type fakeFiles map[string]bool

func (m fakeFiles) Exists(id string) bool                     { return m[id] }
func (m fakeFiles) Delete(_ context.Context, id string) error { delete(m, id); return nil }

const (
	haveID  = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
	otherID = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
	goneID  = "cccccccccccccccccccccccccccccccc"
)

func adapter(t *testing.T) (catalogue, int64) {
	t.Helper()
	d, err := db.Open(filepath.Join(t.TempDir(), "feeder.db"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { d.Close() })
	if err := db.MigrateEmbedded(context.Background(), d); err != nil {
		t.Fatal(err)
	}
	res, err := d.Exec(`INSERT INTO ingredients(name, name_key, base_unit, created_at, updated_at) VALUES ('passata','passata','g','2026-11-09T12:00:00Z','2026-11-09T12:00:00Z')`)
	if err != nil {
		t.Fatal(err)
	}
	ing, _ := res.LastInsertId()
	st := productstore.New(d, clock.NewFake(time.Date(2026, 11, 9, 12, 0, 0, 0, time.UTC)), productstore.WithImages(fakeFiles{haveID: true, otherID: true}))
	return catalogue{db: d, st: st}, ing
}

func TestTheAdapterMapsAMissingPictureOnCreateToTheServiceSentinel(t *testing.T) {
	c, ing := adapter(t)
	_, err := c.CreateProduct(context.Background(), service.NewProduct{Name: "Passata", IngredientID: ing, PackSize: 700, Image: goneID, Barcodes: []string{"08000500310427"}})
	if !errors.Is(err, service.ErrPictureMissing) {
		t.Fatalf("err = %v, want errors.Is service.ErrPictureMissing", err)
	}
}

func TestTheAdapterKeepsOtherValidationErrorsAsTheyWere(t *testing.T) {
	c, ing := adapter(t)
	_, err := c.CreateProduct(context.Background(), service.NewProduct{Name: "", IngredientID: ing, PackSize: 700})
	if err == nil || errors.Is(err, service.ErrPictureMissing) || errors.Is(err, product.ErrPictureMissing) {
		t.Fatalf("err = %v, want a plain validation error", err)
	}
}

func TestTheAdapterFillsAMissingPictureOnceAndReportsIt(t *testing.T) {
	c, ing := adapter(t)
	p, err := c.CreateProduct(context.Background(), service.NewProduct{Name: "Passata", IngredientID: ing, PackSize: 700, Barcodes: []string{"08000500310427"}})
	if err != nil {
		t.Fatal(err)
	}
	info, filled, err := c.FillPicture(context.Background(), p.ID, haveID)
	if err != nil || !filled || info.ImageURL != "/api/images/"+haveID {
		t.Fatalf("FillPicture = %+v, %v, %v", info, filled, err)
	}
	info, filled, err = c.FillPicture(context.Background(), p.ID, otherID)
	if err != nil || filled || info.ImageURL != "/api/images/"+haveID {
		t.Fatalf("second FillPicture = %+v, %v, %v; the first picture stays", info, filled, err)
	}
}

func TestTheAdapterMapsAMissingPictureOnFillToTheServiceSentinel(t *testing.T) {
	c, ing := adapter(t)
	p, _ := c.CreateProduct(context.Background(), service.NewProduct{Name: "Passata", IngredientID: ing, PackSize: 700})
	if _, _, err := c.FillPicture(context.Background(), p.ID, goneID); !errors.Is(err, service.ErrPictureMissing) {
		t.Fatalf("err = %v, want errors.Is service.ErrPictureMissing", err)
	}
}

func TestTheAdapterFillOfAnUnknownProductIsProductGone(t *testing.T) {
	c, _ := adapter(t)
	if _, _, err := c.FillPicture(context.Background(), 999, haveID); !errors.Is(err, service.ErrProductGone) {
		t.Fatalf("err = %v, want ErrProductGone", err)
	}
}
