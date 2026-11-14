package httpapi

import (
	"context"
	"reflect"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/scan/service"
)

// B9-06 (decision SET 1): the typed-barcode check applies to typed Product barcodes only. A code the scanner read is
// still accepted as a global barcode when it is made only of digits and has an odd length.
func TestAScannedDigitsOnlyCodeOfAnOddLengthIsStillAGlobalBarcode(t *testing.T) {
	c, ing := adapter(t)
	p, err := c.CreateProduct(context.Background(), service.NewProduct{Name: "Loose onions", IngredientID: ing, PackSize: 1000,
		Barcodes: []string{"12345"}})
	if err != nil {
		t.Fatalf("CreateProduct with the scanned code 12345 = %v, want it accepted", err)
	}
	d, err := c.st.Product(context.Background(), p.ID)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(d.Barcodes, []string{"12345"}) {
		t.Fatalf("Barcodes = %v, want [12345] as a global barcode", d.Barcodes)
	}
}
