package imaging

import (
	"bytes"
	"errors"
	"image"
	"os"
	"path/filepath"
	"testing"

	"golang.org/x/image/webp"
)

// HEIC/HEIF (iPhone photos) are converted to WebP on the server, with the same limits as JPEG/PNG/WebP
// (docs/dev/design/ip1-imagepicker.md, "HEIC"). The fixtures in testdata/ are real HEVC-coded HEIC files
// (see testdata/mkheic.py): pantry-128x96.heic is 128x96, left half red, right half blue.

func fixture(t *testing.T, name string) []byte {
	t.Helper()
	data, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func decodeWebP(t *testing.T, data []byte) image.Image {
	t.Helper()
	img, err := webp.Decode(bytes.NewReader(data))
	if err != nil {
		t.Fatalf("result is not a decodable WebP: %v", err)
	}
	return img
}

func TestProcessConvertsHEICToWebP(t *testing.T) {
	t.Skip("TODO(heic): needs the HEIC decoder (internal/imaging/heic.go); unskip when it lands")
	res, err := Process(bytes.NewReader(fixture(t, "pantry-128x96.heic")))
	if err != nil {
		t.Fatalf("Process(HEIC) = %v, want a converted image", err)
	}
	if !isWebP(res.WebP) || res.Width != 128 || res.Height != 96 {
		t.Fatalf("got webp=%v %dx%d, want a 128x96 WebP", isWebP(res.WebP), res.Width, res.Height)
	}
	img := decodeWebP(t, res.WebP)
	if !isRed(img.At(20, 48)) {
		t.Errorf("left half = %v, want red", img.At(20, 48))
	}
	if !isBlue(img.At(100, 48)) {
		t.Errorf("right half = %v, want blue", img.At(100, 48))
	}
}

func TestProcessDataURLAcceptsHEICAndHEIFDeclaredTypes(t *testing.T) {
	t.Skip("TODO(heic): needs the HEIC decoder (internal/imaging/heic.go); unskip when it lands")
	heic := fixture(t, "pantry-128x96.heic")
	for _, mime := range []string{"image/heic", "image/heif"} {
		res, err := ProcessDataURL(dataURL(mime, heic))
		if err != nil || res.Width != 128 || res.Height != 96 {
			t.Errorf("%s: got %dx%d, %v; want 128x96", mime, res.Width, res.Height, err)
		}
	}
}

func TestProcessDataURLHEICDeclaredTypeMustAgreeWithTheBytes(t *testing.T) {
	heic := fixture(t, "pantry-128x96.heic")
	if _, err := ProcessDataURL(dataURL("image/png", heic)); !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("HEIC bytes declared as PNG: got %v, want ErrUnsupportedFormat", err)
	}
	if _, err := ProcessDataURL(dataURL("image/heic", pngBytes(t, 8, 8))); !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("PNG bytes declared as HEIC: got %v, want ErrUnsupportedFormat", err)
	}
	if _, err := ProcessDataURL(dataURL("image/heic", sidewaysJPEG(t, 6, false))); !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("JPEG bytes declared as HEIC: got %v, want ErrUnsupportedFormat", err)
	}
}

func TestProcessRefusesBrokenAndLookAlikeHEIC(t *testing.T) {
	heic := fixture(t, "pantry-128x96.heic")
	ftyp := func(brand string) []byte {
		return append([]byte{0, 0, 0, 24, 'f', 't', 'y', 'p'}, []byte(brand+"\x00\x00\x00\x00"+brand+"mif1")...)
	}
	tests := map[string][]byte{
		"truncated file":         heic[:200],
		"header only":            heic[:40],
		"ftyp heic then garbage": append(ftyp("heic"), bytes.Repeat([]byte{0xAB}, 500)...),
		"AVIF is not accepted":   append(ftyp("avif"), bytes.Repeat([]byte{0xAB}, 500)...),
		"MP4 video":              append(ftyp("isom"), bytes.Repeat([]byte{0xAB}, 500)...),
	}
	for name, data := range tests {
		if _, err := Process(bytes.NewReader(data)); !errors.Is(err, ErrUnsupportedFormat) {
			t.Errorf("%s: got %v, want ErrUnsupportedFormat", name, err)
		}
	}
}

func TestHEICHasTheSameLimitsAsEveryOtherFormat(t *testing.T) {
	t.Skip("TODO(heic): needs the HEIC decoder (internal/imaging/heic.go); unskip when it lands")
	if _, err := Process(bytes.NewReader(fixture(t, "too-wide-12100x64.heic"))); !errors.Is(err, ErrTooManyPixels) {
		t.Errorf("a 12100 px wide HEIC: got %v, want ErrTooManyPixels (refused from the header, before a full decode)", err)
	}
	big := append(fixture(t, "pantry-128x96.heic"), make([]byte, MaxBytes)...)
	if _, err := Process(bytes.NewReader(big)); !errors.Is(err, ErrTooLarge) {
		t.Errorf("a HEIC over 8 MB: got %v, want ErrTooLarge", err)
	}
}
