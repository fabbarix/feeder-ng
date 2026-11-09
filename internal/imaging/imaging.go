// Package imaging turns an uploaded photo into the stored form: decoded,
// shrunk so the longest side is at most MaxSide pixels, re-encoded as WebP
// (pure Go, github.com/HugoSmits86/nativewebp). It also keeps the resulting
// files under FEEDER_DATA_DIR/images. No net/http.
package imaging

import (
	"bytes"
	"encoding/base64"
	"errors"
	"image"
	_ "image/gif" // decoders for the accepted formats
	_ "image/jpeg"
	_ "image/png"
	"io"
	"math"
	"strings"

	"github.com/HugoSmits86/nativewebp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/webp"
)

// Limits.
const (
	MaxSide      = 1600
	MaxBytes     = 8 << 20  // upload size limit (8 MB, as for Recipe File data URLs)
	MaxBodyBytes = 16 << 20 // request body that carries a data URL of at most MaxBytes
)

// Errors.
var (
	ErrUnsupportedFormat = errors.New("unsupported or corrupt image") // not JPEG, PNG, GIF or WebP, or undecodable
	ErrTooLarge          = errors.New("image larger than 8 MB")
	ErrEmpty             = errors.New("empty image")
)

// Result is a processed image.
type Result struct {
	WebP          []byte
	Width, Height int
}

// ScaledSize returns the size that fits w x h inside max x max keeping the
// aspect ratio: unchanged when the longest side is already <= max (never
// upscales), otherwise the longest side becomes max and the other is rounded
// to the nearest pixel, at least 1.
func ScaledSize(w, h, max int) (int, int) {
	if w <= max && h <= max {
		return w, h
	}
	if w >= h {
		return max, clampMin1(int(math.Round(float64(h) * float64(max) / float64(w))))
	}
	return clampMin1(int(math.Round(float64(w) * float64(max) / float64(h)))), max
}

func clampMin1(n int) int {
	if n < 1 {
		return 1
	}
	return n
}

// Process reads at most MaxBytes (+1 to detect overflow) from r, decodes a
// JPEG, PNG, GIF (first frame) or WebP, scales it with ScaledSize(…, MaxSide)
// using a high-quality filter, and encodes lossless WebP. Errors:
// ErrEmpty, ErrTooLarge, ErrUnsupportedFormat. EXIF orientation is not applied
// in v1 (recorded in the design note).
func Process(r io.Reader) (Result, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxBytes+1))
	if err != nil {
		return Result{}, ErrUnsupportedFormat
	}
	if len(data) == 0 {
		return Result{}, ErrEmpty
	}
	if len(data) > MaxBytes {
		return Result{}, ErrTooLarge
	}
	src, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return Result{}, ErrUnsupportedFormat
	}
	b := src.Bounds()
	w, h := ScaledSize(b.Dx(), b.Dy(), MaxSide)
	img := src
	if w != b.Dx() || h != b.Dy() {
		dst := image.NewRGBA(image.Rect(0, 0, w, h))
		draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
		img = dst
	}
	var out bytes.Buffer
	if err := nativewebp.Encode(&out, img, nil); err != nil {
		return Result{}, ErrUnsupportedFormat
	}
	return Result{WebP: out.Bytes(), Width: w, Height: h}, nil
}

// ProcessDataURL decodes a data URL (`data:<type>;base64,<payload>`, the form
// of the Recipe File and of the upload API) and processes it with Process.
// Anything that is not a base64 data URL is ErrUnsupportedFormat.
func ProcessDataURL(dataURL string) (Result, error) {
	const marker = ";base64,"
	i := strings.Index(dataURL, marker)
	if !strings.HasPrefix(dataURL, "data:") || i < 0 {
		return Result{}, ErrUnsupportedFormat
	}
	raw, err := base64.StdEncoding.DecodeString(dataURL[i+len(marker):])
	if err != nil {
		return Result{}, ErrUnsupportedFormat
	}
	if len(raw) > MaxBytes {
		return Result{}, ErrTooLarge
	}
	return Process(bytes.NewReader(raw))
}

// ErrNotFound is returned by Store.Open.
var ErrNotFound = errors.New("image not found")
