package imaging

import (
	"bytes"
	"encoding/binary"
	"errors"
	"image"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/gen2brain/h265/heic"
)

// Security send-back for ADR 0007: the tile cap must hold whatever the container looks like (several iref boxes,
// boxes beyond the reader's cap, malformed references), and the decoder must never run worker goroutines.

func be32(v uint32) []byte { b := make([]byte, 4); binary.BigEndian.PutUint32(b, v); return b }

func rdN(b []byte, n int) uint64 {
	var v uint64
	for i := 0; i < n; i++ {
		v = v<<8 | uint64(b[i])
	}
	return v
}

func wrN(b []byte, n int, v uint64) {
	for i := n - 1; i >= 0; i-- {
		b[i] = byte(v)
		v >>= 8
	}
}

// shiftIloc adds delta to every file-offset extent in the iloc inside meta (the meta box, header included).
func shiftIloc(t *testing.T, meta []byte, delta int) {
	t.Helper()
	p := 12
	for p+8 <= len(meta) {
		sz := int(binary.BigEndian.Uint32(meta[p:]))
		if string(meta[p+4:p+8]) == "iloc" {
			b := meta[p+8 : p+sz]
			v := b[0]
			os, ls := int(b[4]>>4), int(b[4]&15)
			bs, is := int(b[5]>>4), int(b[5]&15)
			if v == 0 {
				is = 0
			}
			q := 6
			var cnt int
			if v < 2 {
				cnt = int(binary.BigEndian.Uint16(b[q:]))
				q += 2
			} else {
				cnt = int(binary.BigEndian.Uint32(b[q:]))
				q += 4
			}
			for i := 0; i < cnt; i++ {
				if v < 2 {
					q += 2
				} else {
					q += 4
				}
				cm := 0
				if v >= 1 {
					cm = int(binary.BigEndian.Uint16(b[q:]) & 15)
					q += 2
				}
				q += 2
				baseAt := q
				base := rdN(b[q:], bs)
				q += bs
				ec := int(binary.BigEndian.Uint16(b[q:]))
				q += 2
				if cm == 0 && bs > 0 && base != 0 {
					wrN(b[baseAt:], bs, base+uint64(delta))
				}
				for e := 0; e < ec; e++ {
					q += is
					if cm == 0 && !(bs > 0 && base != 0) && os > 0 {
						wrN(b[q:], os, rdN(b[q:], os)+uint64(delta))
					}
					q += os + ls
				}
			}
			return
		}
		p += sz
	}
	t.Fatal("no iloc")
}

// insertIntoMeta inserts ins into the meta box at offset at, counted from the start of meta's children, and keeps
// the file decodable: meta's size is fixed and every iloc offset is shifted (mdat follows meta in the fixtures).
func insertIntoMeta(t *testing.T, data []byte, at int, ins []byte) []byte {
	t.Helper()
	off := 0
	for _, b := range boxes(data) {
		sz := len(b.body) + 8
		if b.typ == "meta" {
			pos := off + 12 + at // 8 header + 4 version and flags
			out := append(append(append([]byte{}, data[:pos]...), ins...), data[pos:]...)
			binary.BigEndian.PutUint32(out[off:], uint32(sz+len(ins)))
			shiftIloc(t, out[off:off+sz+len(ins)], len(ins))
			return out
		}
		off += sz
	}
	t.Fatal("no meta")
	return nil
}

// irefAt returns the offset of the iref box among meta's children, and its size.
func irefAt(t *testing.T, data []byte) (int, int) {
	t.Helper()
	meta, _ := findBox(data, "meta")
	off := 4
	for _, b := range boxes(meta[4:]) {
		sz := len(b.body) + 8
		if b.typ == "iref" {
			return off - 4, sz
		}
		off += sz
	}
	t.Fatal("no iref")
	return 0, 0
}

// decoyIref is a well-formed iref whose one dimg reference points at a single tile.
func decoyIref() []byte {
	out := append(be32(8+4+8+2+2+2), []byte("iref")...)
	out = append(out, 0, 0, 0, 0)
	out = append(out, be32(8+6)...)
	out = append(out, []byte("dimg")...)
	return append(out, 0x7f, 0x7f, 0, 1, 0, 1)
}

func overCapGrid(t *testing.T) []byte {
	t.Helper()
	return encodeHEIC(t, halvesRGBA(17*16, 16*16), heic.EncodeOptions{Tile: 16}) // 17 x 16 = 272 tiles
}

func TestHEICSecondIrefCannotLowerTheTileCount(t *testing.T) {
	over := overCapGrid(t)
	at, sz := irefAt(t, over)
	out := insertIntoMeta(t, over, at+sz, decoyIref()) // the decoy comes after the real iref
	if got := inspectHEIC(out).MaxTiles; got != 272 {
		t.Errorf("MaxTiles = %d, want 272 (the largest over all iref boxes)", got)
	}
	if _, err := Process(bytes.NewReader(out)); !errors.Is(err, ErrHEICTooManyTiles) {
		t.Errorf("Process error = %v, want ErrHEICTooManyTiles", err)
	}
	// and with the decoy first
	out = insertIntoMeta(t, over, at, decoyIref())
	if got := inspectHEIC(out).MaxTiles; got != 272 {
		t.Errorf("decoy first: MaxTiles = %d, want 272", got)
	}
}

