package imaging

import (
	"bytes"
	"encoding/binary"
	"errors"
	"image"
	"image/color"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/gen2brain/h265/heic"
)

// Guards around the HEIC decoder (ADR 0007): the tile-count cap read from the container, the frame size limit,
// the EXIF-orientation fallback (and never turning a picture twice), and the 2-slot semaphore with a timeout.
// The fixtures are built with the decoder module's own encoder: no hand-made container bytes except the tiny,
// well-formed property boxes in synthMeta, which test the property reader.

// halvesRGBA is w x h, the left half red and the right half blue.
func halvesRGBA(w, h int) *image.RGBA {
	img := image.NewRGBA(image.Rect(0, 0, w, h))
	for y := 0; y < h; y++ {
		for x := 0; x < w; x++ {
			if x < w/2 {
				img.Set(x, y, color.RGBA{R: 255, A: 255})
			} else {
				img.Set(x, y, color.RGBA{B: 255, A: 255})
			}
		}
	}
	return img
}

func encodeHEIC(t *testing.T, img image.Image, opts heic.EncodeOptions) []byte {
	t.Helper()
	var b bytes.Buffer
	if err := heic.Encode(&b, img, opts); err != nil {
		t.Fatalf("building the HEIC fixture: %v", err)
	}
	return b.Bytes()
}

// exifTIFF is the TIFF payload of an Exif item holding only the Orientation tag (the part of exifSegment after "Exif\0\0").
func exifTIFF(orientation uint16) []byte {
	return exifSegment(orientation, false)[4+6:]
}

// ---- tile-count cap ----

func TestInspectHEICCountsTheTilesOfAGrid(t *testing.T) {
	if got := inspectHEIC(fixture(t, "pantry-128x96.heic")); got.MaxTiles != 0 || got.Transformed {
		t.Errorf("a single-picture HEIC: got %+v, want no tiles and no transform", got)
	}
	grid := encodeHEIC(t, halvesRGBA(64, 64), heic.EncodeOptions{Tile: 32}) // 2 x 2
	if got := inspectHEIC(grid); got.MaxTiles != 4 {
		t.Errorf("a 2x2 grid: MaxTiles = %d, want 4", got.MaxTiles)
	}
}

func TestInspectHEICNeverPanicsOnDamagedContainers(t *testing.T) {
	grid := encodeHEIC(t, halvesRGBA(64, 64), heic.EncodeOptions{Tile: 32})
	for n := 0; n <= len(grid); n += 7 {
		inspectHEIC(grid[:n]) // every truncation: must not panic or loop
	}
	inspectHEIC(nil)
	inspectHEIC(bytes.Repeat([]byte{0xFF}, 300))
}

func TestHEICGridWithTooManyTilesIsRefusedBeforeDecoding(t *testing.T) {
	over := encodeHEIC(t, halvesRGBA(17*16, 16*16), heic.EncodeOptions{Tile: 16}) // 17 x 16 = 272 tiles
	if got := inspectHEIC(over).MaxTiles; got != 272 {
		t.Fatalf("fixture has %d tiles, want 272", got)
	}
	defer swapHEICRun(func([]byte) heicResult { t.Error("the decoder ran on a grid over the tile cap"); return heicResult{} })()
	if _, err := Process(bytes.NewReader(over)); !errors.Is(err, ErrHEICTooManyTiles) || !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("272 tiles: got %v, want ErrHEICTooManyTiles (an ErrUnsupportedFormat)", err)
	}
	if _, err := ProcessDataURL(dataURL("image/heic", over)); !errors.Is(err, ErrHEICTooManyTiles) {
		t.Errorf("272 tiles by data URL: got %v", err)
	}
	if _, err := PrepareForModel(over); !errors.Is(err, ErrHEICTooManyTiles) {
		t.Errorf("272 tiles for the model: got %v", err)
	}
}

