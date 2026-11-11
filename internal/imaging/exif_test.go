package imaging

import (
	"bytes"
	"encoding/binary"
	"image"
	"image/color"
	"image/jpeg"
	"testing"
)

// The server applies the EXIF Orientation tag (1..8) of a JPEG before scaling and storing, so phone photos are
// upright and Result.Width/Height are the upright size. The test picture is 64x32, white, with a 16x16 red
// marker in its top-left corner; after the correct transform the marker must sit in the expected corner.

func isRed(c color.Color) bool {
	r, g, b, _ := c.RGBA()
	return r>>8 > 170 && g>>8 < 90 && b>>8 < 90
}

func isBlue(c color.Color) bool {
	r, g, b, _ := c.RGBA()
	return b>>8 > 170 && r>>8 < 90 && g>>8 < 90
}

// markedJPEG is w x h, white, with a 16x16 red square at the top-left, saved as JPEG q95.
func markedJPEG(t *testing.T, w, h int) []byte {
	t.Helper()
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if x < 16 && y < 16 {
				img.Set(x, y, color.RGBA{R: 255, A: 255})
			} else {
				img.Set(x, y, color.RGBA{R: 255, G: 255, B: 255, A: 255})
			}
		}
	}
	var b bytes.Buffer
	if err := jpeg.Encode(&b, img, &jpeg.Options{Quality: 95}); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

// exifSegment builds an APP1 Exif segment holding only the Orientation tag.
func exifSegment(orientation uint16, littleEndian bool) []byte {
	var order interface {
		binary.ByteOrder
		binary.AppendByteOrder
	} = binary.BigEndian
	head := []byte("MM")
	if littleEndian {
		order, head = binary.LittleEndian, []byte("II")
	}
	tiff := append([]byte{}, head...)
	tiff = order.AppendUint16(tiff, 42)
	tiff = order.AppendUint32(tiff, 8) // offset of the first IFD
	tiff = order.AppendUint16(tiff, 1) // one entry
	tiff = order.AppendUint16(tiff, 0x0112)
	tiff = order.AppendUint16(tiff, 3) // SHORT
	tiff = order.AppendUint32(tiff, 1)
	tiff = order.AppendUint16(tiff, orientation)
	tiff = append(tiff, 0, 0)          // padding of the 4-byte value field
	tiff = order.AppendUint32(tiff, 0) // no next IFD
	payload := append([]byte("Exif\x00\x00"), tiff...)
	seg := []byte{0xFF, 0xE1}
	seg = binary.BigEndian.AppendUint16(seg, uint16(len(payload)+2))
	return append(seg, payload...)
}

func withSegment(jpg, seg []byte) []byte {
	out := append([]byte{}, jpg[:2]...) // SOI
	out = append(out, seg...)
	return append(out, jpg[2:]...)
}

// sidewaysJPEG is the 64x32 marked picture with an Orientation tag.
func sidewaysJPEG(t *testing.T, orientation uint16, littleEndian bool) []byte {
	t.Helper()
	return withSegment(markedJPEG(t, 64, 32), exifSegment(orientation, littleEndian))
}

type corner int

const (
	topLeft corner = iota
	topRight
	bottomLeft
	bottomRight
)

func centreOf(c corner, w, h int) (int, int) {
	x, y := 8, 8
	if c == topRight || c == bottomRight {
		x = w - 8
	}
	if c == bottomLeft || c == bottomRight {
		y = h - 8
	}
	return x, y
}

// wantMarker checks the size and that the red marker is in exactly the expected corner.
func wantMarker(t *testing.T, label string, res Result, w, h int, c corner) {
	t.Helper()
	if res.Width != w || res.Height != h {
		t.Errorf("%s: Result is %dx%d, want %dx%d", label, res.Width, res.Height, w, h)
	}
	img := decodeWebP(t, res.WebP)
	if b := img.Bounds(); b.Dx() != w || b.Dy() != h {
		t.Errorf("%s: WebP is %dx%d, want %dx%d", label, b.Dx(), b.Dy(), w, h)
		return
	}
	for _, other := range []corner{topLeft, topRight, bottomLeft, bottomRight} {
		x, y := centreOf(other, w, h)
		if got := isRed(img.At(x, y)); got != (other == c) {
			t.Errorf("%s: red at corner %d = %v, want the marker only in corner %d", label, other, got, c)
		}
	}
}

