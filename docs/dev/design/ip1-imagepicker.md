# IP1: the shared ImagePicker and one server ingest path

One image component for every image field, one server path for every stored image. IP1 builds the primitive, its hooks and libs (including a simple
**crop** and rotate tool), the ingest endpoints (including server-side **HEIC conversion** and **EXIF orientation**) and the orphan clean-up. It does NOT migrate the existing fields (Recipe photo, Step photo: a later team) and does NOT add Ingredient NOTE: HEIC is refused for now (TODO(heic): decoder lands in a follow-up; HEIC_ENABLED in web/src/ui/ImagePicker/lib/limits.ts).
images (a later team). The Recipe Assistant's "Read from a photo" is a later consumer of the raw mode.

## Findings in the current code
- Upload today: `PhotoPicker` / `StepPhoto` (recipes feature) -> `FileDrop accept="image/*"` -> `recipesApi.uploadImage` (JSON `{dataUrl}`) -> `POST /api/images`
  in `internal/recipe/httpapi` -> `imaging.ProcessDataURL` (JPEG/PNG/WebP only, 8 MB, 12000 px / 50 MP, scaled to 1600 px, lossless WebP) -> `imaging.Store.Save`.
  The route lives in the Recipes module, which is wrong for a shared path.
- Recipe File images already use `imagefetch.Fetcher` (https only, DNS resolved by us and every address checked at connect time and on every redirect,
  10 MB, JPEG/PNG/WebP content type, 15 s). Reused as is.
- Orphans: `recipe/store.dropUnreferenced` removes a photo when a *save* replaces or removes it. A photo uploaded in the editor and never saved
  (tab closed, Cancel, replaced twice before saving) is never referenced, so its file stays in `/data/images` for ever. This is the "never-saved photo" follow-up.
- Server does NOT apply EXIF orientation yet (documented limit in `imaging`). Phone photos arrive sideways. Decision (round 2): the SERVER applies it
  (see "EXIF orientation"), so every ingest path is upright, including links and Recipe File imports. The picker still decodes with
  `createImageBitmap(blob, {imageOrientation: 'from-image'})` so its own crop/rotate work on what the user sees.
- The scanner camera (`features/scan/hooks/useCamera`) and `ViewfinderStrip` (140 px strip, barcode reticle, region "Scanner") are the camera primitives to build on.
- `FileDrop` already filters by `accept` and reports rejects; the native `<input type=file>` stays inside it (allowed under `web/src/ui`).

## UX

The picker is one labelled group inside whatever Tile the host uses (it is not a Tile itself).

```
Recipe photo                                  <- heading, names the group
[ preview, hero 16:9 or 72 px thumb ]         <- only when there is a picture
[ Rotate left ] [ Rotate right ] [ Crop ] [ Remove image ]
+ - - - - - - - - - - - - - - - - - - - - +
|   Choose a file or drop it here         |   <- FileDrop (label "Add an image" / "Replace image")
+ - - - - - - - - - - - - - - - - - - - - +
[ Paste image ] [ Paste link ] [ Take photo ]  <- 44 px buttons with Phosphor icons
JPEG, PNG or WebP, up to 8 MB.           <- helper (host helper replaces it)
<panel: link field | camera viewfinder>        <- at most one open
<status: Uploading the image  [Cancel]>        <- role=status
<error: ...>                                   <- role=alert
```

States: **empty**, **filled** (preview + Rotate/Remove), **busy** (preparing / uploading / downloading: status line, Cancel, every action disabled,
`aria-busy`), **error** (the previous value is kept; the message sits under the actions; cleared by the next successful pick or by opening a panel),
**panel open** (link or camera; opening one closes the other and stops the camera), **broken preview** ("The image could not be shown." with Replace and Remove still working).

Sources (`sources` prop, default all four):
- **File**: FileDrop (browse + drag and drop), `accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"` (the extensions are there because Chrome and Windows
  often report no type for HEIC). A dropped GIF/PDF/AVIF is rejected by FileDrop's `onReject` and shown as the formats message. **HEIC/HEIF (iPhone photos)**: in upload mode the picker does not decode or
  re-encode it (most browsers cannot); it sends the bytes as `data:image/heic;base64,...` (<= 8 MB, else the size message) and the SERVER converts it to WebP. The preview is then the stored WebP, so Crop and Rotate
  work on it like on any picture. In raw mode (Recipe Assistant) the browser must decode it (Safari can): it is re-encoded as JPEG; where it cannot, the "cannot read that image" message appears (raw mode never calls the server).
