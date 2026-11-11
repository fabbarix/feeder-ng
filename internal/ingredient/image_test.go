package ingredient_test

import (
	"errors"
	"strings"
	"testing"

	"github.com/fabbarix/feeder-ng/internal/ingredient"
	"github.com/fabbarix/feeder-ng/internal/units"
)

// IM2: an Ingredient has an optional picture, an image id from internal/imaging ("" = none).
const pictureID = "0123456789abcdef0123456789abcdef"

func TestValidateKeepsATrimmedPictureID(t *testing.T) {
	got, err := ingredient.Input{Name: "Flour", Base: units.Gram, Image: "  " + pictureID + " "}.Validate()
	if err != nil || got.Image != pictureID {
		t.Fatalf("Validate = %+v, %v; want the trimmed id", got, err)
	}
}

func TestValidatePictureIsOptional(t *testing.T) {
	got, err := ingredient.Input{Name: "Flour", Base: units.Gram}.Validate()
	if err != nil || got.Image != "" {
		t.Fatalf("Validate = %+v, %v; no picture is fine", got, err)
	}
}

func TestValidateRefusesAMalformedPictureID(t *testing.T) {
	for _, bad := range []string{"flour.png", "../etc/passwd", strings.Repeat("a", 31), strings.Repeat("A", 32), "https://x.test/a.png"} {
		_, err := ingredient.Input{Name: "Flour", Base: units.Gram, Image: bad}.Validate()
		var ve *ingredient.ValidationError
		if !errors.Is(err, ingredient.ErrInvalid) || !errors.As(err, &ve) || ve.Field != "image" {
			t.Errorf("Image %q: err = %v, want a ValidationError on field image", bad, err)
		}
	}
}
