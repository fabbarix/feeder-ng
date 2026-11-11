package imaging

import (
	"bytes"
	"image"
	"image/jpeg"

	"golang.org/x/image/draw"
)

// Limits of the photos the Recipe Assistant sends to the model.
const (
	ModelMaxSide     = 2576 // the Vision page's high-resolution tier
	ModelJPEGQuality = 90   // heavy compression blurs small print
)

// ModelImage is a photo ready for the model.
type ModelImage struct {
	JPEG          []byte
	Width, Height int
}

// PrepareForModel decodes data with the same checks as Process (size, type sniffing, pixel limits, EXIF
// orientation; HEIC is refused while no decoder is linked in), shrinks it so the long side is at most
// ModelMaxSide (never upscales) and re-encodes it as JPEG quality 90. Transparency is flattened on white. The
// re-encode drops EXIF and every other metadata. Errors: ErrEmpty, ErrTooLarge, ErrUnsupportedFormat,
// ErrTooManyPixels.
func PrepareForModel(data []byte) (ModelImage, error) {
	img, w, h, err := decodeUpright(data, "", ModelMaxSide)
	if err != nil {
		return ModelImage{}, err
	}
	flat := image.NewRGBA(image.Rect(0, 0, w, h))
	draw.Draw(flat, flat.Bounds(), image.White, image.Point{}, draw.Src)
	draw.Draw(flat, flat.Bounds(), img, img.Bounds().Min, draw.Over)
	var out bytes.Buffer
	if err := jpeg.Encode(&out, flat, &jpeg.Options{Quality: ModelJPEGQuality}); err != nil {
		return ModelImage{}, ErrUnsupportedFormat
	}
	return ModelImage{JPEG: out.Bytes(), Width: w, Height: h}, nil
}