- **Paste**: (a) the `paste` event on the picker (any control inside it; focus on "Choose a file", "Paste image", ... all work) and, with `listenOn="dialog"`, on the enclosing
  `<dialog>` / BottomSheet, so Ctrl+V works anywhere in the sheet. Not intercepted when the target is an input/textarea (the link field pastes text normally).
  (b) the **Paste image** button reads `navigator.clipboard.read()` (falls back to `readText()` for a link). When the browser refuses or has no Clipboard API, the
  message says "Press Ctrl+V (Cmd+V on a Mac) while this box is focused", which always works. Clipboard content: image file > text/plain https link or data:image URL > `<img src>` in text/html > nothing ("No picture on the clipboard").
- **Link** (HEIC links work too: the server converts them): "Paste link" opens a labelled TextField "Image link" (focused), "Use link" / Enter submits, Escape/Cancel closes and returns focus to the button. Client check is only a hint (https, no credentials);
  the **server** downloads it (upload mode). Errors: not https, private address, could not be downloaded, too large, not an image.
- **Camera**: "Take photo" opens the shared **viewfinder** (see "Camera" below) with Capture, Close camera, torch (when supported) and Switch camera (when more than one video input).
  Capture closes the panel and runs the picture through the normal pipeline. If the camera cannot be used (denied, none, in use, error) an alert says why and "Use the camera app" appears.
  That button, and "Take photo" itself on a phone where `getUserMedia` is missing (plain http) or in an iOS home-screen app, open a hidden `<input type=file accept="image/*" capture="environment">` inside the picker (the camera app; better there than a flaky `getUserMedia`).
  A desktop without `getUserMedia` shows no camera button.

Preview, replace, remove, rotate:
- Replace = choose any source again. Remove = `onChange('')` / `onChange(null)`.
- **Rotate** left/right (90 degrees, client-side canvas; cheap, and it fixes sideways photos). Upload mode: loads the stored image, turns it, uploads the result as a NEW image, swaps the id.
  Raw mode: turns the held Blob in place. Not offered for a raw link value.
- **Crop** (see "Crop" below): same life cycle as Rotate (loads the stored image, uploads the result as a NEW image and swaps the id; raw mode crops the held Blob in place; not offered for a raw link value,
  hidden with `crop={false}`). There is **no focal-point column**: the cropped picture is what is stored.
