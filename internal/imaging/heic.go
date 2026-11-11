package imaging

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"image"
	"time"

	"github.com/gen2brain/h265/heic"
)

// HEIC/HEIF support lives in this one file so the decoder can be swapped in one place. The decoder is
// github.com/gen2brain/h265 (MIT, pure Go, no cgo: the static build and the distroless image stay as they are),
// adopted in docs/adr/0007-heic-decoding-with-h265.md. Nothing outside this file imports it.
//
// Guards, in the order they run (the 8 MB cap and the pixel caps are in decodeUpright):
//  1. the container is inspected before anything is decoded: a grid with more than MaxHEICTiles tiles is refused;
//  2. heic.DecodeConfig reads the picture size, then the generic pixel caps apply;
//  3. heic.Options.FrameSizeLimit bounds what a header may ask the decoder to allocate;
//  4. the decoder runs on one thread (heicThreads), so a panic reaches the recover in runHEIC;
//  5. at most two decodes run at once (heicSlots), each under a timeout (heicTimeout).
//
// A decode that times out cannot be cancelled (the library takes no context): the caller gets
// ErrHEICTimeout at once, but the decode goroutine keeps running to its end and keeps its slot until then. This is
// accepted (ADR 0007): the slot count bounds the damage to two runaway decodes, each already bounded by the
// frame-size limit and the tile cap.

// ErrHEICTimeout is returned when a HEIC took too long to convert (or when no decode slot became free in time).
// errors.Is(err, ErrUnsupportedFormat) holds.
var ErrHEICTimeout = fmt.Errorf("%w: HEIC took too long to convert", ErrUnsupportedFormat)

// ErrHEICTooManyTiles is returned for a grid of more than MaxHEICTiles tiles. errors.Is(err, ErrUnsupportedFormat) holds.
var ErrHEICTooManyTiles = fmt.Errorf("%w: HEIC grid has too many tiles", ErrUnsupportedFormat)

// Limits for HEIC.
const (
	// MaxHEICTiles bounds rows x cols of a grid picture. An iPhone photo is a grid of a few dozen tiles at most.
	MaxHEICTiles = 256
	// HEICFrameSizeLimit is heic.Options.FrameSizeLimit: the largest coded area, in pixels, a header may ask for.
	HEICFrameSizeLimit = MaxPixels
	// heicThreads is 1: with more, gen2brain/h265 starts worker goroutines (heic/grid.go, hevc/wavefront.go) that
	// have no recover, and a panic in one would kill the server. One thread decodes on the calling goroutine,
	// where runHEIC's recover covers it. Cost: about 0.7 s for 12 MP on one core (ADR 0007).
	heicThreads = 1
)

// heicTimeout is how long a request waits (for a slot, then for the decode). A variable so tests can shorten it.
var heicTimeout = 20 * time.Second

// heicSlots limits concurrent HEIC decodes (decoding is CPU- and memory-hungry).
var heicSlots = make(chan struct{}, 2)

// The library entry points, variables so tests can make them panic.
var (
	heicDecode       = heic.Decode
	heicDecodeConfig = heic.DecodeConfig
)

// heicRun is the decode itself; tests replace it to simulate slow decodes.
var heicRun = runHEIC

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

// heicOptions are the decoder options: the HEIC's own clap/irot/imir transforms applied, the frame size bounded.
func heicOptions() heic.Options {
	return heic.Options{AutoRotate: true, FrameSizeLimit: HEICFrameSizeLimit, Threads: heicThreads}
}

// heicInfo is what a container says before any picture is decoded.
type heicInfo struct {
	MaxTiles    int  // the largest number of tiles any item is assembled from (rows x cols of a grid)
	Transformed bool // the primary item carries irot or imir (rotation or mirroring), applied by AutoRotate
	// Refused: the container could not be read in full (more boxes than the reader's cap, or a malformed iref), so
	// the tile count cannot be trusted. Callers fail closed.
	Refused bool
}