func TestHEICGridAtTheTileCapIsAccepted(t *testing.T) {
	atCap := encodeHEIC(t, halvesRGBA(16*16, 16*16), heic.EncodeOptions{Tile: 16}) // 16 x 16 = 256 tiles
	if got := inspectHEIC(atCap).MaxTiles; got != MaxHEICTiles {
		t.Fatalf("fixture has %d tiles, want %d", got, MaxHEICTiles)
	}
	res, err := Process(bytes.NewReader(atCap))
	if err != nil || res.Width != 256 || res.Height != 256 {
		t.Errorf("256 tiles: got %dx%d, %v; want a converted 256x256", res.Width, res.Height, err)
	}
}

// ---- decoder options ----

func TestHEICDecoderIsBoundedAndTurnsItsOwnTransforms(t *testing.T) {
	o := heicOptions()
	if !o.AutoRotate {
		t.Error("AutoRotate must be on: clap/irot/imir are applied by the decoder")
	}
	if o.FrameSizeLimit <= 0 || o.FrameSizeLimit > MaxPixels {
		t.Errorf("FrameSizeLimit = %d, want an explicit bound of at most MaxPixels (%d), not the library default or unlimited", o.FrameSizeLimit, MaxPixels)
	}
	if o.Threads <= 0 {
		t.Errorf("Threads = %d, want an explicit bound", o.Threads)
	}
}

// ---- EXIF orientation fallback, and never turning twice ----

func TestHEICWithoutIrotUsesTheExifOrientation(t *testing.T) {
	// Stored 128x96, left red, right blue; EXIF orientation 6 (turn 90 degrees clockwise): upright 96x128, red on top.
	data := encodeHEIC(t, halvesRGBA(128, 96), heic.EncodeOptions{Exif: exifTIFF(6)})
	if inspectHEIC(data).Transformed {
		t.Fatal("fixture should carry no irot/imir")
	}
	res, err := Process(bytes.NewReader(data))
	if err != nil || res.Width != 96 || res.Height != 128 {
		t.Fatalf("got %dx%d, %v; want the upright 96x128", res.Width, res.Height, err)
	}
	img := decodeWebP(t, res.WebP)
	if !isRed(img.At(48, 20)) || !isBlue(img.At(48, 108)) {
		t.Errorf("top = %v, bottom = %v; want red on top, blue below", img.At(48, 20), img.At(48, 108))
	}
}

func TestHEICExifOrientationAlsoWorksThroughTheModelPath(t *testing.T) {
	data := encodeHEIC(t, halvesRGBA(128, 96), heic.EncodeOptions{Exif: exifTIFF(6)})
	res, err := PrepareForModel(data)
	if err != nil || res.Width != 96 || res.Height != 128 {
		t.Errorf("got %dx%d, %v; want 96x128", res.Width, res.Height, err)
	}
}

func TestHEICWithNoOrParasiticExifIsLeftAsStored(t *testing.T) {
	for name, data := range map[string][]byte{
		"no EXIF":                fixture(t, "pantry-128x96.heic"),
		"orientation 1":          encodeHEIC(t, halvesRGBA(128, 96), heic.EncodeOptions{Exif: exifTIFF(1)}),
		"orientation out of 1-8": encodeHEIC(t, halvesRGBA(128, 96), heic.EncodeOptions{Exif: exifTIFF(9)}),
		"EXIF that is not TIFF":  encodeHEIC(t, halvesRGBA(128, 96), heic.EncodeOptions{Exif: []byte("not a tiff header at all")}),
	} {
		res, err := Process(bytes.NewReader(data))
		if err != nil || res.Width != 128 || res.Height != 96 {
			t.Errorf("%s: got %dx%d, %v; want 128x96 as stored", name, res.Width, res.Height, err)
			continue
		}
		img := decodeWebP(t, res.WebP)
		if !isRed(img.At(20, 48)) || !isBlue(img.At(100, 48)) {
			t.Errorf("%s: left = %v, right = %v; want red | blue", name, img.At(20, 48), img.At(100, 48))
		}
	}
}

