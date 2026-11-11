package product_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/product"
)

// PP: a Product has an optional Picture, an image id from internal/imaging ("" = none).
const pictureID = "0123456789abcdef0123456789abcdef"

func okInput() product.Input {
	return product.Input{Name: "Mutti passata", IngredientID: 3, PackSize: 700}
}

func TestInputAcceptsNoPictureOrAWellFormedID(t *testing.T) {
	for name, image := range map[string]string{"none": "", "an id": pictureID, "an id with spaces around it": "  " + pictureID + " "} {
		in := okInput()
		in.Image = image
		if err := in.Validate(); err != nil {
			t.Errorf("%s: %v", name, err)
		}
	}
}

func TestInputRefusesAMalformedPictureID(t *testing.T) {
	for _, bad := range []string{"jar.png", "../etc/passwd", strings.Repeat("a", 31), strings.Repeat("A", 32), "https://x.test/a.png"} {
		in := okInput()
		in.Image = bad
		err := in.Validate()
		var ve *product.ValidationError
		if !errors.Is(err, product.ErrInvalid) || !errors.As(err, &ve) || ve.Field != "image" {
			t.Errorf("Image %q: err = %v, want a ValidationError on field image", bad, err)
		}
	}
}