// inspectHEIC reads the item references and properties of a HEIC container: no picture data is touched, and
// every offset and count is bounds-checked. Malformed metadata gives a heicInfo with Refused set (callers fail closed).
func inspectHEIC(data []byte) heicInfo {
	var info heicInfo
	// get splits boxes and notes when the reader's cap cut the list short: what lies beyond is unseen.
	get := func(b []byte) []box {
		out, capped, _ := scanBoxes(b)
		if capped {
			info.Refused = true
		}
		return out
	}
	var meta []byte
	found := false
	for _, b := range get(data) {
		if b.typ == "meta" {
			meta, found = b.body, true
			break
		}
	}
	if !found || len(meta) < 4 {
		return info
	}
	children := get(meta[4:]) // meta is a full box: 4 bytes of version and flags
	var primary uint32
	havePrimary := false
	for _, b := range children {
		switch b.typ {
		case "pitm":
			if len(b.body) >= 6 {
				if b.body[0] == 0 {
					primary, havePrimary = uint32(binary.BigEndian.Uint16(b.body[4:])), true
				} else if len(b.body) >= 8 {
					primary, havePrimary = binary.BigEndian.Uint32(b.body[4:]), true
				}
			}
		case "iref":
			// Every iref counts, the largest wins: a decoy iref must not lower what another one claims.
			n, ok := maxDerivedFrom(b.body)
			info.MaxTiles = max(info.MaxTiles, n)
			if !ok {
				info.Refused = true
			}
		}
	}
	if havePrimary {
		info.Transformed = primaryTransformed(children, primary, get)
	}
	return info
}

// maxDerivedFrom returns the largest number of "dimg" references any one item makes (iref is a full box), and
// whether the iref was well formed: false for a truncated or oversized inner box, a reference too short for its
// header, a count that claims more targets than the box holds, or more boxes than the reader's cap.
func maxDerivedFrom(iref []byte) (int, bool) {
	if len(iref) < 4 {
		return 0, false
	}
	wide := iref[0] != 0 // version 1 uses 32-bit item ids
	idLen := 2
	if wide {
		idLen = 4
	}
	most := 0
	refs, capped, clean := scanBoxes(iref[4:])
	ok := clean && !capped
	for _, ref := range refs {
		if ref.typ != "dimg" {
			continue
		}
		if len(ref.body) < idLen+2 {
			ok = false
			continue
		}
		count := int(binary.BigEndian.Uint16(ref.body[idLen:]))
		// The count is claimed by the file: it can't exceed what the box really holds.
		if held := (len(ref.body) - idLen - 2) / idLen; count > held {
			count, ok = held, false
		}
		most = max(most, count)
	}
	return most, ok
}

// primaryTransformed reports whether the primary item is associated (ipma) with an irot or imir property (ipco).
func primaryTransformed(meta []box, primary uint32, get func([]byte) []box) bool {
	var ipco, ipma []byte
	for _, b := range meta {
		if b.typ != "iprp" {
			continue
		}
		for _, c := range get(b.body) {
			switch c.typ {
			case "ipco":
				ipco = c.body
			case "ipma":
				ipma = c.body
			}
		}
	}
	if ipco == nil || len(ipma) < 8 {
		return false
	}
	props := get(ipco)
	version, flags := ipma[0], uint32(ipma[1])<<16|uint32(ipma[2])<<8|uint32(ipma[3])
	entries := int(binary.BigEndian.Uint32(ipma[4:]))
	p := ipma[8:]
	for i := 0; i < entries; i++ {
		idLen := 2
		if version != 0 {
			idLen = 4
		}
		if len(p) < idLen+1 {
			return false
		}
		var id uint32
		if idLen == 2 {
			id = uint32(binary.BigEndian.Uint16(p))
		} else {
			id = binary.BigEndian.Uint32(p)
		}
		n := int(p[idLen])
		p = p[idLen+1:]
		step := 1
		if flags&1 != 0 {
			step = 2
		}
		if len(p) < n*step {
			return false
		}
		if id == primary {
			for k := 0; k < n; k++ {
				var idx int
				if step == 2 {
					idx = int(binary.BigEndian.Uint16(p[k*2:]) & 0x7FFF)
				} else {
					idx = int(p[k] & 0x7F)
				}
				if idx >= 1 && idx <= len(props) && (props[idx-1].typ == "irot" || props[idx-1].typ == "imir") {
					return true
				}
			}
		}
		p = p[n*step:]
	}
	return false
}

type box struct {
	typ  string
	body []byte
}

// boxes splits a run of ISO-BMFF boxes. It stops at the first box that doesn't fit, so a lying size can't read past b.
func boxes(b []byte) []box {
	out, _, _ := scanBoxes(b)
	return out
}

// maxBoxes is the most boxes one run is split into.
const maxBoxes = 4096