func TestExifFallbackDecision(t *testing.T) {
	tests := []struct {
		name        string
		info        heicInfo
		orientation int
		want        int
	}{
		{"no irot, EXIF 6", heicInfo{}, 6, 6},
		{"no irot, EXIF 1", heicInfo{}, 1, 1},
		{"no irot, EXIF 0 (unreadable)", heicInfo{}, 0, 1},
		{"no irot, EXIF 9 (invalid)", heicInfo{}, 9, 1},
		{"irot or imir present, EXIF 6: the decoder already turned it", heicInfo{Transformed: true}, 6, 1},
		{"irot or imir present, EXIF 3", heicInfo{Transformed: true}, 3, 1},
		{"irot or imir present, EXIF 8", heicInfo{Transformed: true}, 8, 1},
	}
	for _, tc := range tests {
		if got := exifOrientationFallback(tc.info, tc.orientation); got != tc.want {
			t.Errorf("%s: got %d, want %d", tc.name, got, tc.want)
		}
	}
}

// synthMeta is a minimal, well-formed meta box: primary item 1 and 2 items, with the given properties (in ipco
// order) and, per item id, the 1-based property indexes it is associated with.
func synthMeta(props []string, assoc map[uint16][]byte, wideAssoc bool) []byte {
	b := func(typ string, parts ...[]byte) []byte {
		body := bytes.Join(parts, nil)
		out := binary.BigEndian.AppendUint32(nil, uint32(8+len(body)))
		return append(append(out, typ...), body...)
	}
	full := func(typ string, flags uint32, parts ...[]byte) []byte {
		return b(typ, append([]byte{0, byte(flags >> 16), byte(flags >> 8), byte(flags)}, bytes.Join(parts, nil)...))
	}
	var ipco [][]byte
	for _, p := range props {
		ipco = append(ipco, b(p, make([]byte, 4)))
	}
	flags := uint32(0)
	if wideAssoc {
		flags = 1
	}
	entries := binary.BigEndian.AppendUint32(nil, uint32(len(assoc)))
	for _, id := range []uint16{1, 2} {
		idx, ok := assoc[id]
		if !ok {
			continue
		}
		entries = binary.BigEndian.AppendUint16(entries, id)
		entries = append(entries, byte(len(idx)))
		for _, i := range idx {
			if wideAssoc {
				entries = binary.BigEndian.AppendUint16(entries, uint16(i))
			} else {
				entries = append(entries, i)
			}
		}
	}
	iprp := b("iprp", b("ipco", ipco...), full("ipma", flags, entries))
	return b("meta", []byte{0, 0, 0, 0}, full("pitm", 0, []byte{0, 1}), iprp)
}

func TestInspectHEICSeesIrotAndImirOfThePrimaryItemOnly(t *testing.T) {
	tests := []struct {
		name  string
		props []string
		assoc map[uint16][]byte
		wide  bool
		want  bool
	}{
		{"irot on the primary item", []string{"ispe", "irot"}, map[uint16][]byte{1: {1, 2}}, false, true},
		{"imir on the primary item", []string{"ispe", "imir"}, map[uint16][]byte{1: {2}}, false, true},
		{"irot, 16-bit association indexes", []string{"ispe", "irot"}, map[uint16][]byte{1: {1, 2}}, true, true},
		{"irot only on another item (a thumbnail)", []string{"ispe", "irot"}, map[uint16][]byte{1: {1}, 2: {2}}, false, false},
		{"no rotation property at all", []string{"ispe", "colr"}, map[uint16][]byte{1: {1, 2}}, false, false},
		{"index past the property list", []string{"ispe"}, map[uint16][]byte{1: {5}}, false, false},
	}
	for _, tc := range tests {
		ftyp := []byte{0, 0, 0, 16, 'f', 't', 'y', 'p', 'h', 'e', 'i', 'c', 0, 0, 0, 0}
		got := inspectHEIC(append(ftyp, synthMeta(tc.props, tc.assoc, tc.wide)...))
		if got.Transformed != tc.want {
			t.Errorf("%s: Transformed = %v, want %v", tc.name, got.Transformed, tc.want)
		}
	}
}

// ---- semaphore and timeout ----

// swapHEICRun replaces the decode and returns the restore function.
func swapHEICRun(f func([]byte) heicResult) func() {
	old := heicRun
	heicRun = f
	return func() { heicRun = old }
}

func setHEICTimeout(d time.Duration) func() {
	old := heicTimeout
	heicTimeout = d
	return func() { heicTimeout = old }
}

