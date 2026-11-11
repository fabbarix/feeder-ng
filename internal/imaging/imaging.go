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
	_ "image/jpeg" // decoders for the accepted formats (JPEG, PNG, WebP)
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

	// Decompression-bomb caps, checked with image.DecodeConfig before any full decode:
	// refused when the longest side exceeds MaxSidePixels or width*height exceeds MaxPixels.
	MaxSidePixels = 12000
	MaxPixels     = 50_000_000
)

// Errors.
var (
	ErrUnsupportedFormat = errors.New("unsupported or corrupt image") // not JPEG, PNG, WebP or HEIC, not the declared type, or undecodable
	ErrTooLarge          = errors.New("image larger than 8 MB")
	ErrEmpty             = errors.New("empty image")
	ErrTooManyPixels     = errors.New("image dimensions too large") // decompression-bomb guard, see MaxSidePixels and MaxPixels
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

// acceptedFormats maps the image.DecodeConfig format names we accept to their declared MIME types.
var acceptedFormats = map[string]string{"jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "heic": "image/heic"}

// Process reads at most MaxBytes (+1 to detect overflow) from r and processes
// it as processBytes does with no declared type. Errors: ErrEmpty, ErrTooLarge,
// ErrUnsupportedFormat, ErrTooManyPixels.
func Process(r io.Reader) (Result, error) {
	data, err := io.ReadAll(io.LimitReader(r, MaxBytes+1))
	if err != nil {
		return Result{}, ErrUnsupportedFormat
	}
	return processBytes(data, "")
}

// processBytes decodes, shrinks to MaxSide and encodes lossless WebP (see decodeUpright for the checks).
func processBytes(data []byte, declared string) (Result, error) {
	img, w, h, err := decodeUpright(data, declared, MaxSide)
	if err != nil {
		return Result{}, err
	}
	var out bytes.Buffer
	if err := nativewebp.Encode(&out, img, nil); err != nil {
		return Result{}, ErrUnsupportedFormat
	}
	return Result{WebP: out.Bytes(), Width: w, Height: h}, nil
}

// decodeUpright checks the size, then reads only the header (image.DecodeConfig) to refuse unsupported formats,
// a format that differs from declared (when declared is not empty) and decompression bombs, before the full
// decode. It scales the image with ScaledSize(…, maxSide) using a high-quality filter and applies a JPEG's EXIF
// orientation (exif.go); HEIC/HEIF goes through heic.go. The result is upright and w x h in size.
func decodeUpright(data []byte, declared string, maxSide int) (image.Image, int, int, error) {
	if len(data) == 0 {
		return nil, 0, 0, ErrEmpty
	}
	if len(data) > MaxBytes {
		return nil, 0, 0, ErrTooLarge
	}
	var (
		cfg    image.Config
		format string
		err    error
	)
	if isHEIC(data) {
		format = "heic"
		if declared != "" && format != declared {
			return nil, 0, 0, ErrUnsupportedFormat
		}
		if cfg, err = heicConfig(data); err != nil {
			return nil, 0, 0, err
		}
	} else {
		cfg, format, err = image.DecodeConfig(bytes.NewReader(data))
		if err != nil {
			return nil, 0, 0, ErrUnsupportedFormat
		}
		// "heic" can be registered by the decoder package, but only isHEIC (above) lets a file in.
		if _, ok := acceptedFormats[format]; !ok || format == "heic" {
			return nil, 0, 0, ErrUnsupportedFormat
		}
	}
	if declared != "" && format != declared {
		return nil, 0, 0, ErrUnsupportedFormat
	}
	if cfg.Width > MaxSidePixels || cfg.Height > MaxSidePixels || int64(cfg.Width)*int64(cfg.Height) > MaxPixels {
		return nil, 0, 0, ErrTooManyPixels
	}
	var src image.Image
	orientation := 1
	if format == "heic" {
		// decodeHEIC applied the HEIC's own irot/imir; orientation is the EXIF fallback when it had none.
		src, orientation, err = decodeHEIC(data)
	} else {
		src, _, err = image.Decode(bytes.NewReader(data))
	}
	if err != nil {
		if errors.Is(err, ErrUnsupportedFormat) {
			return nil, 0, 0, err
		}
		return nil, 0, 0, ErrUnsupportedFormat
	}
	// EXIF orientation (a JPEG's, or a HEIC's when it has no irot/imir) is applied to the upright picture: the size
	// is computed for the upright shape, the stored pixels are scaled to the matching stored shape, and the small
	// result is turned.
	if format == "jpeg" {
		orientation = jpegOrientation(data)
	}
	b := src.Bounds()
	sw, sh := b.Dx(), b.Dy()
	uw, uh := sw, sh
	if swapsAxes(orientation) {
		uw, uh = sh, sw
	}
	w, h := ScaledSize(uw, uh, maxSide)
	img := src
	if scaledW, scaledH := w, h; scaledW != uw || scaledH != uh {
		if swapsAxes(orientation) {
			scaledW, scaledH = h, w
		}
		dst := image.NewRGBA(image.Rect(0, 0, scaledW, scaledH))
		draw.CatmullRom.Scale(dst, dst.Bounds(), src, b, draw.Over, nil)
		img = dst
	}
	return orient(img, orientation), w, h, nil
}

// ProcessDataURL decodes a data URL and processes it. Only
// `data:image/(jpeg|png|webp|heic|heif);base64,<payload>` is accepted (the Recipe File
// form); the format found in the bytes must match the declared type. Anything
// else is ErrUnsupportedFormat.
func ProcessDataURL(dataURL string) (Result, error) {
	const marker = ";base64,"
	i := strings.Index(dataURL, marker)
	if !strings.HasPrefix(dataURL, "data:") || i < 0 {
		return Result{}, ErrUnsupportedFormat
	}
	declared, ok := declaredFormat(dataURL[len("data:"):i])
	if !ok {
		return Result{}, ErrUnsupportedFormat
	}
	raw, err := base64.StdEncoding.DecodeString(dataURL[i+len(marker):])
	if err != nil {
		return Result{}, ErrUnsupportedFormat
	}
	return processBytes(raw, declared)
}

// declaredFormat maps a declared MIME type to its DecodeConfig format name.
func declaredFormat(mime string) (string, bool) {
	if mime == "image/heif" {
		return "heic", true
	}
	for format, m := range acceptedFormats {
		if m == mime {
			return format, true
		}
	}
	return "", false
}

// ErrNotFound is returned by Store.Open.
var ErrNotFound = errors.New("image not found")