// scanBoxes is boxes plus two verdicts: capped (the run had more boxes than maxBoxes, the rest unseen) and clean
// (the run was consumed exactly: no box that does not fit, no stray bytes).
func scanBoxes(b []byte) (out []box, capped, clean bool) {
	for len(b) >= 8 {
		if len(out) >= maxBoxes {
			return out, true, false
		}
		size, hdr := uint64(binary.BigEndian.Uint32(b)), 8
		switch size {
		case 0:
			size = uint64(len(b))
		case 1:
			if len(b) < 16 {
				return out, false, false
			}
			size, hdr = binary.BigEndian.Uint64(b[8:]), 16
		}
		if size < uint64(hdr) || size > uint64(len(b)) {
			return out, false, false
		}
		out = append(out, box{typ: string(b[4:8]), body: b[hdr:size]})
		b = b[size:]
	}
	return out, false, len(b) == 0
}

func findBox(b []byte, typ string) ([]byte, bool) {
	for _, x := range boxes(b) {
		if x.typ == typ {
			return x.body, true
		}
	}
	return nil, false
}

// exifOrientationFallback decides which EXIF orientation (1..8) the caller must still apply after a decode with
// AutoRotate. When the primary item carries irot/imir the decoder has already turned the picture and the EXIF
// orientation must be ignored (iPhone files carry both, and applying both would turn the picture twice). Without
// them, a valid EXIF orientation is applied by decodeUpright like a JPEG's.
func exifOrientationFallback(info heicInfo, exifOrientation int) int {
	if info.Transformed || exifOrientation < 1 || exifOrientation > 8 {
		return 1
	}
	return exifOrientation
}

// checkHEICContainer refuses a container that is too big a grid or could not be inspected in full.
func checkHEICContainer(info heicInfo) error {
	if info.Refused {
		return fmt.Errorf("%w: HEIC container is malformed or too large to inspect", ErrUnsupportedFormat)
	}
	if info.MaxTiles > MaxHEICTiles {
		return ErrHEICTooManyTiles
	}
	return nil
}

// heicConfig reads only the header: the size of the picture, before any decode. The tile cap is checked first,
// from the container.
func heicConfig(data []byte) (cfg image.Config, err error) {
	defer func() {
		if r := recover(); r != nil {
			cfg, err = image.Config{}, fmt.Errorf("%w: HEIC decoder failed", ErrUnsupportedFormat)
		}
	}()
	if err := checkHEICContainer(inspectHEIC(data)); err != nil {
		return image.Config{}, err
	}
	cfg, err = heicDecodeConfig(bytes.NewReader(data))
	if err != nil {
		return image.Config{}, fmt.Errorf("%w: %v", ErrUnsupportedFormat, err)
	}
	return cfg, nil
}

type heicResult struct {
	img         image.Image
	orientation int
	err         error
}

// runHEIC decodes the first picture (AutoRotate applied) and, when the primary item has no irot/imir, reads the
// EXIF orientation still to apply. A panic in the decoder (untrusted input) becomes an error.
func runHEIC(data []byte) (res heicResult) {
	defer func() {
		if r := recover(); r != nil {
			res = heicResult{err: fmt.Errorf("%w: HEIC decoder failed", ErrUnsupportedFormat)}
		}
	}()
	info := inspectHEIC(data)
	if err := checkHEICContainer(info); err != nil {
		return heicResult{err: err}
	}
	img, err := heicDecode(bytes.NewReader(data), heicOptions())
	if err != nil {
		return heicResult{err: fmt.Errorf("%w: %v", ErrUnsupportedFormat, err)}
	}
	orientation := 1
	if !info.Transformed {
		if ex, err := heic.DecodeExif(bytes.NewReader(data)); err == nil && ex != nil {
			orientation = ex.Orientation
		}
	}
	return heicResult{img: img, orientation: exifOrientationFallback(info, orientation)}
}

// decodeHEIC decodes the first picture, with the HEIC's own rotation applied, and returns the EXIF orientation
// (1..8) that is still to be applied (1 when irot/imir already turned it, or there is no EXIF). It waits for one of
// the two decode slots and for the decode itself, together at most heicTimeout. See the package comment above for
// what a timeout leaves running.
func decodeHEIC(data []byte) (image.Image, int, error) {
	timer := time.NewTimer(heicTimeout)
	defer timer.Stop()
	select {
	case heicSlots <- struct{}{}:
	case <-timer.C:
		return nil, 1, ErrHEICTimeout
	}
	run := heicRun
	done := make(chan heicResult, 1) // buffered: a decode that outlives its caller must not block
	go func() {
		defer func() { <-heicSlots }() // the slot is held until the decode really ends, even after a timeout
		done <- run(data)
	}()
	select {
	case r := <-done:
		if r.err != nil {
			return nil, 1, r.err
		}
		return r.img, r.orientation, nil
	case <-timer.C:
		return nil, 1, ErrHEICTimeout
	}
}
