package imaging

import (
	"bytes"
	"compress/zlib"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"hash/crc32"
	"image"
	"image/color"
	"image/gif"
	"image/jpeg"
	"image/png"
	"io"
	"runtime"
	"strings"
	"testing"
	"time"

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

func TestProcessAcceptsJPEGAndWebP(t *testing.T) {
	var j bytes.Buffer
	if err := jpeg.Encode(&j, solid(64, 32), nil); err != nil {
		t.Fatal(err)
	}
	first, err := Process(bytes.NewReader(pngBytes(t, 40, 30)))
	if err != nil {
		t.Fatal(err)
	}
	for name, data := range map[string][]byte{"jpeg": j.Bytes(), "webp": first.WebP} {
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

func gifBytes(t *testing.T) []byte {
	t.Helper()
	var g bytes.Buffer
	pal := image.NewPaletted(image.Rect(0, 0, 20, 10), color.Palette{color.Black, color.White})
	if err := gif.Encode(&g, pal, nil); err != nil {
		t.Fatal(err)
	}
	return g.Bytes()
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

// bombPNG builds a tiny, valid-looking PNG whose IHDR declares w x h pixels
// (1-bit grey, so the declared size is the only thing that is large). The
// pixel data is a few zlib-compressed bytes: a full decode would first
// allocate for w x h.
func bombPNG(t *testing.T, w, h int) []byte {
	t.Helper()
	var out bytes.Buffer
	out.WriteString("\x89PNG\r\n\x1a\n")
	chunk := func(kind string, data []byte) {
		var n [4]byte
		binary.BigEndian.PutUint32(n[:], uint32(len(data)))
		out.Write(n[:])
		out.WriteString(kind)
		out.Write(data)
		var c [4]byte
		binary.BigEndian.PutUint32(c[:], crc32.ChecksumIEEE(append([]byte(kind), data...)))
		out.Write(c[:])
	}
	ihdr := make([]byte, 13)
	binary.BigEndian.PutUint32(ihdr[0:], uint32(w))
	binary.BigEndian.PutUint32(ihdr[4:], uint32(h))
	ihdr[8], ihdr[9] = 1, 0 // bit depth 1, colour type 0 (grey)
	chunk("IHDR", ihdr)
	var z bytes.Buffer
	zw := zlib.NewWriter(&z)
	if _, err := zw.Write(make([]byte, 64)); err != nil {
		t.Fatal(err)
	}
	zw.Close()
	chunk("IDAT", z.Bytes())
	chunk("IEND", nil)
	return out.Bytes()
}

func TestProcessRefusesDecompressionBombsBeforeDecoding(t *testing.T) {
	cases := map[string][2]int{
		"30000x30000 (900 MP)":          {30000, 30000},
		"longest side 12001":            {12001, 10},
		"tall 10x12001":                 {10, 12001},
		"7100x7100 (50.4 MP, sides ok)": {7100, 7100},
	}
	for name, dim := range cases {
		data := bombPNG(t, dim[0], dim[1])
		if len(data) > 1024 {
			t.Fatalf("test PNG should be tiny, is %d bytes", len(data))
		}
		var before, after runtime.MemStats
		runtime.ReadMemStats(&before)
		start := time.Now()
		_, err := Process(bytes.NewReader(data))
		elapsed := time.Since(start)
		runtime.ReadMemStats(&after)
		if !errors.Is(err, ErrTooManyPixels) {
			t.Errorf("%s: %v, want ErrTooManyPixels", name, err)
		}
		if elapsed > time.Second {
			t.Errorf("%s: took %v, want a fast refusal", name, elapsed)
		}
		if grown := after.TotalAlloc - before.TotalAlloc; grown > 32<<20 {
			t.Errorf("%s: allocated %d MB before refusing", name, grown>>20)
		}
	}
}

func TestProcessAcceptsImagesAtTheCaps(t *testing.T) {
	// 12000 px wide is allowed (the cap is "above"); 12000x4000 = 48 MP is under 50 MP.
	// A real decode of that would be heavy, so only the cap check is exercised: the
	// bomb PNG passes the cap and then fails to decode as unsupported/corrupt.
	_, err := Process(bytes.NewReader(bombPNG(t, 12000, 4000)))
	if errors.Is(err, ErrTooManyPixels) {
		t.Errorf("12000x4000 is within the caps, got %v", err)
	}
}

func dataURL(mime string, data []byte) string {
	return "data:" + mime + ";base64," + base64.StdEncoding.EncodeToString(data)
}

func TestProcessDataURLDeclaredType(t *testing.T) {
	var j bytes.Buffer
	if err := jpeg.Encode(&j, solid(20, 10), nil); err != nil {
		t.Fatal(err)
	}
	png1 := pngBytes(t, 20, 10)
	ok := map[string]string{
		"png":  dataURL("image/png", png1),
		"jpeg": dataURL("image/jpeg", j.Bytes()),
	}
	for name, u := range ok {
		if res, err := ProcessDataURL(u); err != nil || !isWebP(res.WebP) {
			t.Errorf("%s: %v", name, err)
		}
	}
	webpRes, err := Process(bytes.NewReader(png1))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := ProcessDataURL(dataURL("image/webp", webpRes.WebP)); err != nil {
		t.Errorf("webp: %v", err)
	}
	bad := map[string]string{
		"PNG declared as jpeg": dataURL("image/jpeg", png1),
		"JPEG declared as png": dataURL("image/png", j.Bytes()),
		"WebP declared as png": dataURL("image/png", webpRes.WebP),
		"gif declared as gif":  dataURL("image/gif", gifBytes(t)),
		"gif declared as png":  dataURL("image/png", gifBytes(t)),
		"svg type":             dataURL("image/svg+xml", []byte("<svg/>")),
		"no type":              dataURL("", png1),
	}
	for name, u := range bad {
		if _, err := ProcessDataURL(u); !errors.Is(err, ErrUnsupportedFormat) {
			t.Errorf("%s: %v, want ErrUnsupportedFormat", name, err)
		}
	}
}

func TestProcessDataURLBombIsTooManyPixels(t *testing.T) {
	if _, err := ProcessDataURL(dataURL("image/png", bombPNG(t, 30000, 30000))); !errors.Is(err, ErrTooManyPixels) {
		t.Errorf("got %v, want ErrTooManyPixels", err)
	}
}

func TestProcessRefusesGIF(t *testing.T) {
	if _, err := Process(bytes.NewReader(gifBytes(t))); !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("gif: %v, want ErrUnsupportedFormat", err)
	}
}
