# IP1: the shared ImagePicker and one server ingest path

One image component for every image field, one server path for every stored image. IP1 builds the primitive, its hooks and libs, the ingest
endpoints and the orphan clean-up. It does NOT migrate the existing fields (Recipe photo, Step photo: a later team) and does NOT add Ingredient
images (a later team). The Recipe Assistant's "Read from a photo" is a later consumer of the raw mode.

## Findings in the current code
- Upload today: `PhotoPicker` / `StepPhoto` (recipes feature) -> `FileDrop accept="image/*"` -> `recipesApi.uploadImage` (JSON `{dataUrl}`) -> `POST /api/images`
  in `internal/recipe/httpapi` -> `imaging.ProcessDataURL` (JPEG/PNG/WebP only, 8 MB, 12000 px / 50 MP, scaled to 1600 px, lossless WebP) -> `imaging.Store.Save`.
  The route lives in the Recipes module, which is wrong for a shared path.
- Recipe File images already use `imagefetch.Fetcher` (https only, DNS resolved by us and every address checked at connect time and on every redirect,
  10 MB, JPEG/PNG/WebP content type, 15 s). Reused as is.
- Orphans: `recipe/store.dropUnreferenced` removes a photo when a *save* replaces or removes it. A photo uploaded in the editor and never saved
  (tab closed, Cancel, replaced twice before saving) is never referenced, so its file stays in `/data/images` for ever. This is the "never-saved photo" follow-up.
- Server does NOT apply EXIF orientation (documented limit in `imaging`). Phone photos arrive sideways. The picker fixes it on the client
  (`createImageBitmap(blob, {imageOrientation: 'from-image'})`), so the limit stops mattering for everything that goes through the picker.
- The scanner camera (`features/scan/hooks/useCamera`) and `ViewfinderStrip` (140 px strip, barcode reticle, region "Scanner") are the camera primitives to build on.
- `FileDrop` already filters by `accept` and reports rejects; the native `<input type=file>` stays inside it (allowed under `web/src/ui`).

## UX

The picker is one labelled group inside whatever Tile the host uses (it is not a Tile itself).

```
Recipe photo                                  <- heading, names the group
[ preview, hero 16:9 or 72 px thumb ]         <- only when there is a picture
[ Rotate left ] [ Rotate right ] [ Remove image ]
+ - - - - - - - - - - - - - - - - - - - - +
|   Choose a file or drop it here         |   <- FileDrop (label "Add an image" / "Replace image")
+ - - - - - - - - - - - - - - - - - - - - +
[ Paste image ] [ Paste link ] [ Take photo ]  <- 44 px buttons with Phosphor icons
JPEG, PNG or WebP, up to 8 MB.                 <- helper (host helper replaces it)
<panel: link field | camera viewfinder>        <- at most one open
<status: Uploading the image  [Cancel]>        <- role=status
<error: ...>                                   <- role=alert
```

States: **empty**, **filled** (preview + Rotate/Remove), **busy** (preparing / uploading / downloading: status line, Cancel, every action disabled,
`aria-busy`), **error** (the previous value is kept; the message sits under the actions; cleared by the next successful pick or by opening a panel),
**panel open** (link or camera; opening one closes the other and stops the camera), **broken preview** ("The image could not be shown." with Replace and Remove still working).

Sources (`sources` prop, default all four):
- **File**: FileDrop (browse + drag and drop), `accept="image/jpeg,image/png,image/webp"`. A dropped GIF/HEIC/PDF is rejected by FileDrop's `onReject` and shown as the formats message.
- **Paste**: (a) the `paste` event on the picker (any control inside it; focus on "Choose a file", "Paste image", ... all work) and, with `listenOn="dialog"`, on the enclosing
  `<dialog>` / BottomSheet, so Ctrl+V works anywhere in the sheet. Not intercepted when the target is an input/textarea (the link field pastes text normally).
  (b) the **Paste image** button reads `navigator.clipboard.read()` (falls back to `readText()` for a link). When the browser refuses or has no Clipboard API, the
  message says "Press Ctrl+V (Cmd+V on a Mac) while this box is focused", which always works. Clipboard content: image file > text/plain https link or data:image URL > `<img src>` in text/html > nothing ("No picture on the clipboard").
- **Link**: "Paste link" opens a labelled TextField "Image link" (focused), "Use link" / Enter submits, Escape/Cancel closes and returns focus to the button. Client check is only a hint (https, no credentials);
  the **server** downloads it (upload mode). Errors: not https, private address, could not be downloaded, too large, not an image.