func waitFor(t *testing.T, what string, cond func() bool) {
	t.Helper()
	for deadline := time.Now().Add(5 * time.Second); time.Now().Before(deadline); time.Sleep(5 * time.Millisecond) {
		if cond() {
			return
		}
	}
	t.Fatalf("timed out waiting for %s", what)
}

func TestHEICDecodeTimesOutButKeepsItsSlotUntilItEnds(t *testing.T) {
	release := make(chan struct{})
	defer swapHEICRun(func([]byte) heicResult {
		<-release
		return heicResult{img: image.NewRGBA(image.Rect(0, 0, 1, 1)), orientation: 1}
	})()
	defer setHEICTimeout(50 * time.Millisecond)()

	start := time.Now()
	_, _, err := decodeHEIC([]byte("x"))
	if !errors.Is(err, ErrHEICTimeout) || !errors.Is(err, ErrUnsupportedFormat) {
		t.Fatalf("got %v, want ErrHEICTimeout (an ErrUnsupportedFormat)", err)
	}
	if time.Since(start) > 2*time.Second {
		t.Errorf("the caller waited %v: it must be released at the timeout", time.Since(start))
	}
	if len(heicSlots) != 1 {
		t.Errorf("slots in use after the timeout = %d, want 1: the runaway decode keeps its slot (ADR 0007)", len(heicSlots))
	}
	close(release)
	waitFor(t, "the slot to be freed when the decode ends", func() bool { return len(heicSlots) == 0 })
}

func TestHEICWaitingForASlotTimesOutWhenBothAreBusy(t *testing.T) {
	release := make(chan struct{})
	var runs atomic.Int32
	defer swapHEICRun(func([]byte) heicResult {
		runs.Add(1)
		<-release
		return heicResult{img: image.NewRGBA(image.Rect(0, 0, 1, 1)), orientation: 1}
	})()
	defer setHEICTimeout(5 * time.Second)()

	var wg sync.WaitGroup
	for i := 0; i < 2; i++ {
		wg.Add(1)
		go func() { defer wg.Done(); decodeHEIC([]byte("x")) }()
	}
	waitFor(t, "both slots to be taken", func() bool { return len(heicSlots) == 2 && runs.Load() == 2 })

	heicTimeout = 50 * time.Millisecond
	if _, _, err := decodeHEIC([]byte("x")); !errors.Is(err, ErrHEICTimeout) {
		t.Errorf("third decode: got %v, want ErrHEICTimeout", err)
	}
	if runs.Load() != 2 {
		t.Errorf("the decoder ran %d times, want 2: a third decode must not start without a slot", runs.Load())
	}
	close(release)
	wg.Wait()
	waitFor(t, "the slots to be freed", func() bool { return len(heicSlots) == 0 })
}

func TestHEICNeverRunsMoreThanTwoDecodesAtOnce(t *testing.T) {
	var now, peak atomic.Int32
	defer swapHEICRun(func([]byte) heicResult {
		n := now.Add(1)
		for p := peak.Load(); n > p && !peak.CompareAndSwap(p, n); p = peak.Load() {
		}
		time.Sleep(20 * time.Millisecond)
		now.Add(-1)
		return heicResult{img: image.NewRGBA(image.Rect(0, 0, 1, 1)), orientation: 1}
	})()
	defer setHEICTimeout(10 * time.Second)()

	var wg sync.WaitGroup
	for i := 0; i < 8; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			if _, _, err := decodeHEIC([]byte("x")); err != nil {
				t.Errorf("decode: %v", err)
			}
		}()
	}
	wg.Wait()
	if peak.Load() != 2 {
		t.Errorf("peak concurrent decodes = %d, want exactly 2 (the slot count)", peak.Load())
	}
}

func TestHEICSlotIsFreedAfterAFailedDecode(t *testing.T) {
	defer swapHEICRun(func([]byte) heicResult { return heicResult{err: ErrUnsupportedFormat} })()
	for i := 0; i < 5; i++ {
		if _, _, err := decodeHEIC([]byte("x")); !errors.Is(err, ErrUnsupportedFormat) {
			t.Fatalf("got %v", err)
		}
	}
	waitFor(t, "the slots to be freed", func() bool { return len(heicSlots) == 0 })
}