func TestHEICBoxesBeyondTheReaderCapFailClosed(t *testing.T) {
	over := overCapGrid(t)
	at, _ := irefAt(t, over)
	filler := bytes.Repeat(append(be32(8), []byte("free")...), 4096) // the real iref now lies beyond box 4096
	out := insertIntoMeta(t, over, at, filler)
	if !inspectHEIC(out).Refused {
		t.Error("a meta with more than 4096 boxes must be Refused: the reader cannot see all of it")
	}
	if _, err := Process(bytes.NewReader(out)); !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("Process error = %v, want ErrUnsupportedFormat", err)
	}
	// the same file without the filler is fine to inspect
	if inspectHEIC(over).Refused {
		t.Error("a normal container must not be Refused")
	}
}

func TestHEICMalformedIrefFailsClosed(t *testing.T) {
	over := overCapGrid(t)
	at, sz := irefAt(t, over)
	cases := map[string][]byte{
		"dimg claims more targets than it holds": append(append(be32(8+4+8+2+2+2), []byte("iref")...), 0, 0, 0, 0,
			0, 0, 0, 14, 'd', 'i', 'm', 'g', 0x7f, 0x7f, 0xFF, 0xFF, 0, 1),
		"dimg too short for its header": append(append(be32(8+4+8+2), []byte("iref")...), 0, 0, 0, 0,
			0, 0, 0, 10, 'd', 'i', 'm', 'g', 0x7f, 0x7f),
		"inner box size beyond the iref": append(append(be32(8+4+8), []byte("iref")...), 0, 0, 0, 0,
			0, 0, 0, 99, 'd', 'i', 'm', 'g'),
		"iref without its version and flags": append(be32(8+2), []byte("iref")...),
	}
	for name, iref := range cases {
		iref := iref
		binary.BigEndian.PutUint32(iref, uint32(len(iref)))
		out := insertIntoMeta(t, over, at+sz, iref)
		if !inspectHEIC(out).Refused {
			t.Errorf("%s: want Refused", name)
		}
		if _, err := Process(bytes.NewReader(out)); !errors.Is(err, ErrUnsupportedFormat) {
			t.Errorf("%s: Process error = %v, want ErrUnsupportedFormat", name, err)
		}
	}
}

func TestHEICDecoderRunsNoWorkerGoroutines(t *testing.T) {
	// gen2brain/h265 starts its worker goroutines without a recover: a panic there would kill the server (ADR 0007).
	if heicThreads != 1 || heicOptions().Threads != 1 {
		t.Errorf("heicThreads = %d, Threads = %d, want 1", heicThreads, heicOptions().Threads)
	}
}

func TestRunHEICTurnsADecoderPanicIntoARefusal(t *testing.T) {
	old := heicDecode
	heicDecode = func(io.Reader, ...heic.Options) (image.Image, error) { panic("boom") }
	defer func() { heicDecode = old }()
	res := runHEIC(fixture(t, "pantry-128x96.heic"))
	if !errors.Is(res.err, ErrUnsupportedFormat) || res.img != nil {
		t.Errorf("got img=%v err=%v, want an ErrUnsupportedFormat refusal", res.img, res.err)
	}
}

func TestHEICConfigTurnsADecoderPanicIntoARefusal(t *testing.T) {
	old := heicDecodeConfig
	heicDecodeConfig = func(io.Reader) (image.Config, error) { panic("boom") }
	defer func() { heicDecodeConfig = old }()
	if _, err := heicConfig(fixture(t, "pantry-128x96.heic")); !errors.Is(err, ErrUnsupportedFormat) {
		t.Errorf("err = %v, want ErrUnsupportedFormat", err)
	}
}

// ---- fuzz targets (ADR 0007). Run: go test ./internal/imaging -run '^$' -fuzz FuzzInspectHEIC -fuzztime 30s ----

func addHEICSeeds(f *testing.F) {
	for _, name := range []string{"pantry-128x96.heic", "too-wide-12100x64.heic"} {
		data, err := os.ReadFile(filepath.Join("testdata", name))
		if err != nil {
			f.Fatal(err)
		}
		f.Add(data)
	}
}

func FuzzInspectHEIC(f *testing.F) {
	addHEICSeeds(f)
	f.Fuzz(func(t *testing.T, b []byte) {
		inspectHEIC(b)
		isHEIC(b)
	})
}

func FuzzProcessHEIC(f *testing.F) {
	addHEICSeeds(f)
	f.Fuzz(func(t *testing.T, b []byte) { _, _ = Process(bytes.NewReader(b)) })
}
