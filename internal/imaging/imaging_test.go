package imaging

import (
	"bytes"
	"errors"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"strings"
	"testing"

	"golang.org/x/image/webp"
)

func solid(w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x % 256), G: uint8(y % 256), B: 128, A: 255})
		}
	}
	return img
}

func pngBytes(t *testing.T, w, h int) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := png.Encode(&b, solid(w, h)); err != nil {
		t.Fatal(err)
	}
	return b.Bytes()
}

func TestScaledSize(t *testing.T) {
	tests := []struct{ w, h, max, wantW, wantH int }{
		{3200, 1600, 1600, 1600, 800},
		{1600, 1600, 1600, 1600, 1600},
		{1601, 1000, 1600, 1600, 999}, // 1000*1600/1601 = 999.37
		{800, 600, 1600, 800, 600},    // never upscales
		{1000, 4000, 1600, 400, 1600},
		{10000, 3, 1600, 1600, 1}, // the short side never drops below 1
		{1, 1, 1600, 1, 1},
	}
	for _, tc := range tests {
		w, h := ScaledSize(tc.w, tc.h, tc.max)
		if w != tc.wantW || h != tc.wantH {
			t.Errorf("ScaledSize(%d,%d,%d) = %dx%d, want %dx%d", tc.w, tc.h, tc.max, w, h, tc.wantW, tc.wantH)
		}
	}
}

func isWebP(b []byte) bool {
	return len(b) > 12 && string(b[:4]) == "RIFF" && string(b[8:12]) == "WEBP"
}

func TestProcessScalesLongestSideTo1600(t *testing.T) {
	for _, tc := range []struct{ w, h, wantW, wantH int }{
		{3200, 1600, 1600, 800},
		{1000, 4000, 400, 1600},
		{800, 600, 800, 600},
	} {
		res, err := Process(bytes.NewReader(pngBytes(t, tc.w, tc.h)))
		if err != nil {
			t.Fatalf("%dx%d: %v", tc.w, tc.h, err)
		}
		if res.Width != tc.wantW || res.Height != tc.wantH {
			t.Errorf("%dx%d -> Result %dx%d, want %dx%d", tc.w, tc.h, res.Width, res.Height, tc.wantW, tc.wantH)
		}
		if !isWebP(res.WebP) {
			t.Fatalf("%dx%d: output is not WebP", tc.w, tc.h)
		}
		cfg, err := webp.DecodeConfig(bytes.NewReader(res.WebP))
		if err != nil {
			t.Fatal(err)
		}
		if cfg.Width != tc.wantW || cfg.Height != tc.wantH {
			t.Errorf("decoded WebP is %dx%d, want %dx%d", cfg.Width, cfg.Height, tc.wantW, tc.wantH)
		}
	}
}

func TestProcessAcceptsJPEGGIFAndWebP(t *testing.T) {
	var j, g bytes.Buffer
	if err := jpeg.Encode(&j, solid(64, 32), nil); err != nil {
		t.Fatal(err)
	}
	pal := image.NewPaletted(image.Rect(0, 0, 20, 10), color.Palette{color.Black, color.White})
	if err := gif.Encode(&g, pal, nil); err != nil {
		t.Fatal(err)
	}
	first, err := Process(bytes.NewReader(pngBytes(t, 40, 30)))
	if err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string][]byte{"jpeg": j.Bytes(), "gif": g.Bytes(), "webp": first.WebP} {
		res, err := Process(bytes.NewReader(data))
		if err != nil {
			t.Errorf("%s: %v", name, err)
			continue
		}
		if !isWebP(res.WebP) || res.Width == 0 || res.Height == 0 {
			t.Errorf("%s: bad result %dx%d", name, res.Width, res.Height)
		}
	}
}

func TestProcessErrors(t *testing.T) {
	if _, err := Process(strings.NewReader("")); !errors.Is(err, ErrEmpty) {
		t.Errorf("empty: %v, want ErrEmpty", err)
	}
	if _, err := Process(strings.NewReader("<svg onload=alert(1)>")); !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("svg/text: %v, want ErrUnsupportedFormat", err)
	}
	truncated := pngBytes(t, 100, 100)[:60]
	if _, err := Process(bytes.NewReader(truncated)); !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("truncated PNG: %v, want ErrUnsupportedFormat", err)
	}
	big := io.LimitReader(zeros{}, MaxBytes+1)
	if _, err := Process(big); !errors.Is(err, ErrTooLarge) {
		t.Errorf("8 MB + 1 byte: %v, want ErrTooLarge", err)
	}
}

type zeros struct{}

func (zeros) Read(p []byte) (int, error) {
	for i := range p {
		p[i] = 0
	}
	return len(p), nil
}