- Pre-shrink: upload mode scales to at most 3200 px on the long edge before sending (a 200 MP phone photo would break the server's 50 MP cap and the 8 MB limit); the server then scales to 1600.
  A picture that already fits (size, pixels, bytes) and is not rotated or cropped is sent byte for byte, not re-encoded. HEIC is always sent byte for byte. Camera frames are always re-encoded (they come from a canvas).
  PNG stays PNG, everything else is re-encoded as JPEG q0.9, lowered to 0.6 while over the byte limit.
- Progress is **indeterminate** ("Preparing", "Uploading", "Downloading the image") because the shared http client uses `fetch`, which has no upload progress; Cancel aborts the request (AbortController).

Copy (strings in `web/src/ui/ImagePicker/strings.ts`, English). Glossary: no Avoid words; "Recipe photo" / "Step" are the host's labels.
Messages: unsupported "That is not a JPEG, PNG, WebP or HEIC image."; too large "The image is larger than N MB." (N = the active limit); too many pixels; empty; unreadable
("This browser cannot read that image. Try a JPEG or PNG."); crop: loading "Loading the image", cannot open "The image could not be opened for cropping. Try again."; link: empty "Paste the link of a picture.", invalid "The link must start with https://", blocked "Feeder cannot download from a private address.",
unreachable "The image could not be downloaded from that link."; clipboard: empty "There is no picture on the clipboard.", denied/unsupported (both include the Ctrl+V hint);
camera "The camera cannot be used here."; offline; failed "The image could not be added. Try again."

## Component API (`web/src/ui/ImagePicker/`)

```tsx
<ImagePicker label="Recipe photo" value={imageId} onChange={setImageId} />                       // upload mode (default)
<ImagePicker mode="raw" label="Photo of the recipe" value={raw} onChange={setRaw} maxSide={2576} output="dataUrl" />
```
Common props: `label` (heading + group name), `helper`, `error` (host error, wins over the picker's own), `disabled`, `sources`, `listenOn: 'picker' | 'dialog'`, `size: 'hero' | 72`,
`aspect: number | 'free'` (shape of the crop tool; default 4/3 in upload mode, 'free' in raw mode), `crop: boolean` (default true), `deps` (test seams: `api`, `engine`, `mediaDevices`, `clipboard`, `grabFrame`, `objectUrls`).
Presets (`CROP_ASPECTS` in `lib/crop.ts`): Recipe photo and Ingredient image `landscape` (4:3), Member avatar `square` (1:1), Recipe Assistant "Read from a photo" `free`.
`<ImagePicker label="Member photo" value={id} onChange={set} aspect={CROP_ASPECTS.square} />`.

- **Upload mode** (entity photos): `value` = stored image id or ''. Every pick is prepared on the client, sent to the server, and `onChange(newId)` is called when the server has it.
  The picker remembers the ids IT uploaded; when the user removes or replaces one of those it calls `DELETE /api/images/{id}` at once (no orphan). It never deletes an id that came from `value` (the saved entity still uses it; the entity save + `dropUnreferenced` handle it).
- **Raw mode** (Recipe Assistant): nothing is uploaded. `onChange(RawImage | null)` with
  `{kind:'blob', blob, dataUrl?, width, height, type, origin}` (downscaled to `maxSide`, default 2576 px; limited to `maxBytes`, default 8 MB; `dataUrl` only with `output="dataUrl"`)
  or `{kind:'url', url}` for a pasted https link, passed through untouched (the consumer's server fetches it with the same SSRF fetcher; the picker never fetches it). A pasted `data:image/...` URL becomes a blob.
  Preview of a blob uses an object URL, revoked on replace/remove/unmount.
- Layers (CLAUDE.md): `ImagePicker.tsx` renders and wires (thin); `hooks/useImagePicker` (orchestration), `useImageIngest` (upload pipeline), `useCameraCapture`, `useCropper` (rotation, crop rect, pointer drag, arrow keys); plain TS in `lib/`
  (`problems`, `imageUrl`, `clipboard`, `prepare`, `cameraStrategy`, `limits`, `crop`); `api.ts` is the only HTTP. Sub-components: `PreviewPane`, `SourceActions`, `LinkPanel`, `CameraPanel`, `FileButton` (button + hidden capture input), `CropEditor`.

## Crop

A simple crop with rotate, on our primitives (no native UI, no third-party cropper). It edits a picture the picker already holds, like Rotate does, so it works for every source
(a HEIC upload is cropped as its stored WebP). A pick is NOT interrupted by a crop step: pick, then press **Crop** if the framing needs work.
(Alternative the PM may prefer: crop right after the pick; one `cropOnPick` prop would do it. Not built: an extra step for every pick felt heavy for the Recipe form.)

```
Crop image                                  <- role=group "Crop image" (replaces the preview; focus goes to the box)
+---------------------------------------+
|  picture                              |   <- decorative <img>, never stretched
|    o---------------o                  |   <- the crop box (button "Move crop area"); handles are buttons >= 44 px
|    |   crop area    |                 |      free: 8 handles (4 corners, 4 edges); locked aspect: the 4 corners
|    o---------------o                  |
+---------------------------------------+
Crop area: 2400 by 1800 pixels            <- role=status; describes the box and every handle (aria-describedby)
[ Rotate left ] [ Rotate right ] [ Reset ] [ Cancel ] [ Use crop ]
```

States: **loading** ("Loading the image", upload mode fetches the stored picture; raw mode already holds it), **editing**, **busy** (Use crop uploading: group `aria-busy`, everything disabled),
**error** (the editor stays open so Use crop can be retried; the previous value is untouched), **closed**. Use crop with nothing changed (no turn, crop = whole picture) is a Cancel: nothing is sent.

- **Aspect.** `aspect` locks the shape (`width / height`); the box starts as the largest centred rectangle of that shape (a 4:3 box on a 4:3 picture is the whole picture). A locked box shows only corner handles
  and keeps the shape through pointer and keyboard. Rotating with a locked aspect starts the box again for the turned picture (the aspect belongs to the OUTPUT); with 'free' the box turns with the picture.
- **Pointer** (mouse, pen, touch share pointer events; `touch-action: none` on box and handles so the page does not scroll; `setPointerCapture` when present): a drag is measured from where it began and scaled by
  picture width / displayed width. Handles are real buttons with >= 44 px hit areas even if the visible dot is smaller (iPad).
- **Keyboard.** Box and handles are in the Tab order with a visible `:focus-visible` ring. Arrow keys: step = 1% of the long side (min 1 px), x10 with Shift. On the box they move it; on a handle they move that
  handle (a corner on both axes, an edge on its axis); the aspect lock applies. Escape cancels from anywhere inside; Enter/Space on the buttons works as usual. Handle names: "Resize crop, top left corner", "... top edge", etc.
- **Output.** `useCropper.output(maxSide)` gives `{turns, crop, width, height}`: the crop in pixels of the TURNED picture, scaled down (never up) so the long edge is <= `maxSide` (upload 3200 px, then the server's 1600; raw `maxSide` default 2576).
  `prepareImage(blob, {crop, turns, maxSide, maxBytes}, engine)` clamps the crop into the picture, treats a whole-picture crop as no crop (an untouched small picture is still sent byte for byte), and calls
  `engine.encode(image, {width, height, turns, crop, type, quality})`; the browser engine draws the rotated picture's crop rectangle into a `width x height` canvas (`lib/crop.rectInSource` maps it back to the stored pixels).
  The quality ladder, PNG-stays-PNG and the byte limit are unchanged.
- **Pure maths** (`lib/crop.ts`, no React/DOM, unit-tested): `initialCrop`, `clampRect` (shifts, never shrinks, except to the minimum 16 px), `moveRect`, `resizeRect` (free; locked: opposite corner anchored, dominant axis wins), `rotateCrop`, `rectInSource`,
  `outputSize`, `rectToPercent`, `isFullImage`, `handlesFor`, `handleLabel`. All rectangles are whole pixels.
- **Icons.** The Crop button is text-only (no new glyph); rotate inside the editor reuses `rotateLeft`/`rotateRight`.
- **Tests.** `lib/crop.test.ts`, `hooks/useCropper.test.tsx`, `components/CropEditor.test.tsx` (pointer, keyboard, rotate, apply/cancel; jsdom has no layout so the test stubs `getBoundingClientRect` to 400x300), `components/CropEditor.css.test.ts`
  (44 px handles, touch-action, focus ring, tokens), `ImagePicker.crop.test.tsx` (button visibility, aspect prop, upload/raw flows, discard of owned uploads, errors), crop cases in `lib/prepare.test.ts`.

## HEIC / HEIF (decision: convert on the server)

`internal/imaging` accepts `image/heic` and `image/heif` (declared type must agree with the bytes, as for the other formats) in `POST /api/images` and `POST /api/images/from-url`, converts to WebP, and applies the SAME limits:
8 MB, 12000 px long edge / 50 MP (read from the HEIC header BEFORE decoding), scaled to 1600 px. `imagefetch` lets `image/heic` and `image/heif` through. Detection is by the `ftyp` brand: major brand in
{heic, heix, hevc, hevx, heim, heis, hevm, hevs}, or `mif1`/`msf1` with a HEIC compatible brand. AVIF, MP4 and everything else stay refused (`unsupported_image`). The HEIC's own rotation (`irot`/`imir`) is applied by the decoder; metadata (EXIF, GPS) is dropped because the WebP writer writes none.

**Decoder research** (offline: only the Go module cache and what I know; nothing was downloaded or added to `go.mod`).
- Go stdlib and `golang.org/x/image` have no HEIC/HEVC decoder. The module cache holds `go4.org/media/heif`, which only parses the HEIF container (items, EXIF, thumbnails); it cannot decode HEVC pixels, so it is not enough.
- **Static build constraint.** `Dockerfile` builds with `CGO_ENABLED=0 GOOS/GOARCH go build` on the build platform and ships `gcr.io/distroless/static:nonroot` (multi-arch amd64+arm64, cross-compiled without emulation); ADR-0004 says "pure-Go SQLite (no cgo)".
  Any decoder that needs cgo + libheif (`strukturag/libheif-go`, `jdeng/goheif` with bundled libde265 C++) would need a C toolchain per target, libheif/libde265 shared libraries or static builds, and glibc: it BREAKS that build and that base image. Those are ruled out.
- **Candidate that keeps the build static: `github.com/gen2brain/heic`** - libheif + libde265 compiled to WebAssembly and run by `wazero` (pure Go, no cgo, Apache-2.0, amd64 + arm64 JIT). It registers with `image.Decode`/`image.DecodeConfig` (header-only config, which the pixel cap needs).
  It can also use a system libheif if one is present; we would NOT rely on that. Trade-offs: licence **LGPL-3.0** (libheif and libde265; verify the wrapper's own licence file when adding it) - a statically linked Go binary has the usual LGPL relinking question (workable when the source is published; needs the PM/owner to accept);
  binary grows by a few MB (the embedded wasm); decoding runs at WASM speed (a 12 MP photo in about a second or two, memory proportional to pixels - hence the header pixel cap, a small concurrency limit (1-2 decodes at once) and the 8 MB cap). Maintenance: active at the time of writing, small project (one maintainer).
  Alternatives of the same kind (`klippa-app/go-libheif` wasm via wazero; `adrium/goheif`, a pure-Go transpile of libde265) are less used; same LGPL core. A truly independent pure-Go HEVC intra decoder would be a large project.
- **Verification the Developer must do when adding it** (I could not offline): `CGO_ENABLED=0 go build ./cmd/feeder` for linux/amd64 and linux/arm64; `go mod tidy` adds only `gen2brain/heic`, `wazero` (and its deps); LICENSE files; binary size before/after; decode time of the fixture and of a real 12 MP iPhone HEIC;
  `scripts/check.sh` green. If any of this fails, STOP and report: the fallback is to keep HEIC refused on the server (the client tests for HEIC pass-through then change to the old "Try a JPEG or PNG" behaviour).
- Wrap the decoder behind `imaging.decodeHEIC` / `imaging.heicConfig` (one small file `heic.go`) so a different decoder is a one-file change. Add the semaphore there.

Fixtures (`internal/imaging/testdata/`): `pantry-128x96.heic` (389 bytes, left half red, right half blue) and `too-wide-12100x64.heic` (537 bytes, over the 12000 px cap) are REAL HEVC-coded HEIF files. `heif-enc` on this machine
is broken (its x265 plugin was built against libx265 209 but 215 is installed), so `testdata/mkheic.py` wraps a single ffmpeg-`libx265` frame in a minimal HEIF container (ftyp, meta with hdlr/pitm/iloc/iinf/iprp(ispe, hvcC)/ipma, mdat); libheif 1.19.5
(`heif-convert`) decodes both correctly. They are not iPhone-shaped (an iPhone HEIC is a grid of tiles with Display P3 colour and extra auxiliary images): add a real iPhone sample before release (the PM or the user can supply one; keep it under 100 KB or generate a tiny one).

## EXIF orientation (server)

`imaging.processBytes` reads the JPEG's EXIF Orientation (tag 0x0112, values 1-8, big or little endian TIFF) and turns/mirrors the decoded picture upright BEFORE scaling, so `Result.Width/Height` are the upright size
(a 2000x400 JPEG with orientation 6 is stored as 320x1600). Only JPEG carries it. Parsing is defensive: walk the JPEG marker segments up to SOS, find the first `Exif\0\0` APP1, bounds-check every offset and count;
anything missing, truncated, unknown (0, 9, 65535) or garbage means "as stored", never an error and never a panic. The pixel caps still run on the header size first (rotation does not change the pixel count).
Tests: `exif_test.go` (all eight orientations on a synthetic JPEG with a red marker in one corner, little endian, a real Pillow-written file `testdata/sideways-6.jpg` with a JFIF APP0 before the Exif APP1, rotate-before-scale, ten broken-EXIF shapes), `httpapi_test.go` (a sideways upload comes back 32x64).

## Keyboard and accessibility
- Group `role=group`, `aria-labelledby` the heading, `aria-describedby` helper + error, `aria-keyshortcuts="Control+V Meta+V"`, `aria-busy` while working.
- Errors `role=alert` (also `aria-invalid` on the link field); progress `role=status aria-live=polite`. The preview is `role=img` named after the picker.
- Every action is a real `<button>` with a name (icon buttons use IconButton); Tab order: file, Paste image, Paste link, Take photo, (rotate, remove). Enter/Space on Paste image reads the clipboard.
- Focus: link panel focuses its field and returns focus to "Paste link" on close; camera returns focus to "Take photo"; after Remove focus goes to the file button. Escape closes a panel.
- Camera region is `role=region` "Camera" (the primitive's own role), Capture is a labelled button, the video is decorative with the status text for the starting state.
- 44 px targets, visible `:focus-visible`, tokens only, reduced-motion respected.

## Server

New package `internal/images` (no HTTP, no SQL), `internal/images/refs` (the SQL), `internal/images/httpapi` (the module). The two image routes MOVE out of `internal/recipe/httpapi`
(a route cannot be mounted twice); the Recipes store keeps its own `imaging.Store` for `dropUnreferenced`.

| Route | Body | Success | Errors |
|---|---|---|---|
| `POST /api/images` | `{"dataUrl":"data:image/(jpeg\|png\|webp\|heic\|heif);base64,..."}` | 201 `{id,url,width,height}` (unchanged contract) | 400 `bad_request`; 413 `image_too_large`; 422 `unsupported_image`, `image_too_large_pixels` |
| `POST /api/images/from-url` | `{"url":"https://..."}` | 201, same body | 400 `bad_request`; 422 `image_url_invalid` (not https, no host, credentials, empty, data:/ftp:/file:); 422 `image_url_blocked` (private/loopback/link-local/metadata); 502 `image_url_unreachable` (status, DNS, connect, timeout, redirects); 413 `image_too_large`; 422 `unsupported_image`, `image_too_large_pixels` |
| `DELETE /api/images/{id}` | none | 204 (also when already gone) | 404 `not_found` (malformed id); 409 `image_in_use` |
| `GET /api/images/{id}` | | unchanged (WebP, `immutable`, `nosniff`) | |

All need a signed-in User (401 otherwise). Limits are imaging's, identical for file and URL: 8 MB after download, JPEG/PNG/WebP/HEIC/HEIF by magic bytes (the declared type must agree for data URLs; for URLs the sniffed type decides),
12000 px long edge, 50 MP, scaled to 1600 px, lossless WebP. The downloader's own cap is 10 MB (header/stream), the 8 MB limit is applied by `imaging` afterwards, so a 9 MB download answers 413 like a 9 MB upload.
Multipart stays refused (CSRF guard); the body is JSON. Request body cap for `from-url`: 4 KB.

**SSRF.** `images.Service.IngestURL` pre-validates (https, host, no userinfo; else `ErrURLInvalid`, no network) and then uses `imagefetch.Fetcher`, unchanged: DNS is resolved by the fetcher, EVERY address must be public
(`Blocked`: loopback, RFC 1918, link-local incl. 169.254.169.254, CGNAT, multicast, unspecified, NAT64/6to4/IPv4-mapped forms), the connection goes to the validated address, redirects (max 3) are re-checked, no proxy, no cookies, 15 s total.
Error mapping in the service (`errors.Is`): `ErrBlocked` -> `ErrURLBlocked`; `ErrNotHTTPS` -> `ErrURLInvalid`; `ErrTooLarge` -> `imaging.ErrTooLarge`; `ErrContentType` -> `imaging.ErrUnsupportedFormat` (`imagefetch` now allows `image/heic` and `image/heif` too); everything else -> `ErrURLUnreachable`.
`imagefetch` stays in `internal/recipefile/imagefetch` for now (moving it is churn for another team); `images` imports it. `httpapi.UseFetcher` is a test hook (the real fetcher refuses loopback, so tests cannot serve from httptest).

**Orphan clean-up** (the never-saved photo).
1. *At once, by the client*: the picker discards what it uploaded and the user dropped (`DELETE`). Refused with 409 when any record references it, so a bug or a replayed request cannot delete a live photo.
2. *Nightly backstop* `images.sweep` at 03:45 household time (`d.Scheduler.Daily`): deletes every `<id>.webp` that no record references and that is older than 24 h (strict), and `.tmp-*` files older than 1 h. The 24 h grace protects an editor left open overnight.
   Age comes from the file's mtime, which `Store.SaveAt` sets from the application clock (not the wall clock), so the fake clock drives it in tests.
3. *Fail closed*: `refs.Columns` lists every `(table, column)` holding an image id (`refs.Default`: `recipes.image`, `recipe_steps.image`; **a new image field must add its column there** or its photos would be swept after 24 h - the Ingredient-images team must do this, and `TestDefaultColumnsExistInTheRealSchema` is where to extend the check).
   A missing table/column or a bad identifier is an error and the sweep deletes NOTHING; `Discard` likewise.
4. Not covered: a photo the user uploaded and saved, then dropped by a later *save* is still handled by `dropUnreferenced` (unchanged).

`imaging.Store` additions (new file `list.go`): `SaveAt(data, at)`, `List() []Entry{ID, ModTime, Size}` (valid `<id>.webp` files only), `RemoveTemp(before)`.

## Icons (R12 owns `ui/icons.ts`; the bundle is at ~65.5 of 65.5 kB)
Existing keys cover: `delete` (Trash), `close`, `file` (FileArrowUp), `torch`, `cameraOff`, `error`, `copy`, `undo` (ArrowCounterClockwise).
IP1 needs these keys in the registry (`ImagePicker/icons.ts` lists them; `ImagePicker.a11y.test.tsx` fails until they exist):
| key | Phosphor module | new glyph? |
|---|---|---|
| `camera` | `Camera` | yes |
| `clipboard` | `ClipboardText` | yes |
| `link` | `LinkSimple` | yes |
| `rotateRight` | `ArrowClockwise` | yes |
| `rotateLeft` | `ArrowCounterClockwise` | no (same module as `undo`/`unarchive`) |
Decision (round 2): a separate small UI-foundations task slims the Phosphor import and adds `camera`, `clipboard`, `link` and `rotateRight` to `ui/icons.ts` BEFORE the IP1 Developer runs; `rotateLeft` reuses the existing `ArrowCounterClockwise`.
IP1 does not edit `icons.ts`; `ImagePicker.a11y.test.tsx` stays red until that task lands. The Crop button is text-only, so crop needs no glyph.

## Wiring edits (listed, not done now)
1. `web/src/ui/index.ts`: `export { ImagePicker } from './ImagePicker/ImagePicker'` and the types (`ImagePickerProps`, `RawImage`, `ImageSource`).
2. `web/src/ui/icons.ts`: the four glyphs above.
3. `web/src/ui/ViewfinderStrip.{tsx,css}`: props `label` (default "Scanner") and `size: 'strip' | 'photo'` (photo: `aspect-ratio: 4/3`, no reticle, `data-size="photo"`). IP1 already declared the props in the interface (stub) and wrote `ViewfinderStrip.photo.test.tsx`.
4. `web/src/ui/lib/useCamera.ts`: MOVE `useCamera`, `statusForCameraError` and types from `features/scan/hooks/useCamera.ts` (which then re-exports them, so scan imports and tests keep working) and add the `facingMode` option (default `'environment'`). IP1 already created the stub wrapper and `useCamera.facing.test.tsx`. ui must not import from features: the stub's import of the scan hook is temporary.
5. Backend: `internal/modules/images.go` (added by IP1, one line) imports the new module; remove `POST /api/images` and `GET /api/images/{id}` and their handlers (`uploadImage`, `image`, `writeImageErr` usage) from `internal/recipe/httpapi/httpapi.go`; keep `imaging.Store` there only for the Recipes store.
   Register `images.sweep` in the new module's mount. The existing `bdd` steps for Recipe images keep working unchanged (same routes, same contract).
Not edited by IP1: `ui/index.ts`, `icons.ts`, `strings.ts`, any file in R11a's list. The existing PhotoPicker/StepPhoto are untouched (migration is a later team).

## Files
New (frontend, all under `web/src/ui/ImagePicker/` unless noted): `ImagePicker.tsx` (+`.css`), `index.ts`, `types.ts`, `strings.ts`, `icons.ts`, `api.ts`, `testing.ts` (test helpers), `hooks/{useImagePicker,useImageIngest,useCameraCapture}.ts`,
`lib/{limits,problems,imageUrl,clipboard,prepare,cameraStrategy,crop}.ts`, `hooks/useCropper.ts`, `components/{PreviewPane,SourceActions,LinkPanel,CameraPanel,FileButton,CropEditor}.tsx` (+`CropEditor.css`); `web/src/ui/lib/useCamera.ts`.
New (backend): `internal/images/{images.go}`, `internal/images/refs/refs.go`, `internal/images/httpapi/httpapi.go`, `internal/imaging/{list,heic,exif}.go`, `internal/modules/images.go`.
Edited (backend, Developer): `internal/imaging/imaging.go` (accept heic/heif, apply EXIF), `internal/recipefile/imagefetch/imagefetch.go` (allow `image/heic`, `image/heif`), `go.mod`/`go.sum` (the HEIC decoder, after the verification above), `web/src/ui/ImagePicker/lib/limits.ts`, `strings.ts` (formats copy).
Edited later (wiring): see above. BDD: `bdd/features/images/image-ingest.feature`, `bdd/steps_images_test.go`.

## Tests (red first)
Frontend (vitest, jsdom; fakes in `ImagePicker/testing.ts`: fake MediaStream like the scan tests, ClipboardEvent-shaped `paste()` helper, fake engine/api/clipboard):
- `lib/problems.test.ts` file checks (types, 8 MB boundary, custom limit), API code to problem mapping, every message, limit named.
- `lib/imageUrl.test.ts` link parsing (https only, credentials, data URLs, trims), data URL to Blob and back.
- `lib/clipboard.test.ts` paste-event priority (file > link > html img > none, web-copied image, data URL), Clipboard API read (image, link, empty, denied, unsupported).
- `lib/prepare.test.ts` fit rules equal to the server's, turns, pass-through of an untouched file, downscale/re-encode rules, quality ladder, PNG vs JPEG, unreadable, bitmap closed.
- `lib/cameraStrategy.test.ts`; `api.test.ts` (routes, bodies, abort signal, discard never throws).
- `hooks/useImageIngest.test.tsx` upload pipeline, limits before any request, pre-shrink to 3200, links incl. data URL, server error mapping, phases, cancel/abort, superseded pick discarded, ownership.
- `hooks/useCameraCapture.test.tsx` fake stream: open/stop, capture only when ready, fallback flag per error, torch, switch camera, retry. `ui/lib/useCamera.facing.test.tsx` facingMode + unchanged scanner default.
- `ImagePicker.{empty,file,preview,paste,link,camera,raw,a11y}.test.tsx`, `ImagePicker.css.test.ts`, `ViewfinderStrip.photo.test.tsx`: each input path, preview/replace/remove/rotate, orphan discard rules, busy/cancel, errors and the size-limit message, raw-mode contract, keyboard and ARIA, icons in the registry.
Backend (Go): `imaging/list_test.go`; `images/images_test.go` (ingest, URL mapping, real SSRF fetcher against private DNS answers, limits, Discard, Sweep incl. strict boundary, fail-closed, temp files);
`images/refs/refs_test.go`; `images/httpapi/httpapi_test.go` (upload contract, refusals, auth, from-url success/failure/private targets with the production fetcher, DELETE, nightly sweep with the fake clock, Step photo kept).
BDD `image-ingest.feature`: link download + WebP, refused links (outline), non-image/too-big link, never-saved clean-up, discard at once but not when a Recipe uses it.
Round 2 adds: `lib/crop.test.ts`, `hooks/useCropper.test.tsx`, `components/CropEditor.{test.tsx,css.test.ts}`, `ImagePicker.crop.test.tsx`, crop and HEIC cases in `lib/prepare.test.ts`, `lib/problems.test.ts` (HEIC accepted, by name when the type is empty),
`ImagePicker.file/empty/raw.test.tsx`, `hooks/useImageIngest.test.tsx` (HEIC sent untouched; raw mode decode or message); Go: `imaging/heic_test.go`, `imaging/exif_test.go`, `imagefetch` (HEIC content types), `images/httpapi` (HEIC upload and link, limits, sideways JPEG), BDD scenarios "An iPhone photo (HEIC) is converted to WebP" and "A photo taken sideways is stored upright".
The existing tests that said HEIC is refused (formats message, helper text, `accept` attribute, `checkImageFile`) were changed to the new rule.
State at hand-off: only these new tests are red; the other 361 web test files, the Go suites and the 40+ existing BDD scenarios are green. A few new tests pass against the stubs on purpose (negative assertions).

## Product questions

Answered by the user (round 2): icons by a separate foundations task; HEIC converted on the server; crop now (aspect per use, rotate, keyboard and touch friendly, no focal point); orphan sweep 24 h at 03:45; any User may delete an unreferenced
image (the picker deletes only its own uploads); the server also fixes EXIF orientation; Recipe Assistant raw mode returns data URLs or https URLs, downscaled to 2576 px.

Open for the PM:
1. **HEIC decoder and licence.** `gen2brain/heic` (wasm via wazero) is the only candidate found that keeps `CGO_ENABLED=0` and the distroless-static image, but it is LGPL-3.0, adds a few MB and was not downloaded or verified here. Accept it, or keep HEIC refused? (See "HEIC / HEIF".)
2. **Crop on demand or right after a pick?** Built as on-demand (a Crop button next to Rotate). `cropOnPick` is a small extension if the Recipe form should always frame 4:3 photos immediately.
3. A real iPhone HEIC sample for the fixtures (the synthetic ones are valid but not iPhone-shaped).
4. Hosts must choose `aspect` (Recipe and Ingredient: 4/3, Member: 1) when they migrate to the picker; the display (`object-fit: cover`) crops anyway if a stored picture has another shape.
