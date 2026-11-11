package httpapi_test

import (
	"bytes"
	"encoding/base64"
	"fmt"
	"image"
	"image/png"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/testkit"
)

// PP: Product pictures in scans (docs/dev/design/pp-product-pictures.md).

func uploadPNG(t *testing.T, c *testkit.Client) string {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, image.NewRGBA(image.Rect(0, 0, 40, 30))); err != nil {
		t.Fatal(err)
	}
	r := c.Post("/api/images", map[string]string{"dataUrl": "data:image/png;base64," + base64.StdEncoding.EncodeToString(b.Bytes())})
	var out struct {
		ID string `json:"id"`
	}
	r.MustJSON(t, &out)
	if r.Status != 201 || out.ID == "" {
		t.Fatalf("upload = %d %s", r.Status, r.Body)
	}
	return out.ID
}

type scanned struct {
	Status string `json:"status"`
	Error  struct {
		Code string `json:"code"`
	} `json:"error"`
	Scan struct {
		ProductID       int64  `json:"productId"`
		ProductCreated  bool   `json:"productCreated"`
		ProductImageURL string `json:"productImageUrl"`
	} `json:"scan"`
}

func (f fixture) unknownOp(uuid, code string) map[string]any {
	return map[string]any{"clientUuid": uuid, "scannedAt": "2026-11-09T12:00:00Z", "kind": "shop_unknown", "shopId": f.shop, "barcode": code, "scope": "global",
		"ingredient": map[string]any{"id": f.ingr}, "productName": "Tinned tomatoes 400 g", "packSize": 400, "quantity": 400, "rangeTo": "2026-11-15"}
}

func TestAScanOfAPicturedProductShowsItsPicture(t *testing.T) {
	f := newFixture(t)
	id := uploadPNG(t, f.user)
	if r := f.user.Patch(fmt.Sprintf("/api/products/%d", f.product), map[string]any{"image": id}); r.Status != 200 {
		t.Fatalf("picture = %d %s", r.Status, r.Body)
	}
	var res scanned
	f.user.Post("/api/scan", f.op("scan-0001")).MustJSON(t, &res)
	if res.Status != "applied" || res.Scan.ProductImageURL != "/api/images/"+id {
		t.Errorf("scan = %+v", res)
	}
}

func TestAScanOfAProductWithoutAPictureHasNoPictureKey(t *testing.T) {
	f := newFixture(t)
	r := f.user.Post("/api/scan", f.op("scan-0001"))
	if r.Status != 200 || strings.Contains(string(r.Body), "productImageUrl") {
		t.Errorf("scan = %d %s", r.Status, r.Body)
	}
}

