package imaging

import (
	"bytes"
	"encoding/binary"
	"image"
)

// jpegOrientation returns the EXIF Orientation (1..8) of a JPEG, or 1 ("as stored") when there is none or the
// data is not trustworthy. It never fails and never panics: every offset and count is bounds-checked.
func jpegOrientation(data []byte) int {
	if len(data) < 4 || data[0] != 0xFF || data[1] != 0xD8 {
		return 1
	}
	i := 2
	for i+4 <= len(data) {
		if data[i] != 0xFF {
			return 1
		}
		for i < len(data) && data[i] == 0xFF { // fill bytes
			i++
		}
		if i >= len(data) {
			return 1
		}
		marker := data[i]
		i++
		if marker == 0xDA || marker == 0xD9 { // SOS / EOI: no metadata after this
			return 1
		}
		if marker == 0x01 || (marker >= 0xD0 && marker <= 0xD7) { // no length
			continue
		}
		if i+2 > len(data) {
			return 1
		}
		n := int(binary.BigEndian.Uint16(data[i:]))
		if n < 2 || i+n > len(data) {
			return 1
		}
		payload := data[i+2 : i+n]
		i += n
		if marker == 0xE1 && bytes.HasPrefix(payload, []byte("Exif\x00\x00")) {
			return tiffOrientation(payload[6:])
		}
	}
	return 1
}

func tiffOrientation(t []byte) int {
	if len(t) < 8 {
		return 1
	}
	var o binary.ByteOrder
	switch string(t[:2]) {
	case "II":
		o = binary.LittleEndian
	case "MM":
		o = binary.BigEndian
	default:
		return 1
	}
	if o.Uint16(t[2:]) != 42 {
		return 1
	}
	ifd := int64(o.Uint32(t[4:]))
	if ifd+2 > int64(len(t)) {
		return 1
	}
	count := int64(o.Uint16(t[ifd:]))
	for k := int64(0); k < count; k++ {
		e := ifd + 2 + k*12
		if e+12 > int64(len(t)) {
			return 1
		}
		if o.Uint16(t[e:]) != 0x0112 {
			continue
		}
		if o.Uint16(t[e+2:]) != 3 || o.Uint32(t[e+4:]) != 1 { // SHORT, one value
			return 1
		}
		if v := int(o.Uint16(t[e+8:])); v >= 1 && v <= 8 {
			return v
		}
		return 1
	}
	return 1
}

// swapsAxes reports whether the orientation turns the picture by 90 degrees (width and height trade places).
func swapsAxes(orientation int) bool { return orientation >= 5 && orientation <= 8 }

// orient returns src turned and mirrored upright for an EXIF orientation 2..8 (1 returns src).
func orient(src image.Image, orientation int) image.Image {
	if orientation < 2 || orientation > 8 {
		return src
	}
	b := src.Bounds()
	sw, sh := b.Dx(), b.Dy()
	dw, dh := sw, sh
	if swapsAxes(orientation) {
		dw, dh = sh, sw
	}
	dst := image.NewRGBA(image.Rect(0, 0, dw, dh))
	for y := 0; y < dh; y++ {
		for x := 0; x < dw; x++ {
			var sx, sy int
			switch orientation {
			case 2:
				sx, sy = sw-1-x, y
			case 3:
				sx, sy = sw-1-x, sh-1-y
			case 4:
				sx, sy = x, sh-1-y
			case 5:
				sx, sy = y, x
			case 6:
				sx, sy = y, sh-1-x
			case 7:
				sx, sy = sw-1-y, sh-1-x
			case 8:
				sx, sy = sw-1-y, x
			}
			dst.Set(x, y, src.At(b.Min.X+sx, b.Min.Y+sy))
		}
	}
	return dst
}
