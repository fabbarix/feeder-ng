package imaging

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/jpeg"
	"image/png"
	"testing"
)

// PrepareForModel makes the JPEG the Recipe Assistant sends to the model: upright (EXIF applied), at most
// ModelMaxSide on the long side, never upscaled, quality 90, no metadata, same decode limits as Process.

func decodeJPEGImage(t *testing.T, data []byte) image.Image {
	t.Helper()
	img, err := jpeg.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("result is not a JPEG: %v", err)
	}
	return img
}

func TestPrepareForModelShrinksTheLongSideToTheModelLimitAndKeepsTheShape(t *testing.T) {
	res, err := PrepareForModel(markedJPEG(t, 3000, 2000))
	if err != nil {
		t.Fatal(err)
	}
	if res.Width != 2576 || res.Height < 1717 || res.Height > 1718 {
		t.Errorf("size = %dx%d, want 2576x1717 or 1718", res.Width, res.Height)
	}
	if b := decodeJPEGImage(t, res.JPEG).Bounds(); b.Dx() != res.Width || b.Dy() != res.Height {
		t.Errorf("JPEG is %dx%d, Result says %dx%d", b.Dx(), b.Dy(), res.Width, res.Height)
	}
}

func TestPrepareForModelNeverUpscales(t *testing.T) {
	res, err := PrepareForModel(markedJPEG(t, 800, 600))
	if err != nil || res.Width != 800 || res.Height != 600 {
		t.Errorf("got %dx%d, %v; want 800x600", res.Width, res.Height, err)
	}
}

func TestPrepareForModelAppliesTheEXIFOrientation(t *testing.T) {
	// 64x32 with orientation 6 (turned 90 clockwise): upright it is 32x64 with the marker top-right.
	res, err := PrepareForModel(sidewaysJPEG(t, 6, false))
	if err != nil || res.Width != 32 || res.Height != 64 {
		t.Fatalf("got %dx%d, %v; want 32x64", res.Width, res.Height, err)
	}
	img := decodeJPEGImage(t, res.JPEG)
	if !isRed(img.At(24, 8)) || isRed(img.At(8, 8)) {
		t.Error("the red marker must be in the top-right corner")
	}
	// the real ImageMagick file
	res, err = PrepareForModel(fixture(t, "sideways-6.jpg"))
	if err != nil || res.Width != 32 || res.Height != 64 {
		t.Fatalf("fixture: got %dx%d, %v; want 32x64", res.Width, res.Height, err)
	}
}

func TestPrepareForModelOrientsBeforeSizing(t *testing.T) {
	// A 3000x2000 stored picture with orientation 6 is upright 2000x3000, so the height is the long side.
	data := withSegment(markedJPEG(t, 3000, 2000), exifSegment(6, false))
	res, err := PrepareForModel(data)
	if err != nil || res.Height != 2576 || res.Width < 1717 || res.Width > 1718 {
		t.Errorf("got %dx%d, %v; want height 2576", res.Width, res.Height, err)
	}
}

func TestPrepareForModelDropsAllMetadata(t *testing.T) {
	in := sidewaysJPEG(t, 6, false)
	if !bytes.Contains(in, []byte("Exif\x00\x00")) {
		t.Fatal("fixture has no EXIF")
	}
	res, err := PrepareForModel(in)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(res.JPEG, []byte("Exif")) || bytes.Contains(res.JPEG, []byte{0xff, 0xe1}) {
		t.Error("output must carry no EXIF/APP1 segment")
	}
}

func TestPrepareForModelAcceptsPNGAndFlattensTransparencyOnWhite(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 20, 10)) // fully transparent
	var b bytes.Buffer
	if err := png.Encode(&b, img); err != nil {
		t.Fatal(err)
	}
	res, err := PrepareForModel(b.Bytes())
	if err != nil || res.Width != 20 || res.Height != 10 {
		t.Fatalf("got %dx%d, %v", res.Width, res.Height, err)
	}
	r, g, bl, _ := decodeJPEGImage(t, res.JPEG).At(10, 5).RGBA()
	if r>>8 < 240 || g>>8 < 240 || bl>>8 < 240 {
		t.Errorf("transparent pixel = %v, want white", color.RGBA64{R: uint16(r), G: uint16(g), B: uint16(bl)})
	}
}

func TestPrepareForModelRefusals(t *testing.T) {
	tests := map[string]struct {
		data []byte
		want error
	}{
		"empty":         {nil, ErrEmpty},
		"garbage":       {[]byte("this is not an image"), ErrUnsupportedFormat},
		"over 8 MB":     {make([]byte, MaxBytes+1), ErrTooLarge},
		"pixel bomb":    {bombPNG(t, 20000, 20000), ErrTooManyPixels},
		"too many side": {bombPNG(t, 12100, 64), ErrTooManyPixels},
		"HEIC":          {fixture(t, "pantry-128x96.heic"), ErrUnsupportedFormat},
	}
	for name, tc := range tests {
		t.Run(name, func(t *testing.T) {
			if _, err := PrepareForModel(tc.data); !errors.Is(err, tc.want) {
				t.Errorf("got %v, want %v", err, tc.want)
			}
		})
	}
}