func TestTheWhatIsThisFormCreatesTheProductWithItsPicture(t *testing.T) {
	f := newFixture(t)
	id := uploadPNG(t, f.user)
	op := f.unknownOp("scan-0002", "5012345678900")
	op["productImage"] = id
	var res scanned
	r := f.user.Post("/api/scan", op)
	r.MustJSON(t, &res)
	if r.Status != 200 || !res.Scan.ProductCreated || res.Scan.ProductImageURL != "/api/images/"+id {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
	var p struct {
		Image string `json:"image"`
	}
	f.user.Get(fmt.Sprintf("/api/products/%d", res.Scan.ProductID)).MustJSON(t, &p)
	if p.Image != id {
		t.Errorf("the created Product = %+v", p)
	}
}

func TestAQueuedScanWhoseUploadedPictureIsGoneIsAppliedWithoutIt(t *testing.T) {
	f := newFixture(t)
	op := f.unknownOp("scan-0002", "5012345678900")
	op["productImage"] = strings.Repeat("c", 32) // well-formed, but the file is gone
	var res scanned
	r := f.user.Post("/api/scan", op)
	r.MustJSON(t, &res)
	if r.Status != 200 || res.Status != "applied" || !res.Scan.ProductCreated || res.Scan.ProductImageURL != "" {
		t.Fatalf("scan = %d %s; the missing picture is dropped, the scan is not rejected", r.Status, r.Body)
	}
	var p struct {
		Image string `json:"image"`
	}
	f.user.Get(fmt.Sprintf("/api/products/%d", res.Scan.ProductID)).MustJSON(t, &p)
	if p.Image != "" {
		t.Errorf("the created Product = %+v; it has no picture", p)
	}
}

func TestAMalformedPictureIdStillRejectsTheScan(t *testing.T) {
	f := newFixture(t)
	op := f.unknownOp("scan-0002", "5012345678900")
	op["productImage"] = "jar.png"
	r := f.user.Post("/api/scan", op)
	if r.Status != 422 || r.ErrorCode() != "validation_failed" {
		t.Fatalf("scan = %d %s", r.Status, r.Body)
	}
}

func TestATakenBarcodeMergesEvenWhenThePictureIsGone(t *testing.T) {
	f := newFixture(t)
	f.user.Post("/api/scan", f.unknownOp("scan-0002", "5012345678900"))
	b := f.unknownOp("scan-0003", "5012345678900")
	b["productImage"] = strings.Repeat("c", 32)
	var res scanned
	f.user.Post("/api/scan", b).MustJSON(t, &res)
	if res.Status != "applied" || res.Scan.ProductCreated {
		t.Errorf("scan = %+v; a taken barcode merges as before", res)
	}
}

func TestAMergedScanKeepsTheExistingProductPicture(t *testing.T) {
	f := newFixture(t)
	first, second := uploadPNG(t, f.user), uploadPNG(t, f.user)
	a := f.unknownOp("scan-0002", "5012345678900")
	a["productImage"] = first
	f.user.Post("/api/scan", a)
	b := f.unknownOp("scan-0003", "5012345678900") // the same barcode, sent by someone else a moment later
	b["productImage"] = second
	var res scanned
	f.user.Post("/api/scan", b).MustJSON(t, &res)
	if res.Status != "applied" || res.Scan.ProductCreated || res.Scan.ProductImageURL != "/api/images/"+first {
		t.Errorf("merged scan = %+v; the existing Product keeps its picture", res)
	}
}

func TestThePhonesOfflineDataCarriesTheProductPictures(t *testing.T) {
	f := newFixture(t)
	id := uploadPNG(t, f.user)
	f.user.Patch(fmt.Sprintf("/api/products/%d", f.product), map[string]any{"image": id})
	var data struct {
		Products []struct {
			ID       int64  `json:"id"`
			ImageURL string `json:"imageUrl"`
		} `json:"products"`
	}
	f.user.Get(fmt.Sprintf("/api/scan/offline?shop=%d", f.shop)).MustJSON(t, &data)
	if len(data.Products) != 1 || data.Products[0].ImageURL != "/api/images/"+id {
		t.Errorf("offline data = %+v; the phone describes a queued scan with the picture", data)
	}
}

// PPX: a merged scan fills a Product that has no Picture (docs/dev/design/ppx-product-picture-sync.md).

func TestAMergedScanFillsAProductWithoutAPicture(t *testing.T) {
	f := newFixture(t)
	id := uploadPNG(t, f.user)
	op := f.unknownOp("scan-0002", "8000500310427") // the fixture Product's barcode: someone created it first
	op["productImage"] = id
	var res struct {
		scanned
		Scan struct {
			ProductID       int64  `json:"productId"`
			ProductCreated  bool   `json:"productCreated"`
			ProductImageURL string `json:"productImageUrl"`
			Merged          *struct {
				ProductID     int64 `json:"productId"`
				PictureFilled bool  `json:"pictureFilled"`
			} `json:"merged"`
		} `json:"scan"`
	}
	f.user.Post("/api/scan", op).MustJSON(t, &res)
	if res.Status != "applied" || res.Scan.ProductCreated || res.Scan.Merged == nil || res.Scan.Merged.ProductID != f.product {
		t.Fatalf("scan = %+v; want a merge into the fixture Product", res)
	}
	if res.Scan.ProductImageURL != "/api/images/"+id || !res.Scan.Merged.PictureFilled {
		t.Errorf("scan = %+v; the Product had no picture, so the form's picture fills it", res.Scan)
	}
	var p struct {
		Image string `json:"image"`
	}
	f.user.Get(fmt.Sprintf("/api/products/%d", f.product)).MustJSON(t, &p)
	if p.Image != id {
		t.Errorf("Product image = %q, want %q", p.Image, id)
	}
	if r := f.user.Get("/api/images/" + id); r.Status != 200 {
		t.Errorf("the file = %d; it is kept", r.Status)
	}
}

func TestAMergedScanLeavesTheLosingPictureFileForTheNightlyCleanUp(t *testing.T) {
	f := newFixture(t)
	own, other := uploadPNG(t, f.user), uploadPNG(t, f.user)
	f.user.Patch(fmt.Sprintf("/api/products/%d", f.product), map[string]any{"image": own})
	op := f.unknownOp("scan-0002", "8000500310427")
	op["productImage"] = other
	var res scanned
	f.user.Post("/api/scan", op).MustJSON(t, &res)
	if res.Status != "applied" || res.Scan.ProductImageURL != "/api/images/"+own {
		t.Fatalf("scan = %+v; the Product keeps its own picture", res)
	}
	if r := f.user.Get("/api/images/" + other); r.Status != 200 {
		t.Errorf("the unused file = %d; it stays until the sweep removes it (24 h)", r.Status)
	}
}

func TestAQueuedBatchWithAGonePictureIsAppliedInFull(t *testing.T) {
	f := newFixture(t)
	a := f.unknownOp("scan-0002", "5012345678900")
	a["productImage"] = strings.Repeat("c", 32)
	b := f.unknownOp("scan-0003", "4006381333931")
	b["productName"] = "Other tin"
	var out struct {
		Results []scanned `json:"results"`
	}
	r := f.user.Post("/api/scan/sync", map[string]any{"ops": []any{a, b}})
	r.MustJSON(t, &out)
	if r.Status != 200 || len(out.Results) != 2 || out.Results[0].Status != "applied" || out.Results[1].Status != "applied" || out.Results[0].Scan.ProductImageURL != "" {
		t.Fatalf("sync = %d %s; a gone picture is dropped, no operation is rejected", r.Status, r.Body)
	}
}
