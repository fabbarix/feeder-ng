// Package receipttest holds fixtures shared by the receipt read tests (service, httpapi, bdd): model answers in the
// receipt output schema and a synthetic receipt image. It is for tests only; no production package imports it.
package receipttest

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"image"
	"image/color"
	"image/draw"
	"image/jpeg"
	"image/png"

	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/math/fixed"
)

// Line is one answer line with every field at its sentinel, then the overrides applied.
func Line(over map[string]any) map[string]any {
	l := map[string]any{"row": -1, "text": "", "count": 0, "grams": 0, "priceCents": -1, "unitPriceCents": -1,
		"perKgCents": -1, "name": "", "packSize": 0, "packUnit": ""}
	for k, v := range over {
		l[k] = v
	}
	return l
}

// Answer is the model's answer text (a readable receipt) for the given lines.
func Answer(shopName, date string, totalCents int, lines ...map[string]any) string {
	if lines == nil {
		lines = []map[string]any{}
	}
	b, _ := json.Marshal(map[string]any{"readable": true, "shopName": shopName, "date": date, "totalCents": totalCents, "lines": lines})
	return string(b)
}

// Unreadable is the answer for photos that show no receipt.
func Unreadable() string {
	return `{"readable":false,"shopName":"","date":"","totalCents":-1,"lines":[]}`
}

// JPEG is a small gradient JPEG (not a receipt: for tests that only need a valid photo).
func JPEG(w, h int) []byte {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			img.Set(x, y, color.RGBA{R: uint8(x * 255 / w), G: uint8(y * 255 / h), B: 120, A: 255})
		}
	}
	var b bytes.Buffer
	_ = jpeg.Encode(&b, img, &jpeg.Options{Quality: 85})
	return b.Bytes()
}

// JPEGDataURL is JPEG(w, h) as a data URL, the photo shape of POST /api/scan/receipt/reads.
func JPEGDataURL(w, h int) string {
	return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(JPEG(w, h))
}

// ReceiptPNG draws the lines as black text on white, one per row, scaled 3x so a model can read it. No fonts are
// downloaded: it uses the basic bitmap face in golang.org/x/image.
func ReceiptPNG(lines []string) []byte {
	const scale, lineH, pad = 3, 13, 12
	face := basicfont.Face7x13
	wide := 0
	for _, l := range lines {
		if n := len(l) * 7; n > wide {
			wide = n
		}
	}
	small := image.NewRGBA(image.Rect(0, 0, wide+2*pad, len(lines)*lineH+2*pad))
	draw.Draw(small, small.Bounds(), image.NewUniform(color.White), image.Point{}, draw.Src)
	d := font.Drawer{Dst: small, Src: image.NewUniform(color.Black), Face: face}
	for i, l := range lines {
		d.Dot = fixed.P(pad, pad+(i+1)*lineH-3)
		d.DrawString(l)
	}
	big := image.NewRGBA(image.Rect(0, 0, small.Bounds().Dx()*scale, small.Bounds().Dy()*scale))
	for y := 0; y < big.Bounds().Dy(); y++ {
		for x := 0; x < big.Bounds().Dx(); x++ {
			big.Set(x, y, small.At(x/scale, y/scale))
		}
	}
	var b bytes.Buffer
	_ = png.Encode(&b, big)
	return b.Bytes()
}

// ReceiptPNGDataURL is ReceiptPNG as a data URL.
func ReceiptPNGDataURL(lines []string) string {
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(ReceiptPNG(lines))
}
