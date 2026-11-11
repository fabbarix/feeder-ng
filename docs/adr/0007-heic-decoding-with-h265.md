# HEIC photos are decoded in-process with the pure-Go gen2brain/h265, behind internal/imaging/heic.go

Status: **Accepted** (2026-11-10). Design context: [docs/dev/design/ip1-imagepicker.md](../dev/design/ip1-imagepicker.md), section "HEIC / HEIF".

iPhones save photos as HEIC. Most browsers cannot decode them, so the server converts an uploaded HEIC/HEIF to WebP like any other picture ([ADR 0004](0004-go-binary-sqlite-on-data-volume.md): one static Go binary, no cgo, distroless image). The Go standard library and `golang.org/x/image` have no HEVC decoder, so a module had to be adopted.

**Decision.** Add **`github.com/gen2brain/h265` v0.2.4** (MIT): a pure-Go HEVC and HEIC decoder (and encoder), no cgo, no further modules (`go.mod` gains this one line, `go.sum` two). It is used only in `internal/imaging/heic.go`; no other file imports it, so replacing the decoder is a one-file change. The user approved the download. The module is a port of two Rust decoders and carries their notices (see below).

**Rejected: `github.com/gen2brain/heic`.** The earlier candidate (a codec compiled to WebAssembly and run by wazero, pure Go, no cgo) was rejected by the user on licensing grounds: it is AGPL-3.0, and linking it into Feeder would put the whole binary under the AGPL's network-use clause, which this project does not want to take on. It would also bring wazero and a large WASM blob. `h265` is MIT, smaller and has no dependency. *Verification note:* this ADR's author could not confirm the AGPL claim offline (the v0.7.2 copy in the local module cache ships an MIT `LICENSE` for the Go wrapper and a prebuilt WASM blob built from Rust sources, with no licence text for the codec inside). The rejection stands on the user's decision; if it is ever revisited, check the licence of the embedded codec first.

**Guards** (all in `internal/imaging`; the first two apply to every format):
1. **8 MB cap** on the upload (`MaxBytes`), before anything else.
2. **Pixel caps** (`MaxSidePixels` 12000, `MaxPixels` 50 MP) from `heic.DecodeConfig`, before decoding.
3. **Grid tile-count cap**: `MaxHEICTiles` = 256, taken from the container's item references (`iref`/`dimg`, read by a small bounds-checked box reader in `heic.go`) before any picture data is touched. A larger grid is refused as `unsupported_image`.
4. **`heic.Options.FrameSizeLimit`** = `MaxPixels`, set explicitly (the library default is 16384 x 16384), and `Threads` = 2.
5. **Two decode slots** (a semaphore) and a **20 s timeout** that covers both the wait for a slot and the decode. A decoder panic on hostile input is recovered and becomes a refusal.
6. **Rotation, never twice.** `AutoRotate` applies `clap`/`irot`/`imir`. When the primary item has none of `irot`/`imir`, the EXIF orientation (`heic.DecodeExif`) is applied afterwards by the same code as a JPEG's. When they are present the EXIF orientation is ignored (iPhone files carry both).

**Accepted: a timed-out decode keeps its slot.** The library takes no context, so a decode cannot be cancelled. On timeout the caller gets `unsupported_image` at once, but the decode goroutine runs to its end and holds its slot until then. At most two such decodes can run, each already bounded by guards 2 to 4, so the cost is bounded CPU and memory for a while, not an outage; while both slots are busy, new HEIC uploads wait up to 20 s and are then refused. We accept this rather than abandon the semaphore (which would let runaway decodes pile up) or fork the library to add cancellation.

**Patents (the user's matter).** HEVC is covered by patents held by several pools and by unpooled holders. The library's licence gives no rights on them and says so. Whether a licence is needed to ship or run Feeder with an HEVC decoder is for the user to judge; this ADR does not decide it. Operators who object can build or deploy with HEIC turned off in the picker (`HEIC_ENABLED` in `web/src/ui/ImagePicker/lib/limits.ts`), and the server then still refuses nothing it did not already accept for other formats.

**Not measured.**
- **arm64 performance.** The library has NEON assembly for arm64, but decode time on the Raspberry Pi class of machines Feeder may run on has not been measured. The slots and the timeout are there so a slow machine degrades to refusals, not to a stall.
- **Real iPhone HEIC.** The test fixtures are a tiny HEVC file wrapped in a minimal container (`internal/imaging/testdata/mkheic.py`) and grids and EXIF items written by the library's own encoder. No genuine iPhone file (grid of tiles, Display P3, auxiliary images, `irot`) was available. **Verifying a real iPhone HEIC (portrait and landscape, both orientations upright) on the deployed amd64 and arm64 builds is a release-QA item for the user.**

**Binary size** (`CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" ./cmd/feeder`, linux, with a stub `web/dist`):

| Architecture | Before | After | Difference |
|---|---|---|---|
| amd64 | 21,635,234 B (20.6 MiB) | 22,245,538 B (21.2 MiB) | +610,304 B (+0.6 MiB, +2.8%) |
| arm64 | 20,250,786 B (19.3 MiB) | 20,840,610 B (19.9 MiB) | +589,824 B (+0.6 MiB, +2.9%) |

**Third-party notice** (to be copied into `THIRD_PARTY_NOTICES.md`; that file did not exist on main when this was written, so the row is recorded here and the Project Manager sequences it):

| Module | Version | Licence | Carried notices |
|---|---|---|---|
| `github.com/gen2brain/h265` | v0.2.4 | MIT (Copyright (c) 2025 roticv; Copyright (c) 2026 Karpeles Lab Inc.) | the decoder ports [rust_h265](https://github.com/roticv/rust_h265) (Apache-2.0 OR MIT) and [oxideav-h265](https://github.com/OxideAV/oxideav-h265) (MIT) and carries their notices |

**Considered options**
- *`gen2brain/heic` (WASM codec)*: licensing concern per the user (above), wazero and a WASM blob. Rejected.
- *cgo with libheif/libde265*: breaks the static build and the distroless image (ADR 0004), and libde265 is LGPL. Rejected.
- *Convert in the browser (canvas)*: only Safari decodes HEIC; Chrome and Firefox cannot. Rejected as the only path.
- *Keep refusing HEIC (the IP1 interim)*: iPhone users must convert photos by hand. Superseded by this decision.
- *An external converter process (`heif-convert`, ImageMagick)*: a new runtime dependency and a process to sandbox. Rejected.

**Consequences**
- iPhone photos upload directly; the picker shows "Converting photo…" while the server works, which can take seconds on slow hardware.
- `go.mod` gains one module; the binary grows by the sizes above.
- `ErrHEICUnavailable` is gone; `ErrHEICTimeout` and `ErrHEICTooManyTiles` (both `ErrUnsupportedFormat`) replace it, so the HTTP layer needs no change.
