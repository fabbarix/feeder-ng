package service_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/scan"
	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

// PPX: a merged unknown-barcode scan fills a missing Picture, and a Picture that is gone is a typed error that never loses the scan
// (docs/dev/design/ppx-product-picture-sync.md).

const (
	newPic   = "dddddddddddddddddddddddddddddddd"
	ownPic   = "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
	gonePic  = "cccccccccccccccccccccccccccccccc"
	unknownC = "08000500310427" // the barcode unknownPack uses
)

func withPicture(op scan.Op, image string) scan.Op {
	op.ProductImage = image
	return op
}

// takenBy makes the barcode of unknownPack belong to the existing Product mutti.
func takenBy(e *env) { e.cat.owners[unknownC] = mutti }

func TestAMergedScanFillsAMissingPicture(t *testing.T) {
	e := newEnv(t)
	takenBy(e)
	res := apply(t, e, withPicture(unknownPack("scan-0001", scan.ScopeGlobal), newPic))
	if res.Status != scan.StatusApplied || res.Scan.ProductCreated || res.Scan.Merged == nil {
		t.Fatalf("Result = %+v", res)
	}
	if res.Scan.ProductImageURL != "/api/images/"+newPic {
		t.Errorf("productImageUrl = %q; the Product had none, so the form's picture fills it", res.Scan.ProductImageURL)
	}
	if !res.Scan.Merged.PictureFilled {
		t.Errorf("Merged = %+v, want PictureFilled", res.Scan.Merged)
	}
	if got := e.cat.products[mutti].ImageURL; got != "/api/images/"+newPic {
		t.Errorf("the Product now shows %q", got)
	}
}

func TestAMergedScanKeepsAnExistingPictureAndDoesNotTouchTheCatalogue(t *testing.T) {
	e := newEnv(t)
	takenBy(e)
	p := e.cat.products[mutti]
	p.ImageURL = "/api/images/" + ownPic
	e.cat.products[mutti] = p
	res := apply(t, e, withPicture(unknownPack("scan-0001", scan.ScopeGlobal), newPic))
	if res.Scan.ProductImageURL != "/api/images/"+ownPic || res.Scan.Merged == nil || res.Scan.Merged.PictureFilled {
		t.Errorf("Result = %+v / %+v; the existing picture stays", res.Scan, res.Scan.Merged)
	}
	if len(e.cat.fills) != 0 {
		t.Errorf("FillPicture was called %v; a Product that shows a picture is not asked again", e.cat.fills)
	}
}

func TestAMergedScanWithoutAPictureFillsNothing(t *testing.T) {
	e := newEnv(t)
	takenBy(e)
	res := apply(t, e, unknownPack("scan-0001", scan.ScopeGlobal))
	if res.Scan.ProductImageURL != "" || res.Scan.Merged == nil || res.Scan.Merged.PictureFilled || len(e.cat.fills) != 0 {
		t.Errorf("Result = %+v, fills %v", res.Scan, e.cat.fills)
	}
}

func TestAMergedScanWhoseUploadedPictureIsGoneStillMerges(t *testing.T) {
	e := newEnv(t)
	takenBy(e)
	e.cat.ghostImages = map[string]bool{gonePic: true}
	res := apply(t, e, withPicture(unknownPack("scan-0001", scan.ScopeGlobal), gonePic))
	if res.Status != scan.StatusApplied || res.Scan.Merged == nil || res.Scan.Merged.PictureFilled || res.Scan.ProductImageURL != "" {
		t.Errorf("Result = %+v; the merge goes ahead without the picture", res)
	}
	if len(e.cat.fills) != 1 {
		t.Errorf("fills = %v; the fill must have been tried", e.cat.fills)
	}
}

func TestACreatedProductIsNotFilledAgain(t *testing.T) {
	e := newEnv(t)
	res := apply(t, e, withPicture(unknownPack("scan-0001", scan.ScopeGlobal), newPic))
	if !res.Scan.ProductCreated || res.Scan.Merged != nil || res.Scan.ProductImageURL != "/api/images/"+newPic || len(e.cat.fills) != 0 {
		t.Errorf("Result = %+v, fills %v", res.Scan, e.cat.fills)
	}
}

func TestAMissingPictureSentinelRetriesWithoutThePicture(t *testing.T) {
	e := newEnv(t)
	e.cat.ghostImages = map[string]bool{gonePic: true}
	res := apply(t, e, withPicture(unknownPack("scan-0001", scan.ScopeGlobal), gonePic))
	if res.Status != scan.StatusApplied || !res.Scan.ProductCreated || res.Scan.ProductImageURL != "" {
		t.Fatalf("Result = %+v", res)
	}
	if len(e.cat.created) != 1 || e.cat.created[0].Image != "" {
		t.Errorf("created = %+v; one Product, with no picture", e.cat.created)
	}
}

func TestTheSentinelIsMatchedThroughWrapping(t *testing.T) {
	e := newEnv(t)
	e.cat.ghostImages = map[string]bool{gonePic: true}
	e.cat.missingErr = fmt.Errorf("catalogue: create: %w", service.ErrPictureMissing)
	res := apply(t, e, withPicture(unknownPack("scan-0001", scan.ScopeGlobal), gonePic))
	if res.Status != scan.StatusApplied || !res.Scan.ProductCreated {
		t.Errorf("Result = %+v; errors.Is must see through the wrapping", res)
	}
}

func TestAValidationErrorOnTheImageFieldIsNoLongerTheRetrySignal(t *testing.T) {
	e := newEnv(t)
	e.cat.ghostImages = map[string]bool{gonePic: true}
	e.cat.missingErr = &scan.ValidationError{Field: "image", Message: "The picture was not uploaded"}
	res := apply(t, e, withPicture(unknownPack("scan-0001", scan.ScopeGlobal), gonePic))
	if res.Status != scan.StatusRejected || res.Error == nil || res.Error.Code != service.CodeValidation {
		t.Errorf("Result = %+v; only the typed sentinel drops the picture, a string match on Field is gone", res)
	}
	if len(e.cat.created) != 0 {
		t.Errorf("created = %+v; nothing is created", e.cat.created)
	}
}

func TestAQueuedBatchWithASweptPictureAppliesEveryOperation(t *testing.T) {
	e := newEnv(t)
	e.cat.ghostImages = map[string]bool{gonePic: true}
	second := unknownPack("scan-0002", scan.ScopeShop)
	second.Barcode = "05012345678900"
	second.ProductName = "Tomatoes 400 g"
	res, err := e.svc.Sync(context.Background(), []scan.Op{withPicture(unknownPack("scan-0001", scan.ScopeGlobal), gonePic), withPicture(second, newPic)})
	if err != nil {
		t.Fatal(err)
	}
	if len(res) != 2 || res[0].Status != scan.StatusApplied || res[1].Status != scan.StatusApplied {
		t.Fatalf("results = %+v", res)
	}
	if res[0].Scan.ProductImageURL != "" || res[1].Scan.ProductImageURL != "/api/images/"+newPic {
		t.Errorf("pictures = %q, %q; the swept one is dropped, the other kept", res[0].Scan.ProductImageURL, res[1].Scan.ProductImageURL)
	}
}