func TestProcessAppliesEveryEXIFOrientation(t *testing.T) {
	tests := []struct {
		orientation uint16
		w, h        int
		marker      corner
		name        string
	}{
		{1, 64, 32, topLeft, "normal"},
		{2, 64, 32, topRight, "mirrored horizontally"},
		{3, 64, 32, bottomRight, "turned 180"},
		{4, 64, 32, bottomLeft, "mirrored vertically"},
		{5, 32, 64, topLeft, "transposed"},
		{6, 32, 64, topRight, "turned 90 clockwise"},
		{7, 32, 64, bottomRight, "transversed"},
		{8, 32, 64, bottomLeft, "turned 90 counter-clockwise"},
	}
	for _, tc := range tests {
		res, err := Process(bytes.NewReader(sidewaysJPEG(t, tc.orientation, false)))
		if err != nil {
			t.Errorf("orientation %d (%s): %v", tc.orientation, tc.name, err)
			continue
		}
		wantMarker(t, tc.name, res, tc.w, tc.h, tc.marker)
	}
}

func TestEXIFLittleEndianIsRead(t *testing.T) {
	res, err := Process(bytes.NewReader(sidewaysJPEG(t, 6, true)))
	if err != nil {
		t.Fatal(err)
	}
	wantMarker(t, "II byte order", res, 32, 64, topRight)
}

func TestEXIFOrientationFromARealCameraStyleFile(t *testing.T) {
	// testdata/sideways-6.jpg was written by ImageMagick (JFIF APP0 first, then the Exif APP1, orientation 6).
	res, err := Process(bytes.NewReader(fixture(t, "sideways-6.jpg")))
	if err != nil {
		t.Fatal(err)
	}
	wantMarker(t, "sideways-6.jpg", res, 32, 64, topRight)
}

func TestEXIFRotationHappensBeforeScaling(t *testing.T) {
	// 2000x400 stored, orientation 6: upright it is 400x2000, so the long edge is scaled to 1600 -> 320x1600.
	wide := withSegment(markedJPEG(t, 2000, 400), exifSegment(6, false))
	res, err := Process(bytes.NewReader(wide))
	if err != nil {
		t.Fatal(err)
	}
	if res.Width != 320 || res.Height != 1600 {
		t.Fatalf("got %dx%d, want 320x1600", res.Width, res.Height)
	}
	if b := decodeWebP(t, res.WebP).Bounds(); b.Dx() != 320 || b.Dy() != 1600 {
		t.Errorf("WebP is %dx%d, want 320x1600", b.Dx(), b.Dy())
	}
}

// app1 wraps a payload in a well-formed APP1 segment, so the JPEG stays valid whatever the payload says.
func app1(payload []byte) []byte {
	seg := []byte{0xFF, 0xE1}
	seg = binary.BigEndian.AppendUint16(seg, uint16(len(payload)+2))
	return append(seg, payload...)
}

func TestMissingOrBrokenEXIFLeavesThePictureAsItIs(t *testing.T) {
	exif := []byte("Exif\x00\x00")
	tiff := func(rest ...byte) []byte { return app1(append(append([]byte{}, exif...), rest...)) }
	tests := map[string][]byte{
		"no EXIF at all":             markedJPEG(t, 64, 32),
		"orientation 1":              sidewaysJPEG(t, 1, false),
		"orientation 0":              sidewaysJPEG(t, 0, false),
		"orientation 9":              sidewaysJPEG(t, 9, false),
		"orientation 65535":          sidewaysJPEG(t, 65535, false),
		"empty Exif payload":         withSegment(markedJPEG(t, 64, 32), app1(exif)),
		"TIFF header only":           withSegment(markedJPEG(t, 64, 32), tiff('M', 'M', 0, 42, 0, 0, 0, 8)),
		"unknown byte order":         withSegment(markedJPEG(t, 64, 32), tiff('X', 'X', 0, 42, 0, 0, 0, 8, 0, 1)),
		"IFD offset beyond the data": withSegment(markedJPEG(t, 64, 32), tiff('M', 'M', 0, 42, 0xFF, 0xFF, 0xFF, 0xFF)),
		"IFD count beyond the data":  withSegment(markedJPEG(t, 64, 32), tiff('M', 'M', 0, 42, 0, 0, 0, 8, 0xFF, 0xFF, 1, 0x12)),
		"an APP1 that is not Exif":   withSegment(markedJPEG(t, 64, 32), app1([]byte("http://ns.adobe.com/xap/1.0/\x00<x/>"))),
	}
	for name, data := range tests {
		res, err := Process(bytes.NewReader(data))
		if err != nil {
			t.Errorf("%s: %v, want the picture processed unrotated", name, err)
			continue
		}
		wantMarker(t, name, res, 64, 32, topLeft)
	}
}

func TestEXIFOnlyAffectsJPEG(t *testing.T) {
	// A PNG has no Orientation: pixels are used as stored.
	res, err := Process(bytes.NewReader(pngBytes(t, 64, 32)))
	if err != nil || res.Width != 64 || res.Height != 32 {
		t.Fatalf("got %dx%d, %v; want 64x32", res.Width, res.Height, err)
	}
}
