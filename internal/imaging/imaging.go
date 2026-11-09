// Package imaging turns an uploaded photo into the stored form: decoded,
// shrunk so the longest side is at most MaxSide pixels, re-encoded as WebP
// (pure Go, github.com/HugoSmits86/nativewebp). It also keeps the resulting
// files under FEEDER_DATA_DIR/images. No net/http.
package imaging

import (
	"errors"
	"io"
)

// Limits.
const (
	MaxSide  = 1600
	MaxBytes = 8 << 20 // upload size limit (8 MB, as for Recipe File data URLs)
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
func ScaledSize(w, h, max int) (int, int) { panic("TODO") }

// Process reads at most MaxBytes (+1 to detect overflow) from r, decodes a
// JPEG, PNG, GIF (first frame) or WebP, scales it with ScaledSize(…, MaxSide)
// using a high-quality filter, and encodes lossless WebP. Errors:
// ErrEmpty, ErrTooLarge, ErrUnsupportedFormat. EXIF orientation is not applied
// in v1 (recorded in the design note).
func Process(r io.Reader) (Result, error) { panic("TODO") }

// ErrNotFound is returned by Store.Open.
var ErrNotFound = errors.New("image not found")
