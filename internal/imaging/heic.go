package imaging

import (
	"bytes"
	"fmt"
	"image"
)

// HEIC/HEIF support lives in this one file so the decoder can be swapped in one place. The approved decoder is
// github.com/gen2brain/heic (libheif compiled to WebAssembly, run by wazero: no cgo, so the static build and the
// distroless image stay as they are). It is NOT in go.mod yet: until it is added, decodeHEIC and heicConfig
// return ErrHEICUnavailable, which is an ErrUnsupportedFormat, so HEIC uploads are refused with a clear reason.

// ErrHEICUnavailable is returned while no HEIC decoder is linked in. errors.Is(err, ErrUnsupportedFormat) holds.
var ErrHEICUnavailable = fmt.Errorf("%w: HEIC not available on this server", ErrUnsupportedFormat)

// heicSlots limits concurrent HEIC decodes (WASM decoding is slow and memory-hungry).
var heicSlots = make(chan struct{}, 2)

var heicBrands = map[string]bool{"heic": true, "heix": true, "hevc": true, "hevx": true, "heim": true, "heis": true, "hevm": true, "hevs": true}

// isHEIC reports whether data starts with an ISO-BMFF "ftyp" box of a HEIC brand: the major brand is a HEIC one,
// or it is mif1/msf1 with a HEIC compatible brand. AVIF, MP4 and everything else are not HEIC.
func isHEIC(data []byte) bool {
	if len(data) < 16 || !bytes.Equal(data[4:8], []byte("ftyp")) {
		return false
	}
	size := int(uint32(data[0])<<24 | uint32(data[1])<<16 | uint32(data[2])<<8 | uint32(data[3]))
	if size < 16 || size > len(data) {
		size = min(len(data), 256)
	}
	major := string(data[8:12])
	if heicBrands[major] {
		return true
	}
	if major != "mif1" && major != "msf1" {
		return false
	}
	for p := 16; p+4 <= size; p += 4 {
		if heicBrands[string(data[p:p+4])] {
			return true
		}
	}
	return false
}

// heicConfig reads only the header: the size of the picture, before any decode.
func heicConfig(data []byte) (image.Config, error) {
	return image.Config{}, ErrHEICUnavailable
}

// decodeHEIC decodes the first picture, with the HEIC's own rotation applied. It holds a decode slot.
func decodeHEIC(data []byte) (image.Image, error) {
	heicSlots <- struct{}{}
	defer func() { <-heicSlots }()
	return nil, ErrHEICUnavailable
}