- **Camera**: "Take photo" opens the shared **viewfinder** (see "Camera" below) with Capture, Close camera, torch (when supported) and Switch camera (when more than one video input).
  Capture closes the panel and runs the picture through the normal pipeline. If the camera cannot be used (denied, none, in use, error) an alert says why and "Use the camera app" appears.
  That button, and "Take photo" itself on a phone where `getUserMedia` is missing (plain http) or in an iOS home-screen app, open a hidden `<input type=file accept="image/*" capture="environment">` inside the picker (the camera app; better there than a flaky `getUserMedia`).
  A desktop without `getUserMedia` shows no camera button.

Preview, replace, remove, rotate:
- Replace = choose any source again. Remove = `onChange('')` / `onChange(null)`.
- **Rotate** left/right (90 degrees, client-side canvas; cheap, and it fixes sideways photos). Upload mode: loads the stored image, turns it, uploads the result as a NEW image, swaps the id.
  Raw mode: turns the held Blob in place. Not offered for a raw link value. **Crop and focal point are out of IP1** (see product questions).
- Pre-shrink: upload mode scales to at most 3200 px on the long edge before sending (a 200 MP phone photo would break the server's 50 MP cap and the 8 MB limit); the server then scales to 1600.
  A picture that already fits (size, pixels, bytes) and is not rotated is sent byte for byte, not re-encoded. Camera frames are always re-encoded (they come from a canvas).
  PNG stays PNG, everything else is re-encoded as JPEG q0.9, lowered to 0.6 while over the byte limit.
- Progress is **indeterminate** ("Preparing", "Uploading", "Downloading the image") because the shared http client uses `fetch`, which has no upload progress; Cancel aborts the request (AbortController).

Copy (strings in `web/src/ui/ImagePicker/strings.ts`, English). Glossary: no Avoid words; "Recipe photo" / "Step" are the host's labels.
Messages: unsupported "That is not a JPEG, PNG or WebP image."; too large "The image is larger than N MB." (N = the active limit); too many pixels; empty; unreadable
("This browser cannot read that image. Try a JPEG or PNG."); link: empty "Paste the link of a picture.", invalid "The link must start with https://", blocked "Feeder cannot download from a private address.",
unreachable "The image could not be downloaded from that link."; clipboard: empty "There is no picture on the clipboard.", denied/unsupported (both include the Ctrl+V hint);
camera "The camera cannot be used here."; offline; failed "The image could not be added. Try again."

## Component API (`web/src/ui/ImagePicker/`)

```tsx
<ImagePicker label="Recipe photo" value={imageId} onChange={setImageId} />                       // upload mode (default)
<ImagePicker mode="raw" label="Photo of the recipe" value={raw} onChange={setRaw} maxSide={2576} output="dataUrl" />
```
Common props: `label` (heading + group name), `helper`, `error` (host error, wins over the picker's own), `disabled`, `sources`, `listenOn: 'picker' | 'dialog'`, `size: 'hero' | 72`, `deps` (test seams: `api`, `engine`, `mediaDevices`, `clipboard`, `grabFrame`, `objectUrls`).

- **Upload mode** (entity photos): `value` = stored image id or ''. Every pick is prepared on the client, sent to the server, and `onChange(newId)` is called when the server has it.
  The picker remembers the ids IT uploaded; when the user removes or replaces one of those it calls `DELETE /api/images/{id}` at once (no orphan). It never deletes an id that came from `value` (the saved entity still uses it; the entity save + `dropUnreferenced` handle it).
- **Raw mode** (Recipe Assistant): nothing is uploaded. `onChange(RawImage | null)` with
  `{kind:'blob', blob, dataUrl?, width, height, type, origin}` (downscaled to `maxSide`, default 2576 px; limited to `maxBytes`, default 8 MB; `dataUrl` only with `output="dataUrl"`)
  or `{kind:'url', url}` for a pasted https link, passed through untouched (the consumer's server fetches it with the same SSRF fetcher; the picker never fetches it). A pasted `data:image/...` URL becomes a blob.
  Preview of a blob uses an object URL, revoked on replace/remove/unmount.
- Layers (CLAUDE.md): `ImagePicker.tsx` renders and wires (thin); `hooks/useImagePicker` (orchestration), `useImageIngest` (upload pipeline), `useCameraCapture`; plain TS in `lib/`
  (`problems`, `imageUrl`, `clipboard`, `prepare`, `cameraStrategy`, `limits`); `api.ts` is the only HTTP. Sub-components: `PreviewPane`, `SourceActions`, `LinkPanel`, `CameraPanel`, `FileButton` (button + hidden capture input).

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
| `POST /api/images` | `{"dataUrl":"data:image/(jpeg\|png\|webp);base64,..."}` | 201 `{id,url,width,height}` (unchanged contract) | 400 `bad_request`; 413 `image_too_large`; 422 `unsupported_image`, `image_too_large_pixels` |
| `POST /api/images/from-url` | `{"url":"https://..."}` | 201, same body | 400 `bad_request`; 422 `image_url_invalid` (not https, no host, credentials, empty, data:/ftp:/file:); 422 `image_url_blocked` (private/loopback/link-local/metadata); 502 `image_url_unreachable` (status, DNS, connect, timeout, redirects); 413 `image_too_large`; 422 `unsupported_image`, `image_too_large_pixels` |
| `DELETE /api/images/{id}` | none | 204 (also when already gone) | 404 `not_found` (malformed id); 409 `image_in_use` |
| `GET /api/images/{id}` | | unchanged (WebP, `immutable`, `nosniff`) | |

All need a signed-in User (401 otherwise). Limits are imaging's, identical for file and URL: 8 MB after download, JPEG/PNG/WebP by magic bytes (the declared type must agree for data URLs; for URLs the sniffed type decides),
12000 px long edge, 50 MP, scaled to 1600 px, lossless WebP. The downloader's own cap is 10 MB (header/stream), the 8 MB limit is applied by `imaging` afterwards, so a 9 MB download answers 413 like a 9 MB upload.
Multipart stays refused (CSRF guard); the body is JSON. Request body cap for `from-url`: 4 KB.

**SSRF.** `images.Service.IngestURL` pre-validates (https, host, no userinfo; else `ErrURLInvalid`, no network) and then uses `imagefetch.Fetcher`, unchanged: DNS is resolved by the fetcher, EVERY address must be public
(`Blocked`: loopback, RFC 1918, link-local incl. 169.254.169.254, CGNAT, multicast, unspecified, NAT64/6to4/IPv4-mapped forms), the connection goes to the validated address, redirects (max 3) are re-checked, no proxy, no cookies, 15 s total.
Error mapping in the service (`errors.Is`): `ErrBlocked` -> `ErrURLBlocked`; `ErrNotHTTPS` -> `ErrURLInvalid`; `ErrTooLarge` -> `imaging.ErrTooLarge`; `ErrContentType` -> `imaging.ErrUnsupportedFormat`; everything else -> `ErrURLUnreachable`.
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
Four new glyphs (roughly 0.4-0.6 kB each, about 2 kB gzipped in total) against a full budget: **a budget decision is needed** (raise the cap by about 2 kB, or drop a rarely used glyph). Fallbacks if refused: `file` for paste image, `copy` for paste link, no rotate (rotate is the optional feature).

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
`lib/{limits,problems,imageUrl,clipboard,prepare,cameraStrategy}.ts`, `components/{PreviewPane,SourceActions,LinkPanel,CameraPanel,FileButton}.tsx`; `web/src/ui/lib/useCamera.ts`.
New (backend): `internal/images/{images.go}`, `internal/images/refs/refs.go`, `internal/images/httpapi/httpapi.go`, `internal/imaging/list.go`, `internal/modules/images.go`.
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
State at hand-off: only these new tests are red; the other 361 web test files, the Go suites and the 40+ existing BDD scenarios are green. A few new tests pass against the stubs on purpose (negative assertions).

## Product questions
1. Crop / focal point: IP1 ships rotate only. A focal point needs a column per entity (`image_focus`), crop needs a UI. Wanted now or later?
2. HEIC/HEIF (iPhone photos chosen from the library when "Most Compatible" is off): refused with "Try a JPEG or PNG". Converting needs a decoder library (about 300 kB) - acceptable? Camera capture and `capture` input already give JPEG.
3. The Recipe Assistant: one picture or several per message? (`ImagePicker` raw mode is single; `multiple` is a small extension.) Should a pasted link be fetched by the Assistant's server (our assumption) or turned into bytes by the picker?
4. Icon budget: OK to add about 2 kB for four glyphs, or drop rotate / reuse `file` and `copy`?
5. Orphan grace 24 h and the nightly time (03:45): fine? Any image field that is edited for longer than a day would lose an unsaved upload.
6. Should any signed-in User be able to DELETE an unreferenced image, or only the uploader? (Single household, so we allow any; there is no uploader column.)
