package scan_test

import (
	"encoding/json"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/scan"
)

// PP: the "what is this?" form may carry a Picture for the Product it creates; a scan result carries the Product's Picture.
const productPicture = "0123456789abcdef0123456789abcdef"

func TestAnUnknownBarcodeFormMayCarryAPictureID(t *testing.T) {
	for name, op := range map[string]scan.Op{"pack": unknownPack(), "weighed": weighed()} {
		op.ProductImage = productPicture
		if err := op.Validate(); err != nil {
			t.Errorf("%s with a picture: %v", name, err)
		}
	}
}

func TestAMalformedPictureIDIsRefusedOnTheFormField(t *testing.T) {
	for _, bad := range []string{"jar.png", "../etc/passwd", strings.Repeat("a", 31), strings.Repeat("A", 32), "https://x.test/a.png"} {
		op := unknownPack()
		op.ProductImage = bad
		if got := field(t, op.Validate()); got != "productImage" {
			t.Errorf("ProductImage %q: field = %q, want productImage", bad, got)
		}
	}
}

func TestOnlyAnUnknownBarcodeFormTakesAPicture(t *testing.T) {
	for name, op := range map[string]scan.Op{"shop scan": shopScan(), "stock-take": stockTake()} {
		op.ProductImage = productPicture
		if got := field(t, op.Validate()); got != "productImage" {
			t.Errorf("%s: field = %q; a picture belongs to the form that creates a Product", name, got)
		}
	}
}

func TestResultJSONCarriesTheProductPictureOnlyWhenThereIsOne(t *testing.T) {
	with, _ := json.Marshal(scan.Result{ClientUUID: "u", Status: scan.StatusApplied, Scan: &scan.Applied{ProductID: 7, ProductImageURL: "/api/images/" + productPicture}})
	without, _ := json.Marshal(scan.Result{ClientUUID: "u", Status: scan.StatusApplied, Scan: &scan.Applied{ProductID: 7}})
	if !strings.Contains(string(with), `"productImageUrl":"/api/images/`+productPicture+`"`) {
		t.Errorf("with a picture: %s", with)
	}
	if strings.Contains(string(without), "productImageUrl") {
		t.Errorf("without a picture the key is absent (the offline queue stays small): %s", without)
	}
}
