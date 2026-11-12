# PHOTO-READ: the photo Recipe read workflow (1.0.0-beta.4.1)

Status: design (pipeline step 1, docs only), revised after the Opus design review. Branch `team/photo-read`, from main `7c38a53`.

Inputs: the user's decisions for 1.0.0-beta.4.1 (below), [ra-e-import.md](ra-e-import.md) (section 4.6, the photo slots this replaces),
[ip1-imagepicker.md](ip1-imagepicker.md) ("Crop", "HEIC / HEIF"), [sort-drag.md](sort-drag.md) (the shared Sortable),
[ADR 0006](../../adr/0006-recipe-assistant-calls-anthropic-from-the-server.md) (the Recipe Assistant), [ADR 0007](../../adr/0007-heic-decoding-with-h265.md) (HEIC on the server),
[recipe-file.md](../../spec/recipe-file.md) ("Recipe Assistant": photos reach the model "in page order"), [GLOSSARY.md](../../../GLOSSARY.md), [ux-brief.md](../../design/ux-brief.md) (Bento).

## 0. User decisions (final) and what exists today

Decisions:
1. **No live camera view** for the photo read. On a phone the picture is taken with the phone's own camera app (a hidden `<input type=file accept="image/*" capture="environment">`)
   or chosen from the photo library or files. On a computer: the file picker, paste and drop, as today.
2. **An edit step after each photo**: turn left or right a quarter turn at a time; a free-shaped crop box with drag handles, keyboard accessible; our own components and Phosphor
   icons only; EXIF orientation is applied first.
3. **Up to 4 photos** per read (`MAX_PHOTOS = 4` stays). Take, turn and crop each in turn; reorder, remove and edit again. **Read recipe** then sends all of them, in order, to the
   existing read flow, shrunk to a long side of 2,576 px after the crop and the turn.
4. Logic in libs and hooks; turn and crop maths unit-tested in plain TypeScript; components only render.
5. The other uses of ImagePicker (Recipe photo, Ingredient and Product Picture, Member photo) keep their behaviour.

What the code does today (main `7c38a53`):
- `features/import/components/ReadPhotoPanel.tsx` renders one `ImagePicker mode="raw"` per slot (`lib/photoSlots.ts`: filled slots plus one trailing empty one, at most 4),
  `maxSide={2576}`, `aspect="free"`, `output="dataUrl"`. `ReadRecipeStep` turns `filledPhotos(slots)` into `ReadInput {kind:'photo', photos: RawImage[]}`; `useRecipeRead.start`
  checks it with `lib/readRequest.buildReadRequest` (1 to 4 photos, data URL `jpeg|png|gif|webp`, at most 8 MiB, or an https link) and POSTs it.
- The picker already owns everything the edit step needs, but **inside ImagePicker**: `lib/crop.ts` (free and locked crop maths in turned-image pixels, `rotateCrop`,
  `rectInSource`, `MIN_CROP_PX = 16`), `lib/prepare.ts` (`prepareImage`: decode with `createImageBitmap(..., {imageOrientation: 'from-image'})`, turn, crop, shrink to
  `maxSide`, JPEG 0.9 lowered to 0.6 while over `maxBytes`; `browserEngine.encode` draws the crop and the turn in one `drawImage`), `hooks/useCropper.ts` (turns, rect,
  pointer drag, arrow-key nudges: 1 % of the long side, x10 with Shift) and `components/CropEditor.tsx` (stage, crop box, 8 handles of at least 44 px, read-out, Rotate left,
  Rotate right, Reset, Cancel, Use crop). It is uncontrolled: it always opens at no turn and the whole picture, so it cannot reopen a page with its earlier edit.
- `lib/cameraStrategy.ts`: `iosStandalone -> capture-input`; no `getUserMedia` -> `capture-input` on a coarse pointer, else `none`; otherwise `viewfinder`. In the Read step on
  a phone with `getUserMedia` this opens our viewfinder, which decision 1 removes.
- Raw mode refuses a file over 8 MB **before** shrinking (`checkImageFile(file, maxBytes)` in `useRawIngest`), so a large phone original is refused even though what is sent
  would be small. A HEIC that the browser cannot decode (everything but Safari) fails as `unreadable` in raw mode; the server, however, accepts `data:image/heic` and
  `data:image/heif` for reads (`imaging.PrepareForModelAs`, ADR 0007) and turns them upright.
- The server already enforces 1 to 4 photos (`too_many_photos`), 8 MB each, and a 45 MiB body; the BDD feature `bdd/features/recipe-assistant/photo.feature` covers
  "Five photos are refused" and "Two photos reach the model ... as JPEG within 2,576 px". It does not check the order.

## 1. Key decisions of this design

| # | Decision | Why |
|---|---|---|
| D1 | The Photo tab stops using ImagePicker. It gets its own panel: **sources** (Take photo, Choose photos / Choose files, paste, drop), a **photo list** in page order, and an **editor**. | One picker per slot cannot show a list with reorder, cannot open an edit step after every capture and offers the viewfinder. |
| D2 | **Extract `ui/ImageEditor` now** (turn plus free or locked crop, controlled), and make ImagePicker's `CropEditor` a thin wrapper over it. A move, not a rewrite: ImagePicker's behaviour and tests stay. See section 9. | The read flow needs exactly that editor, plus a controlled value (re-edit), its own action buttons and a larger minimum crop. Copying markup between screens is forbidden; reaching into ImagePicker internals would couple the two. |
| D3 | Edits are **non-destructive**: each photo keeps an upright **working copy** and an edit `{turns, crop}`; the photo that is sent is rendered from the working copy. Edit again reopens the working copy with the saved edit. | Edit again must not lose pixels already cropped away, and a second crop must not pile JPEG losses. |
| D4 | The working copy is made once, when a photo is added: EXIF applied, long side at most **4,096 px** and area at most **16,777,216 px**, **always JPEG** (0.92). The original bytes are kept as the working copy only when they are a JPEG with orientation 1 (`o === 1`), within that size and at most 8 MB (`keepOriginal`, section 3.5). A PNG or WebP always gets a JPEG working copy, so **every photo sent is a JPEG**. | iOS Safari refuses canvases above 16.7 MP; one normalisation keeps every later canvas safe and lets the editor and `<img>` agree on the pixel size. One output format keeps the render rule simple (the model gets JPEG anyway). |
| D5 | The photo that is sent is rendered when **Use photo** is pressed (not when Read recipe is pressed), one at a time, and cached until the photo is edited again or removed. | Read recipe is instant; one render at a time caps peak memory on phones. |
| D6 | `cameraStrategy` gains a policy argument: `cameraStrategy(env, 'system')` never returns `viewfinder`. Only the read flow passes it; ImagePicker keeps the default `'live'`. | Decision 1, without touching the other pickers (section 10). |
| D7 | The list reuses the shared **`ui/Sortable`** (drag handle, keyboard lift and move, live announcements). | It exists, is accessible and tested; no new reorder code. |
| D8 | A HEIC (or any picture) the browser cannot decode is still accepted: it is listed **without a preview and without editing**, and sent as it is (`data:image/heic`). The server turns it upright (ADR 0007). `readRequest` accepts `heic|heif` data URLs. | Chrome and Firefox cannot decode HEIC, the server can. Refusing it would be a regression for Android phones that save HEIC. |
| D9 | The input limit for an original is **30 MB and 50 MP**. The 50 MP check is made **before decoding** from the JPEG SOF, the PNG IHDR or the WebP VP8/VP8L/VP8X header (pure functions, section 3.1), and after decoding when no header size can be read (HEIC on Safari, a header past the first 128 KB). What is **sent** stays at most 8 MB, 2,576 px. | The original never leaves the phone; the 8 MB check belongs to what is sent. |
| D10 | The editor is **inline** in the Photo panel (it takes the place of the list while open), like ImagePicker's crop today, not a Dialog. | The shared Dialog has no full-screen size; an inline editor avoids a modal over the camera return and keeps the tests simple. |
| D11 | Read recipe (the existing button of the step) is the "send". No new send button. It is turned off while the editor is open or a photo is still being prepared. | One primary action per step (Bento); the read flow stays as it is. |
| D12 | UI words: the things are **photos** ("Photo 2"), in **page order**. Not "page" (the Web page tab already uses it), not "image" in copy. Buttons avoid the GLOSSARY's _Avoid_ words: **Use photo** (not "Done"), **Remove photo** (not "Discard"). | GLOSSARY: Photo; Cooked _Avoid_ "Done"; Throw Out _Avoid_ "Discard"; Photo _Avoid_ "Thumbnail", "upload". |

## 2. State model

Plain TypeScript in `features/import/lib/photoPages.ts` (replaces `lib/photoSlots.ts`). A reducer plus selectors; no React, no DOM, no Blob reads.

```ts
export const MAX_PHOTOS = 4

export type PhotoId = string                       // 'p1', 'p2', ... from a counter in the state (no Math.random)

/** What a photo was made from. */
export type PhotoSource =
  | { kind: 'image'; working: Blob; width: number; height: number; origin: ImageOrigin }   // upright working copy (D4)
  | { kind: 'as-is'; blob: Blob; type: 'image/heic' | 'image/heif'; name?: string }          // not decodable here (D8); `type` is the DECLARED type (below)
  | { kind: 'link'; url: string }                                                            // a pasted https image link (server fetches it)

// ImageEdit { turns: 0 | 1 | 2 | 3; crop: Rect } is imported from the ui barrel (ui/ImageEditor/lib/edit.ts): crop in pixels of the TURNED working copy.

export type PhotoOutput =
  | { status: 'pending' }                                            // waiting for, or in, a render
  | { status: 'ready'; blob: Blob; width: number; height: number; type: string }
  | { status: 'failed'; problem: PhotoProblem }

export interface Photo {
  id: PhotoId
  source: PhotoSource
  edit: ImageEdit | null        // null = never edited (whole picture, no turn); always null for 'as-is' and 'link'
  output: PhotoOutput           // 'as-is' and 'link' are 'ready' at once (nothing to render)
  /** Bumped by every commit; a render answers for one revision and is ignored if the photo moved on. */
  revision: number
}

export interface EditSession {
  id: PhotoId
  draft: ImageEdit
  /** true right after Take or Choose: Cancel removes the photo ("Retake" on the camera path); false for Edit again: Cancel keeps the saved edit. */
  isNew: boolean
}

export type PhotoProblem =
  | ImageProblemCode            // from ui/ImagePicker lib/problems (unsupported, too_large, too_many_pixels, empty, unreadable, link_*, clipboard_*, failed)
  | 'too_many_photos'           // a pick or paste that would go past 4
  | 'render_failed'             // the canvas refused (iOS memory, no 2d context, encode null)

export interface PhotoPagesState {
  photos: Photo[]                // page order = send order
  editing: EditSession | null
  /** Files of a multi-pick still waiting for their edit step, in the order the system gave them. */
  queue: File[]
  /** 'preparing' while a file is being turned into a working copy. */
  intake: 'idle' | 'preparing'
  /** The panel's message (one at a time; the newest wins); cleared by the next successful add or by dismiss.
   *  `limit` says which byte limit a `too_large` broke: 'original' (30 MB, section 3.5 step 1) or 'as-is' (8 MB, a HEIC sent as it is). */
  problem: { code: PhotoProblem; photo?: PhotoId; count?: number; limit?: 'original' | 'as-is' } | null
  nextId: number
}
```

Actions (`photoPagesReducer(state, action)`):

| Action | Effect |
|---|---|
| `intakeStarted` / `intakeEnded` | `intakeStarted` takes `queue[0]` off the queue and sets `intake = 'preparing'`; `intakeEnded` sets it back to `'idle'` (after `added` or a problem). |
| `queued(files)` | Keeps the first `room` files, `room = MAX_PHOTOS - photos.length - queue.length - (intake === 'preparing' ? 1 : 0)` (never below 0), appends them to `queue`; extra files set `problem {code: 'too_many_photos', count: dropped}`. A new photo in the editor is already in `photos` (`added` appends it), so it is not counted again. |
| `added(source)` | Appends a photo (`edit: null`, `revision: 0`; `output` `pending` for `image`, `ready` for the others) and, for `image`, opens `editing {id, draft: initialEdit(size), isNew: true}`. Refused (no change, `too_many_photos`) at 4. |
| `editStarted(id)` | `editing {id, draft: photo.edit ?? initialEdit(size), isNew: false}`. Ignored for `as-is` and `link`. |
| `draftChanged(draft)` | Replaces `editing.draft` (the ImageEditor is controlled). |
| `editCommitted` | `photo.edit = isFull(draft) ? null : draft`, `revision + 1`, `output = pending`, `editing = null`. |
| `editCancelled` | `isNew` ? the photo is removed : the saved edit stays; `editing = null`. |
| `removed(id)` | Removes it (closes the editor if it was on it). |
| `moved(from, to)` | `moveItem` from `ui/Sortable` (the owner computes the list, sort-drag.md section 1). Refused while editing. |
| `rendered(id, revision, out)` / `renderFailed(id, revision, problem)` | Applied only when `revision` matches. |
| `problemSet(p)` / `problemCleared` | The panel message. |

Selectors: `canAdd(state)` (`photos.length + queue.length + (intake === 'preparing' ? 1 : 0) < 4 && !editing`), `count(state)`,
`nextToIntake(state)` (`queue[0]` only when `editing === null` and `intake === 'idle'`, else `undefined`), `nextToRender(state)` (the first `image` photo with
`output pending` and no edit open on it), `readyToSend(state)` (`photos.length > 0`, no editor, empty `queue`, no `intake`, every output `ready`), `blockReason(state)`
(why Read recipe is off: `'editing' | 'preparing' | { failed: PhotoId } | null`, section 5), `toReadInput(state, dataUrls)` (section 4.1), `photoNumber(state, id)`
(1-based position, for labels), `draftOutputSize(state)` (`outputSize(editing.draft.crop, READ_MAX_SIDE)`, for the editor's small-photo warning).

**Small photo, defined once here**: `SMALL_PHOTO_SIDE = 1000` and `isSmallPhoto(size: Size): boolean` = `Math.max(size.width, size.height) < SMALL_PHOTO_SIDE`. The row
calls it with a `ready` output's size, the editor with `draftOutputSize(state)`; no other file defines or repeats the rule. `READ_MIN_CROP_PX = 160` (section 3.3) lives here too.

**The queue and the editor.** The hook's intake effect runs on `nextToIntake(state)`, so the intake of `queue[0]` **waits while an editor is open** (a new or an existing
photo). Both `editCommitted` and `editCancelled` set `editing = null`, so **both move on to the next queued file**: Cancel on a new queued photo removes that photo and the
next file opens in the editor, exactly as Use photo does. Remove while a queue is waiting does not clear the queue.

Invariants (unit-tested): never more than 4 photos, and `photos.length + queue.length + preparing` never above 4; ids are unique and stable across reorder (React keys);
at most one edit session; a `pending` or `failed` output never goes to the server; order of `photos` is the only order (the list, the labels "Photo n" and the request all
read it).

A **`failed`** output (render refused, or still over 8 MB at quality 0.6): `readyToSend` is false and `blockReason` is `{failed: id}`, so the Read button is off with the
reason "Photo 2 could not be prepared. Edit it again or remove it."; the row shows the failure and keeps **Edit photo 2** and **Remove photo 2**. Edit again then Use photo
bumps the revision and sets `pending`, so the render is tried again (a smaller crop usually fits).

## 3. Pure libs

All plain TypeScript, no React, no DOM except where noted as an engine adapter. Files and owners in section 12.

### 3.1 EXIF orientation (`ui/ImageEditor/lib/exif.ts`)

```ts
export type Orientation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8
export interface JpegInfo { orientation: Orientation; width?: number; height?: number }   // width/height from SOF0..SOF15 (not 4, 8, 12), stored (un-oriented) size

/** Reads APP1 "Exif\0\0" (TIFF II or MM, IFD0 tag 0x0112 SHORT) and the first SOF from the first 128 KB. Bounds-checked; anything odd -> orientation 1, no size. Not a JPEG -> {orientation: 1}. */
export function readJpegInfo(bytes: Uint8Array): JpegInfo
/** What to do to the STORED pixels to show them upright: `turns` clockwise quarter turns, then a horizontal mirror when `mirror`. */
export function orientationOps(o: Orientation): { turns: 0 | 1 | 2 | 3; mirror: boolean }
//   1 {0,false}  2 {0,true}  3 {2,false}  4 {2,true}  5 {1,true}  6 {1,false}  7 {3,true}  8 {3,false}
/** The upright size: width and height swapped for 5..8. */
export function orientedSize(width: number, height: number, o: Orientation): { width: number; height: number }
/** True when the engine must apply `o` itself: only when the browser does not (probe) and o !== 1. */
export function needsManualOrientation(browserApplies: boolean, o: Orientation): boolean
```

Browser behaviour: current Safari, Chrome and Firefox apply EXIF orientation both when they decode (`createImageBitmap` with `imageOrientation: 'from-image'`) and when they show
an `<img>` (`image-orientation: from-image` is the default). Applying it a second time would turn the photo twice, so the engine does not apply it blindly. It **probes once**
(`ui/ImageEditor/lib/engine.ts`, not pure): it decodes a built-in 2 x 1 px JPEG carrying orientation 6; a result of 1 x 2 means the browser applies EXIF. Only when it does not,
the working-copy step draws with `orientationOps`. The probe result is cached for the session and injectable (tests).

HEIC: the decoder (Safari) applies `irot`/`imir` itself; we do not parse HEIC. An `as-is` HEIC is turned upright by the server (ADR 0007 guard 6).

**Header sizes before decoding (`ui/ImageEditor/lib/header.ts`, pure, T2).** The 50 MP check (D9) reads the size from the first 128 KB without decoding:

```ts
export interface HeaderSize { format: 'jpeg' | 'png' | 'webp'; width: number; height: number }
/** By magic bytes: JPEG (FF D8) -> readJpegInfo's SOF size; PNG -> readPngSize; RIFF....WEBP -> readWebpSize. null for anything else, truncated or odd. */
export function readHeaderSize(bytes: Uint8Array): HeaderSize | null
/** Signature 89 50 4E 47 0D 0A 1A 0A, then the first chunk must be "IHDR" (bytes 12..15): width = big-endian u32 at 16, height = big-endian u32 at 20. 0 -> null. */
export function readPngSize(bytes: Uint8Array): { width: number; height: number } | null
/**
 * "RIFF" at 0, "WEBP" at 8, the first chunk's FourCC at 12:
 *  "VP8 " (lossy): start code 9D 01 2A at 23..25; width = little-endian u16 at 26 & 0x3FFF, height = LE u16 at 28 & 0x3FFF.
 *  "VP8L" (lossless): signature 0x2F at 20; b = LE u32 at 21; width = (b & 0x3FFF) + 1, height = ((b >>> 14) & 0x3FFF) + 1.
 *  "VP8X" (extended): width = 1 + LE u24 at 24, height = 1 + LE u24 at 27 (the canvas size; may exceed 16,383).
 * Anything else or out of bounds -> null.
 */
export function readWebpSize(bytes: Uint8Array): { width: number; height: number } | null
```

When `readHeaderSize` returns null (HEIC, a JPEG whose SOF lies past 128 KB behind large APP segments), the check is made after decoding (section 3.5 step 2); that is the
only case where an over-50 MP picture is decoded before it is refused (section 8).

### 3.2 Turn maths (`ui/ImageEditor/lib/turns.ts`, moved out of `ImagePicker/lib/prepare.ts`)

`type Turns = 0 | 1 | 2 | 3`; `addTurn(current, delta: 1 | -1)` ((current + delta + 4) mod 4); `turnedSize(w, h, turns)` (odd turns swap). `prepare.ts` re-exports them so
its callers and tests stay unchanged.

### 3.3 Crop maths under a turn (`ui/ImageEditor/lib/crop.ts`, moved from `ImagePicker/lib/crop.ts`)

The convention stays: every rect is in **pixels of the turned working copy**, integers, origin top-left. Already there and kept as they are: `initialCrop`, `clampRect`,
`moveRect`, `resizeRect` (free: an edge moves one side, a corner two, the opposite sides stay; locked: corners only, opposite corner anchored), `rotateCrop` (free: the same area
mapped through the quarter turn, clockwise `x' = H - y - h, y' = x, w' = h, h' = w`; locked: starts again centred), `rectInSource` (inverse, turned -> working-copy pixels),
`outputSize` (`fitWithin(maxSide)`, never enlarges), `rectToPercent`, `isFullImage`, `handlesFor`, `handleLabel`.

One change: **the minimum crop side becomes a parameter** `minSide` (default `MIN_CROP_PX = 16`, so ImagePicker is unchanged):
`clampRect(rect, bounds, minSide?)`, `moveRect(..., minSide?)`, `resizeRect(..., aspect, minSide?)`. The effective minimum is `min(minSide, bounds side)`, as today with 16.
The read flow passes **`READ_MIN_CROP_PX = 160`** (working-copy pixels; a crop smaller than that holds no legible text) through the editor's `minSide` prop.

`READ_MIN_CROP_PX` is defined in `features/import/lib/photoPages.ts` (it is a rule of the read, not of the editor).

Small photo (not a crop rule, a warning): `isSmallPhoto`, defined once in `photoPages.ts` (section 2). The list row and the editor read-out then say
"This photo is small. The text may be hard to read." It never blocks Read recipe (product question Q3).

`initialEdit(size): ImageEdit = { turns: 0, crop: initialCrop(size, 'free') }` (the whole picture) and `isFullEdit(edit, size)` (no turn and the whole picture) live in
`ui/ImageEditor/lib/edit.ts`.

### 3.4 Keyboard nudges and handle moves (`ui/ImageEditor/lib/edit.ts`)

Taken out of `useCropper.keyDown` so it is pure:

```ts
export type EditTarget = 'move' | Handle
/** Arrow keys only: step = max(1, round(long side of the turned picture / 100)), x10 with Shift. 'move' moves the box; a handle moves that handle (a corner on both axes, one at a time per key). Returns null for any other key. */
export function nudge(edit: ImageEdit, size: Size, target: EditTarget, key: string, shift: boolean, aspect: CropAspect, minSide?: number): ImageEdit | null
/** A pointer drag: delta in CSS px from where the drag began, times bounds.width / viewWidth; applied to the rect the drag began with (no drift). */
export function dragTo(start: ImageEdit, size: Size, target: EditTarget, dxCss: number, dyCss: number, viewWidth: number, aspect: CropAspect, minSide?: number): ImageEdit
export function turn(edit: ImageEdit, size: Size, delta: 1 | -1, aspect: CropAspect): ImageEdit   // rotateCrop + addTurn
export function reset(size: Size, aspect: CropAspect): ImageEdit
```

`Home`/`End`/`PageUp`/`PageDown` are not used (the box is a button; screen readers already map them). Escape belongs to the editor (cancel).

### 3.5 Working copy and the final render

Three files, one owner each (section 13): `ui/ImageEditor/lib/working.ts` (pure, **T2**: the read's limits, `workingSize`, `keepOriginal`), `ui/ImageEditor/lib/render.ts`
(pure, **T1**: `drawPlan` only) and `ui/ImageEditor/lib/engine.ts` (the browser adapter, **T2**).

`lib/working.ts` (T2):

```ts
export const WORK_MAX_SIDE = 4096
export const WORK_MAX_AREA = 16_777_216          // iOS Safari's canvas area limit
export const READ_MAX_SIDE = 2576                // = RAW_MAX_SIDE, the model's limit (server ModelMaxSide)
export const INPUT_MAX_BYTES = 30 * 1024 * 1024  // an original
export const INPUT_MAX_PIXELS = 50_000_000
export const KEEP_MAX_BYTES = 8 * 1024 * 1024    // an original kept byte for byte as the working copy
export const AS_IS_MAX_BYTES = 8 * 1024 * 1024   // a HEIC sent as it is (the server's per-photo limit)

/** The working size: fitWithin(WORK_MAX_SIDE), then shrunk further (keeping the aspect, rounding down) until w * h <= WORK_MAX_AREA. */
export function workingSize(width: number, height: number): Size
/**
 * Keep the original bytes as the working copy? Exactly when
 *   type === 'image/jpeg' && orientation === 1 && bytes <= KEEP_MAX_BYTES && workingSize(width, height) equals {width, height}.
 * Any other orientation, any PNG or WebP, anything larger: a new JPEG working copy (D4).
 */
export function keepOriginal(info: { type: string; orientation: Orientation; width: number; height: number; bytes: number }): boolean
```

`lib/render.ts` (T1):

```ts
/**
 * The single drawImage of a render: the source rect in WORKING-COPY pixels (rectInSource of the crop), the canvas size (outputSize(crop, maxSide)), the rotation about the
 * canvas centre (turns * 90 deg) and the destination box before rotation (width and height swapped for odd turns).
 */
export function drawPlan(working: Size, edit: ImageEdit, maxSide: number): { canvas: Size; source: Rect; rotate: number; dest: Rect }
```

`browserEngine.encode` (moved to `ui/ImageEditor/lib/prepare.ts` by T1, section 9) is changed to draw from `drawPlan` (same maths, now tested).

**Pipeline order** (the conceptual order is fixed and tested; the implementation folds it into one canvas per step):

1. **Check** the file: type (JPEG, PNG, WebP, HEIC/HEIF; HEIC by name when the type is empty: `checkImageFile`), size at most `INPUT_MAX_BYTES`, and the header size
   (`readHeaderSize`: JPEG SOF, PNG IHDR, WebP VP8/VP8L/VP8X) at most `INPUT_MAX_PIXELS` before decoding. Refusals: `unsupported`, `too_large` with `limit: 'original'`
   ("That photo is larger than 30 MB."), `too_many_pixels`, `empty`.
2. **Decode** with `createImageBitmap(blob, {imageOrientation: 'from-image'})`. Failure: HEIC/HEIF -> the photo becomes `as-is` (D8) when it is at most
   `AS_IS_MAX_BYTES`, else `too_large` with `limit: 'as-is'` (the 8 MB message, section 5); anything else -> `unreadable`. Pixels over `INPUT_MAX_PIXELS` after decoding
   (no header size was read) -> `too_many_pixels`.
3. **EXIF**: applied by the decoder, or by `orientationOps` when the probe says it is not (3.1).
4. **Working copy**: `keepOriginal(...)` ? the original blob : a canvas of `workingSize`, **JPEG 0.92** (a PNG or WebP too; transparency is drawn on white). Bitmap
   closed, canvas released (section 8). So every working copy is a JPEG.
5. On **Use photo**, the render of that photo: decode the working copy, then **turn**, then **crop**, then **shrink** so the long side is at most **2,576 px** (never enlarged),
   all in one `drawImage` (`drawPlan`), encoded by `prepareImage(working, {maxSide: 2576, maxBytes: 8 MiB, turns, crop})`. The working copy is a JPEG, so prepareImage's
   PNG branch is never taken: the output is **JPEG at quality 0.9**, lowered by 0.1 down to **0.6** while over 8 MiB; still too big -> `failed` with `too_large`. A photo with
   no edit whose working copy already fits is sent byte for byte (prepareImage's rule; still a JPEG).
6. On **Read recipe**: each `ready` output becomes a data URL (`blobToDataUrl`) in list order; links stay `{url}`. An `as-is` photo becomes a data URL with its
   **declared** type, never `blob.type` (Chrome and Windows often give a HEIC file an empty type, which would make `data:;base64,` and be refused):
   `blobToDataUrl(new Blob([source.blob], { type: source.type }))`, where `source.type` is `image/heic` or `image/heif` from `checkImageFile`'s decision (the file's type,
   or its `.heic`/`.heif` name). It maps to `RawImage {kind: 'blob', blob, dataUrl, type: source.type, origin, width: 0, height: 0}`: the size is unknown here (HEIC is
   not parsed) and nothing downstream reads it (`buildReadRequest` checks only the data URL and the byte size); the server decodes and sizes it.

**Trade-off of the 4,096 px working copy.** A tight crop on a 24 to 48 MP original is limited by the working copy, not by the original: a 48 MP photo (8064 x 6048) becomes
a 4096 x 3072 working copy, so a crop of half its width is 2,048 px wide (4,032 px in the original) and is sent at 2,048 px, not 2,576. A crop keeps the full 2,576 px only
when it spans at least 2576 / 4096 (about 63 %) of the working copy's long side. Accepted: half a page at 2,048 px is still legible, and rendering from the original instead
would mean keeping up to 30 MB per photo and a full-size decode (up to about 190 MB) on every render, which is what D4 avoids on phones.

The server then re-checks and re-encodes for the model (JPEG 90, 2,576 px, metadata dropped): nothing here is trusted by it.

## 4. Hooks

### 4.1 `features/import/hooks/usePhotoPages.ts`

```ts
export interface UsePhotoPages {
  state: PhotoPagesState
  /** One object URL per photo for the list and the editor: the output once ready, else the working copy; undefined for 'as-is' and 'link'. */
  previewUrl(id: PhotoId): string | undefined
  /** The working copy's URL for the editor (always the working copy, never the output). */
  editorUrl: string | undefined
  // sources
  addFiles(files: File[], origin: ImageOrigin): void      // queue, then intake one by one; each opens the editor (isNew)
  addLink(text: string): void                              // parseImageLink: https -> 'link' photo, data:image -> as a file
  onPaste(data: ClipboardDataLike): void                   // pickFromClipboardData: file -> addFiles([f], 'paste'), text -> addLink
  // editing
  edit(id: PhotoId): void
  setDraft(draft: ImageEdit): void
  commit(): void                                           // then intakes the next queued file, if any
  cancel(): void
  remove(id: PhotoId): void
  move(from: number, to: number): void
  dismissProblem(): void
  // send
  busy: boolean                                            // intake or a render running
  canRead: boolean                                         // readyToSend
  /** The ReadInput for useRecipeRead.start: data URLs made now, in list order. Rejects only on a FileReader failure ('failed'). */
  toReadInput(): Promise<ReadInput & { kind: 'photo' }>
}
export function usePhotoPages(deps?: Partial<PhotoPagesDeps>): UsePhotoPages
export interface PhotoPagesDeps { engine: ReadImageEngine /* decode, encode, normalise(blob): Promise<Working>, browserOrients(): Promise<boolean>, readHead(blob): Promise<Uint8Array> */; objectUrls: ObjectUrls }
```

- `useReducer(photoPagesReducer)`; effects only for: the intake of `queue[0]` (one at a time), the render of `nextToRender` (one at a time), the object URLs (4.2).
- Async results carry the photo id and revision and are dropped when stale or after unmount (a `mounted` ref and the revision check; no state update after unmount).
- `deps` defaults to the browser (`browserImageEngine` and the real object URLs from the ui barrel, `resolveDeps` style); tests pass a fake engine and fake `objectUrls` (as `ImagePicker/fake.test-helper.tsx` does).

### 4.2 Object URLs (inside `usePhotoPages`, helper `ui/ImageEditor/hooks/useObjectUrls.ts`)

A small registry: `urlFor(key, blob)` creates once per (key, blob) and revokes the previous URL of that key when the blob changes; `release(key)`; `releaseAll()` on unmount.
Keys are `photoId:work` and `photoId:out`. Rules: removing a photo revokes both; a new output revokes the old output's URL; the working URL lives as long as the photo; unmount
revokes everything. At most 8 live URLs (4 photos x 2). Tested with a counting fake (`create` and `revoke` balance to zero after unmount).

### 4.3 `ui/ImageEditor/hooks/useImageEditor.ts`

The controlled state of the editor (the old `useCropper` minus its own `useState`): `{ value, onChange, width, height, aspect, minSide, viewWidth }` ->
`{ bounds, percent, handles, dragging, changed, rotate, reset, begin, drag, end, key, readout }`, all through `lib/edit.ts`. Holds only the drag start (a ref) and
`dragging`. `ImagePicker/hooks/useCropper.ts` becomes `useState(initialEdit)` plus `useImageEditor` with the same public API, so `useCropper.test.tsx` stays green untouched.

### 4.4 `features/import/hooks/usePhotoSources.ts`

The platform choice for the sources (no business logic in the component): `cameraStrategy(cameraEnvironment(mediaDevices), 'system')` and `coarsePointer` ->
`{ showTakePhoto: strategy === 'capture-input', libraryAccept: coarse ? 'image/*' : ACCEPT, multiple: true, pasteAndDrop: !coarse }`. Paste is still handled on a phone
(an iPad with a keyboard); only the "or paste" hint is hidden.

## 5. Components

All in `features/import/components/`, rendering and wiring only; primitives from `ui/` (`Button`, `IconButton`, `Icon`, `Thumb`, `Sortable`, `FileDrop`, `Tile`, `Toast`).
No `<select>`, no `alert`/`confirm`, no native look. Every import from `ui/` goes through the barrel (`../../../ui`), never a deep path (section 9.1).
One new icon through `ui/icons.ts` only: **`photos`** -> Phosphor `Images` (Choose photos). No `crop` icon: no component of this design shows one (the editor has Rotate
left, Rotate right and Reset; a cropped row says "Cropped" in text). Existing: `camera`, `file`, `rotateLeft`, `rotateRight`, `edit`, `delete`, `drag`, `warning`, `error`.

| Component | Renders |
|---|---|
| `ReadPhotoPanel` (rewritten) | The help and privacy notes (unchanged strings), then either `PhotoEditorPanel` (while `editing`) or `PhotoSources` + `PhotoList`; the count "2 of 4 photos"; the panel message (`role=alert` for refusals, dismiss button). Takes `UsePhotoPages` and `disabled` as props. |
| `PhotoSources` | Phone: **Take photo** (primary, `camera`) and **Choose photos** (secondary, `photos`). Computer: **Choose files** (`file`) inside a `FileDrop` zone with "or paste or drop a picture here". Hidden inputs: capture `<input type=file accept="image/*" capture="environment">` (single), library `<input type=file accept={libraryAccept} multiple>` (no `capture`). All off when `!canAdd`, with "That's 4 photos, the most a read takes." as the description. |
| `PhotoList` | `Sortable as="ol" aria-label="Photos in page order"`, `getLabel = "Photo n"`; one `PhotoRow` per photo. Hidden while there is none (the sources say what to do). |
| `PhotoRow` | `ctx.handle` (Move), a `Thumb` of `previewUrl` (or the `file` glyph for `as-is`/`link`), "Photo n", a status line ("Cropped", "Turned", "Cropped and turned", "Preparing…", "Will be sent as it is: this browser can't show HEIC photos.", "From a link", the small-photo warning, or for a `failed` output "This photo could not be prepared. Edit it again or remove it." / "This photo is still over 8 MB. Crop it smaller or remove it." with the `error` glyph), **Edit photo n** (`edit`; absent for `as-is`/`link`; present for a `failed` output), **Remove photo n** (`delete`). |
| `PhotoEditorPanel` | Heading "Edit photo n" (`h3`, focus target when it opens), `ImageEditor` (controlled by `editing.draft`, `minSide = 160`, `aspect = 'free'`), and its actions: **Use photo** (primary), **Retake** (`isNew` from the camera: cancels and reopens the capture input), **Cancel** (otherwise). |
| `ui/ImageEditor/ImageEditor` | The stage with the picture shown turned, the crop box (button "Move crop area"), 8 handles, the read-out, **Rotate left**, **Rotate right**, **Reset**, then `children` (the host's buttons). Escape calls `onCancel`. |
| `ui/ImagePicker/components/CropEditor` | Now `ImageEditor` + Cancel / Use crop; same props, same markup and class names. |

`ReadRecipeStep` changes: `const pages = usePhotoPages()` replaces the slots; `hasInput` for photo = `pages.canRead`; `submit` for photo awaits `pages.toReadInput()`
then `read.start(input)`; the Read button is off while `blockReason` is set, described by "Finish editing the photo first." (`editing`), "Preparing the photos…"
(`preparing`: intake, queue or a render) or "Photo n could not be prepared. Edit it again or remove it." (`{failed}`). `lastInput` keeps working for Try again.

New strings (`features/import/strings.ts`, T3), GLOSSARY-safe: none uses "upload", "discard", "thumbnail", "done" or "image" in copy (D12). The panel words every
problem it raises itself, with "photo":

| Key | Text |
|---|---|
| `photoProblems.too_large` + `limit: 'original'` | "That photo is larger than 30 MB. Use a smaller photo." |
| `photoProblems.too_large` + `limit: 'as-is'` | "This browser can't show HEIC photos, so it would be sent as it is, and it is larger than 8 MB. Use a smaller photo, or open Feeder in Safari." |
| `photoProblems.too_many_pixels` | "That photo has more than 50 megapixels. Use a smaller photo." |
| `photoProblems.unsupported` | "That is not a JPEG, PNG, WebP or HEIC photo." |
| `photoProblems.unreadable` | "This browser can't read that photo. Try a JPEG or PNG." |
| `photoProblems.empty` | "That file is empty." |
| `photoProblems.too_many_photos` | "A read takes up to 4 photos. The first ones were kept; 2 were left out." (count from the action) |
| `photoProblems.render_failed` | "This photo could not be prepared. Edit it again or remove it." |
| other `ImageProblemCode`s (`link_*`, `clipboard_*`, `offline`, `failed`) | `problemMessage(code)` from the ui barrel (they already speak of links and the clipboard). |
| `readStrings.errors.photo_unsupported` (changed) | "A photo could not be read. Use a JPEG, PNG, WebP or HEIC photo." (HEIC is now accepted; GIF is no longer offered by the panel, though `readRequest` still lets a GIF data URL through as the server does.) |

Team QA-3 has already reworded `photoOnlyOne` (it said "discarded") and ImagePicker's "Uploading the image": T3 rebases on that change and does not touch those two lines.

Flow on a phone: Take photo -> camera app -> back -> "Preparing…" -> the editor on Photo 1 -> Use photo -> the list with Photo 1 -> Take photo -> ... -> Read recipe.
Choose photos with 3 files -> the editor opens on each in turn (the queue), the list after the last.

## 6. Accessibility

- **Panel**: `role=group` named "Photos" (the tab panel already has the Segmented's label). The count is plain text; a change of count is announced by the list's live region.
- **Sources**: real `<button>`s; the hidden inputs are `hidden` and never focusable. After the camera returns, focus goes to the editor heading; after a refusal, to the message.
- **List**: `Sortable` gives a handle button "Move Photo 2", Space/Enter to lift, Up/Down to move, Space/Enter to drop, Escape to cancel, and its own polite live region
  ("Photo 2 moved to position 1 of 3"). Row buttons have full names ("Edit photo 2", "Remove photo 2"). After Remove, focus goes to the next row's Edit button, else the
  previous one's, else Take photo / Choose files; a polite status says "Photo 2 removed."
- **Editor**: `role=group` named "Crop image" (existing string) inside a region headed "Edit photo n"; the crop box is a button "Move crop area", the handles are buttons named
  by `handleLabel` ("Resize crop, top left corner"), all with `aria-describedby` the read-out. Arrow keys move or resize (1 % of the long side, Shift x10); the read-out is
  `role=status` ("Crop area: 1840 by 2410 pixels"), and after a turn it says "Turned right. Crop area: ...". Handles and box have a visible focus ring, are at least 44 px to hit
  and `touch-action: none`. Rotate left / Rotate right / Reset are `IconButton`/`Button`. Escape = Cancel (or Retake's cancel), focus then goes back to the row's Edit button
  (existing photo) or the source button (a new photo removed).
- **Busy**: the panel has `aria-busy` while preparing; "Preparing the photo…" is a polite status shown after 300 ms (the existing `useAfter` pattern).
- **Reduced motion**: the editor and list use no animation beyond Sortable's (which already respects `prefers-reduced-motion`).

## 7. Behaviour on each platform

| Platform | Take photo | Choose | Notes |
|---|---|---|---|
| iPhone, iPad (Safari and home-screen app) | Hidden capture input opens the Camera app (rear camera). | `accept="image/*" multiple` shows the system menu (Photo Library, Take Photo, Choose File). | With `image/*` iOS hands over **JPEG** (it converts HEIC when the page does not ask for HEIC), so the photo is decodable and editable. A HEIC from Files is decodable in Safari anyway. Expected, not yet verified on a device: release QA item. |
| Android (Chrome, Samsung Internet) | Capture input opens the camera app. | `image/*` opens the Android photo picker; `multiple` works. | A HEIC from the library (some Samsung and Pixel settings) cannot be decoded by Chrome: it becomes an `as-is` photo (D8). Firefox for Android ignores `capture` and shows a chooser: fine. **Android may unload the tab while the camera app is open**; the photos already added are then lost (Q5). |
| Computer (any browser) | Not offered (no viewfinder, decision 1). | **Choose files** (`accept=ACCEPT`, multiple), drop on the zone, Ctrl/Cmd+V anywhere in the panel. | A pasted https image link becomes a `link` photo (no edit; the server fetches it, as today). A HEIC on Chrome, Edge or Firefox becomes `as-is`; on Safari it is decoded and editable. |
| Any, no `createImageBitmap` | | | Treated as "cannot decode": HEIC -> `as-is`, others -> `unreadable` (the section 5 message: "This browser can't read that photo. Try a JPEG or PNG."). All supported browsers have it (Safari 15+). |

## 8. Memory

- **One heavy step at a time**: intake and render are serial (one queue each, and render waits while an intake runs). Peak is one decoded original plus one canvas.
- **Bitmaps are closed** in `finally` (as `prepareImage` does); **canvases are released** after encoding by setting `width = height = 0` (Safari keeps their backing store
  otherwise and counts it against its total canvas memory, a few hundred MB on iOS; past it `getContext('2d')` returns null and the result is blank). A null context or a
  null `toBlob` is `render_failed`, never a blank photo sent.
- **Canvas limits**: iOS Safari refuses a canvas over 16,777,216 px (4096 x 4096). The working copy (D4) is always within it, and the sent photo is at most 2,576 px long
  (6.6 MP), so no canvas of this flow can exceed it. The only full-size decode is step 2 of the intake. For a JPEG, PNG or WebP it is bounded **before** decoding by the
  50 MP header check (section 3.1: SOF, IHDR, VP8/VP8L/VP8X); a 48 MP iPhone ProRAW-sized JPEG is about 190 MB decoded: allowed, but the largest case; a 24 MP default
  iPhone photo is about 96 MB. A HEIC (decoded only by Safari) and a file whose header size cannot be read are checked only **after** decoding, so there the browser's own
  decode limit is the guard; that is the one gap, and it is accepted (iOS hands over JPEG for `image/*` picks, section 7).
- **Object URLs**: section 4.2; no URL outlives its photo or the panel.
- **What is held**: per photo the working copy (a JPEG: about 4 MB when re-encoded, at most 8 MB when the original is kept) and the output (at most 8 MB, usually under 1.5 MB); data URLs are made only when Read recipe is
  pressed and live in `useRecipeRead`'s `lastInput` until the next read (needed for Try again). The `File` from the input is dropped after the intake.
- Leaving the tab or the step drops the live photos (unmount revokes URLs). The photos kept on the device are photo-store.md, phase 2 (Q5).

## 9. A shared `ui/ImageEditor`: extract now

**Yes, extract it now, and ImagePicker's crop reuses it in the same change.** Reasons:
1. The read flow needs the same stage, crop box, handles, keyboard and read-out that `CropEditor` has. CLAUDE.md forbids copying markup, and importing ImagePicker's private
   `components/CropEditor` with its fixed Cancel / Use crop buttons does not fit (Retake, Use photo, a controlled value for Edit again, a larger minimum crop).
2. The extraction is mostly a move: `lib/crop.ts`, the turn helpers, `CropEditor.css` and the editor markup go to `ui/ImageEditor/`; ImagePicker keeps thin re-exports and a
   wrapper `CropEditor`, so **every existing ImagePicker test passes unchanged** (that is the acceptance check of task T1). The only behavioural additions are optional
   (`minSide`, `children`, controlled `value`), with defaults equal to today.
3. Doing it later would mean building the read editor on ImagePicker internals first and moving it afterwards: two rounds of churn in the same files.

**Layering rule: `ui/ImageEditor` never imports `ui/ImagePicker`** (only the other way round). Everything the editor and the read engine need therefore moves into
`ui/ImageEditor/lib`, and ImagePicker keeps re-exports so its callers and tests do not change. A test in T1 (`ImageEditor.structure.test.ts`) greps every non-test file
under `ui/ImageEditor/**` for `ImagePicker` and fails on a match.

What moves (with `git mv`, so history follows). Every row is done by **T1**, except the last row, which is T2's new files:

| From `ui/ImagePicker/` | To `ui/ImageEditor/` | Left behind in ImagePicker | Task |
|---|---|---|---|
| `lib/size.ts` (`fitWithin`) | `lib/size.ts` | `lib/size.ts`: `export * from '../../ImageEditor/lib/size'` | T1 |
| `lib/crop.ts`, `lib/crop.test.ts` | `lib/crop.ts`, `lib/crop.test.ts` (+ `minSide` cases) | `lib/crop.ts`: `export * from '../../ImageEditor/lib/crop'` | T1 |
| `addTurn`, `turnedSize`, `Turns` in `lib/prepare.ts` | `lib/turns.ts` (+ test) | re-exported by `prepare.ts` | T1 |
| `prepareImage`, `ImageEngine`, `DecodedImage`, `PrepareOptions`, `Prepared`, `makeCanvas`, `browserEngine` in `lib/prepare.ts`; `DEFAULT_QUALITY` in `lib/limits.ts` | `lib/prepare.ts` (`makeCanvas` exported for `engine.ts`; `DEFAULT_QUALITY` defined here). It throws `ImageEditorError` (`code: 'unreadable' \| 'too_large'`, defined in `lib/prepare.ts`) instead of ImagePicker's `ImageProblemError`. | `lib/prepare.ts` re-exports all of them and keeps `grabVideoFrame` (now built on the imported `makeCanvas`); `lib/limits.ts` re-exports `DEFAULT_QUALITY`; `lib/problems.ts` `problemFromError` gains one line, `if (err instanceof ImageEditorError) return err.code`. `prepare.test.ts` stays in ImagePicker, unchanged (it matches `{code}`, not the class). | T1 |
| the drawing maths of `browserEngine.encode` | `lib/render.ts` `drawPlan` (+ test) | (`encode` itself moved with the row above and calls `drawPlan`) | T1 |
| `components/CropEditor.css`, `CropEditor.css.test.ts` | `ImageEditor.css`, `ImageEditor.css.test.ts` (path in `readUiCss` updated; class names `crop-editor__*` kept) | `CropEditor.tsx` imports the CSS through `ImageEditor` | T1 |
| the markup of `components/CropEditor.tsx` | `ImageEditor.tsx` (controlled) | `CropEditor.tsx`: wrapper, same props | T1 |
| `hooks/useCropper.ts` logic | `hooks/useImageEditor.ts` + `lib/edit.ts` | `useCropper.ts`: `useState` + `useImageEditor`, same API | T1 |
| the crop strings of `strings.ts` | `strings.ts` | `strings.ts` re-exports them | T1 |
| | new: `index.ts`, `ImageEditor.structure.test.ts` | | T1 |
| | new: `lib/working.ts`, `lib/exif.ts`, `lib/header.ts`, `lib/engine.ts` (probe, `normalise`, built on `prepare.ts`'s `makeCanvas`), `hooks/useObjectUrls.ts` | | T2 |

The Gallery may gain an "Image editor" entry (optional, not required for merge).

### 9.1 The public API: the `ui/` barrel

`readStep.structure.test.ts` already fails when a file of the import feature imports from below `ui/` (`from '../../../ui/...'`). T3 extends it so that it **enforces
barrel-only imports for every non-test file it adds or changes**: its list grows from `ReadRecipeStep, ReadPhotoPanel, ReviewPhotoChoice, ReadProgress, ReadErrorTile` to
also cover `PhotoSources`, `PhotoList`, `PhotoRow`, `PhotoEditorPanel` (components), `hooks/usePhotoPages.ts`, `hooks/usePhotoSources.ts`, `lib/photoPages.ts` and
`types.ts` (the pattern is widened to `from '(\.\./)+ui/` for files at other depths; `types.ts` today imports `RawImage` from `../../ui/ImagePicker` and moves to `../../ui`).

So `web/src/ui/index.ts` must export exactly what T3 uses. **T1 owns `ui/index.ts` and `ui/ImageEditor/index.ts`** and adds every line for T1's code; T2's two lines
are added by T2 after T1 has merged (the PM hands both barrel files to T2 for those lines only; they are never held by two tasks at once). T3 never edits a barrel.

| Export (from `ui/index.ts`) | Comes from | Used by T3 for | Added by |
|---|---|---|---|
| `checkImageFile`, `problemMessage`, type `ImageProblemCode` | `./ImagePicker/lib/problems` | intake check (section 3.5 step 1), fallback messages, `PhotoProblem` | T1 |
| `parseImageLink`, `pickFromClipboardData`, type `ClipboardDataLike` | `./ImagePicker/lib/imageUrl`, `./ImagePicker/lib/clipboard` | `addLink`, `onPaste` | T1 |
| `blobToDataUrl` | `./ImagePicker/lib/imageUrl` | `toReadInput` | T1 |
| `prepareImage`, `browserEngine` | `./ImageEditor` (its `lib/prepare.ts`) | the render (step 5), default deps | T1 |
| `ACCEPT`, type `ImageOrigin` | `./ImagePicker/lib/limits`, `./ImagePicker/types` | `libraryAccept`, `addFiles` | T1 |
| `cameraStrategy`, `cameraEnvironment`, type `CameraPolicy` | `./ImagePicker/lib/cameraStrategy`, `./ImagePicker/lib/deps` | `usePhotoSources` | T1 |
| `ImageEditor`; types `ImageEditorProps`, `ImageEdit`, `Turns`, `Rect`, `Size`, `CropAspect`; `initialEdit`, `isFullEdit`, `outputSize` | `./ImageEditor` | `PhotoEditorPanel`, the reducer | T1 |
| `browserImageEngine` (the read engine: `decode`, `encode`, `normalise`, `browserOrients`, `readHead`), class `TooManyPixelsError` (for `instanceof`), types `ReadImageEngine`, `Working`; the `working.ts` constants (`READ_MAX_SIDE`, `INPUT_MAX_BYTES`, `INPUT_MAX_PIXELS`, `AS_IS_MAX_BYTES`), `readHeaderSize` | `./ImageEditor` (its `lib/engine.ts`, `lib/working.ts`, `lib/header.ts`) | `PhotoPagesDeps` defaults, intake | **T2** |
| `useObjectUrls`, type `ObjectUrls` | `./ImageEditor` (its `hooks/useObjectUrls.ts`) | `previewUrl`, `editorUrl` | **T2** |

`RawImage` and `Sortable` are already exported. Nothing else of ImagePicker or ImageEditor is public.

Not in scope: ImagePicker does **not** get EXIF probing, the working copy or the larger input limit; its pipeline stays as it is (Q2).
ImagePicker's raw mode stays as it is: the read no longer uses it, but `features/scan/components/UnknownBarcodeSheet.tsx` still does (`mode="raw"`), so
its code and tests are untouched.

## 10. The `cameraStrategy` change (this flow only)

```ts
export type CameraPolicy = 'live' | 'system'
/**
 * 'live' (default, unchanged): iosStandalone -> capture-input; no getUserMedia -> capture-input on a coarse pointer, else none; otherwise viewfinder.
 * 'system' (the photo read): never the viewfinder. A coarse pointer (phone, tablet) -> capture-input; a fine pointer -> none (the computer uses files, paste and drop).
 */
export function cameraStrategy(env: CameraEnv, policy: CameraPolicy = 'live'): 'viewfinder' | 'capture-input' | 'none'
```

ImagePicker calls it without the argument: no change for Recipe, Ingredient, Product and Member pictures. `cameraStrategy`, `cameraEnvironment` and `CameraPolicy` are
exported from the `ui/` barrel (section 9.1, added by T1) for `usePhotoSources`. Tests: the existing table stays; a new table for `'system'` (8 combinations of the three flags, never `viewfinder`).

## 11. Spec text (for the release team to apply; not edited here)

**(a) `docs/spec/functional-spec.md` §13, a new bullet after "Import":**

> - **Read a recipe from photos (Recipe Assistant).** On the Photo choice of "Read a recipe" a User adds 1 to 4 photos of a cookbook page or a handwritten card, in page order. On a phone, **Take photo** opens the phone's own camera app and **Choose photos** opens the photo library or files (several at once); Feeder shows no live camera view here. On a computer, photos are chosen from files, dropped or pasted (a pasted https link to a picture is also accepted). After each photo is added it opens in an editor, shown upright (its EXIF orientation applied): **Rotate left** and **Rotate right** turn it a quarter turn at a time, and a crop box of any shape is dragged by its edges and corners or moved and resized with the arrow keys (Shift for larger steps); a crop is at least 160 px on each side. **Use photo** keeps it; **Retake** (a photo just taken) or **Cancel** leaves it out or as it was. The photos are listed in page order; each can be moved (drag handle or keyboard), edited again from the photo as it was added, or removed. With 4 photos listed nothing more can be added; a pick of more than fit keeps the first ones and says so. **Read recipe** sends the photos as edited, in list order, each turned, then cropped, then shrunk so its longest side is at most 2,576 px, as JPEG (quality 0.9, lowered to no less than 0.6 while over 8 MB). A photo whose longest side is under 1,000 px is sent with a warning that its text may be hard to read. A picture the browser cannot show (a HEIC photo outside Safari) is listed without a preview, cannot be edited and is sent as it is; the server turns it upright. A picture over 30 MB or 50 megapixels is refused. The server checks again (1 to 4 photos, each at most 8 MB) and keeps none of them unless the User chooses one as the Recipe's Photo in Import Review ([ADR 0006](../adr/0006-recipe-assistant-calls-anthropic-from-the-server.md), [ADR 0007](../adr/0007-heic-decoding-with-h265.md), [photo-read.md](../dev/design/photo-read.md)).

**(b) §15, a new resolved decision (next number after 35):**

> 36. (2026-11-12) **Photos for the Recipe Assistant are taken with the phone's camera app and edited before the read** ([photo-read.md](../dev/design/photo-read.md)). The photo read shows no live camera view: a phone uses its own camera app or photo library, a computer uses files, paste and drop. Each of up to 4 photos opens in an editor (quarter turns, a free crop box, keyboard accessible) and can later be moved, edited again or removed; Read recipe sends them in list order, turned, cropped and shrunk to 2,576 px. The Recipe, Ingredient, Product and Member pictures keep their picker as it was (§4, §5, §13).

**(c) `docs/spec/recipe-file.md` "Recipe Assistant"**: no change (it already says the photos come "in page order").

**(d) `CHANGELOG.md`, the 1.0.0-beta.4.1 section, `### Changed`** (the release team applies it, as with the spec text; GLOSSARY terms only):

> - **Reading a recipe from photos.** On the Photo choice of Read a recipe, a phone takes each photo with its own camera app or picks several from its photo library; Feeder no longer opens its own camera view there. A computer chooses, drops or pastes photos as before. Each photo opens upright in an editor: turn it a quarter turn at a time with Rotate left and Rotate right, and crop it to any shape by touch, mouse or keyboard. Up to 4 photos are listed in page order, and each can be moved, edited again or removed. Read recipe sends them in that order, shrunk so the longest side is at most 2,576 px. Photos up to 30 MB are accepted, and a HEIC photo that the browser can't show is sent as it is. The Photo of a Recipe or a Member and the Picture of an Ingredient or a Product are added as before.

## 12. Test plan

### 12.1 Unit tests (vitest, plain TS)

| File | Cases |
|---|---|
| `ui/ImageEditor/lib/exif.test.ts` | Orientation 1..8 from little- and big-endian EXIF (built byte arrays); no APP1 -> 1; truncated APP1, IFD count past the end, wrong tag type, value 0 or 9 -> 1; not a JPEG -> 1; SOF0 and SOF2 sizes; SOF found after APP1/APP2; `orientationOps` table (8 rows, and applying ops to a 3 x 2 grid of labelled pixels gives the upright grid for each orientation); `orientedSize`; `needsManualOrientation` truth table. |
| `ui/ImageEditor/lib/turns.test.ts` | `addTurn` wraps both ways; `turnedSize` swaps for 1 and 3. |
| `ui/ImageEditor/lib/crop.test.ts` (moved) | All existing cases unchanged; new: `minSide` 160 on clamp, move, free resize (each handle stops at 160), locked resize; effective minimum is the image side when smaller; `rotateCrop` four times returns the same rect; `rotateCrop` then `rectInSource` maps to the same source area for turns 1..3 (property loop over random rects). |
| `ui/ImageEditor/lib/edit.test.ts` | `nudge` steps (1 % of long side, min 1, Shift x10), every arrow on `move` and each handle, non-arrow -> null; `dragTo` scales by `bounds.width / viewWidth`, uses the start rect (two drags do not drift), `viewWidth` 0 -> unchanged; `turn` keeps the area; `reset`; `isFullEdit`. |
| `ui/ImageEditor/lib/header.test.ts` (T2) | Built byte arrays: PNG IHDR size (big-endian, 70000 x 1000 -> 70 MP); PNG with a wrong signature or a first chunk other than IHDR -> null; WebP `VP8 ` (14-bit fields, start code checked, wrong start code -> null), `VP8L` (signature 0x2F, the +1 on both sides, 16384 x 16384 max), `VP8X` (24-bit fields + 1, 10000 x 6000 -> 60 MP); RIFF that is not WEBP -> null; every reader on a buffer cut one byte short -> null; `readHeaderSize` dispatches JPEG, PNG, WebP by magic bytes and returns null for HEIC and GIF. |
| `ui/ImageEditor/lib/working.test.ts` (T2) | `workingSize` (4096 side cap; 16.7 MP area cap for 5000 x 4000 -> within both; never enlarges); `keepOriginal` truth table: true only for `image/jpeg` + `orientation === 1` + within `workingSize` + at most 8 MB; false for orientation 6 (any probe result), for 8 MB + 1 byte, for 5000 x 4000, for PNG and WebP. |
| `ui/ImageEditor/lib/render.test.ts` (T1) | `drawPlan` for turns 0..3 x crop full / corner crop: canvas = `outputSize`, source = `rectInSource`, dest swapped on odd turns, rotate = turns x 90 deg; long side of canvas <= 2576. |
| `ui/ImageEditor/ImageEditor.structure.test.ts` (T1) | No non-test file under `ui/ImageEditor/**` contains `ImagePicker` (section 9). |
| `ImagePicker/lib/prepare.test.ts` | Unchanged and green (the regression guard for `encode` via `drawPlan`). |
| `ImagePicker/lib/cameraStrategy.test.ts` | Existing table; new `'system'` table. |
| `features/import/lib/photoPages.test.ts` | Every action of section 2: add up to 4 and refuse the 5th; `queued` keeps `room` files and reports the dropped count; **the room formula**: 1 photo + 2 queued + intake `preparing` -> room 0 (a pick of 1 is all dropped); 2 photos, a new one of them in the editor, empty queue, idle -> room 2 (the photo in the editor is counted once); `intakeStarted` takes `queue[0]` off and room stays the same; **`nextToIntake`** is `undefined` while an editor is open (new or existing) or while `preparing`, and `queue[0]` once the editor closes; **cancel of a new queued photo** removes it, sets `editing = null` and `nextToIntake` returns the next queued file (the same as after commit); `added` opens the editor only for `image`; commit stores `null` for a full edit, bumps the revision, sets `pending`; cancel of a new photo removes it, of an existing one keeps the edit; remove while editing closes the editor; `moved` keeps ids and refuses while editing; stale `rendered` ignored; `readyToSend` false while any output is pending or failed, editing, intake or a non-empty queue; `blockReason` for each of those (`{failed: id}` names the first failed photo); a failed photo can be `editStarted` and `removed`; `isSmallPhoto` at 999 and 1000 px; `toReadInput` order equals list order and maps `as-is` to a data URL of its declared type with width and height 0, `link` to `{url}`. |
| `features/import/lib/readRequest.test.ts` | New: `data:image/heic` and `data:image/heif` accepted; `data:image/avif` still `photo_unsupported`. |

### 12.2 Hook and component tests (vitest + Testing Library, fake engine, fake object URLs)

- `usePhotoPages.test.tsx`: intake runs one file at a time and opens the editor for each; with 3 files picked, the second is **not** taken in while the editor is open on
  the first (the engine's `normalise` was called once), and is taken in after Use photo; **Cancel on the first (new) photo also takes in the second**; HEIC that fails to
  decode -> `as-is`; a `File` with an empty type and the name `IMG_1.heic` -> its data URL starts `data:image/heic;base64,`; HEIC over 8 MB -> `too_large` with
  `limit: 'as-is'`; 31 MB file -> `too_large` with `limit: 'original'`; JPEG, PNG and WebP (VP8X) headers over 50 MP -> `too_many_pixels` without decoding (the engine's
  `decode` not called); a render that fails -> `failed`, Read off with the reason, Edit again and Use photo renders again; render on commit with the committed edit (engine receives turns and crop), only one render at once;
  re-edit while rendering drops the old result; object URLs created and revoked in balance (after remove, after re-render, after unmount); no state update after unmount;
  paste of a file, of an https link, of text that is not a link (`link_invalid`).
- `usePhotoSources.test.tsx`: coarse + getUserMedia -> Take photo shown (capture input, not viewfinder); fine pointer -> no Take photo, paste and drop on; `libraryAccept`.
- `ui/ImageEditor/ImageEditor.test.tsx`: controlled value is rendered (box at the right percent), handles call `onChange` with nudged values, Rotate buttons, Reset, Escape
  calls `onCancel`, `children` rendered, `minSide` respected, accessible names and the status read-out. `ImageEditor.css.test.ts` (moved).
- `ImagePicker/components/CropEditor.test.tsx`, `hooks/useCropper.test.tsx`, `ImagePicker.crop.test.tsx`, `ImagePicker.camera.test.tsx`: unchanged and green.
- `PhotoSources.test.tsx`, `PhotoList.test.tsx` (Sortable reorder by keyboard calls `move`; Remove moves focus as section 6), `PhotoRow.test.tsx` (status lines including
  "Will be sent as it is: this browser can't show HEIC photos." for `as-is`, no Edit for `as-is`/`link`, small warning, a `failed` output shows its message with Edit
  and Remove), `PhotoEditorPanel.test.tsx` (Use photo, Retake only for a new camera photo, Cancel, heading focused on open), `ReadPhotoPanel.test.tsx`
  (rewritten: editor replaces the list while open; count; message and dismiss; 4 photos turns sources off with the reason).
- `ReadRecipeStep*.test.tsx` and `features/import/screens/ImportScreen.read.test.tsx` (it mocks ImagePicker through `fakeImagePicker.test-helper` today): the photo tab
  with a fake `usePhotoPages` (replaces `fakeImagePicker.test-helper.tsx`, which T3 deletes once no test uses it): Read off while editing, busy or failed with the reason;
  Read sends `toReadInput()` in order; Try again resends the last input.
- `readStep.structure.test.ts` (extended, section 9.1): barrel-only imports for every listed file, and **a source grep of `features/import/**`**: no non-test file
  (`*.test.*` and `*.test-helper.*` excluded) contains `getUserMedia`, `CameraPanel`, `useCameraCapture` or `ImagePicker` (comments included, so the `types.ts` comment
  that names ImagePicker is reworded). This is a grep of the feature's own sources, not a reachability analysis: `ui/` is checked by its own tests.

### 12.3 BDD (godog, against the API: `bdd/features/recipe-assistant/photo.feature`)

The browser work (camera, editor, turn, crop, shrink, list) cannot be reached from godog; it is all in vitest above. What the API can prove:

```gherkin
  Scenario: Four photos are read
    When I read 4 photos
    Then the read is done and a review is open
    And the model received 4 JPEG image blocks before the text, each at most 2576 px

  Scenario: Photos reach the model in the order they were sent
    When I read photos of 300x200, 200x300 and 400x100 px
    Then the model received image blocks of 300x200, 200x300 and 400x100 px, in that order

  Scenario: A HEIC photo is read as JPEG
    When I read the HEIC photo "pantry-128x96.heic"
    Then the read is done and a review is open
    And the model received 1 JPEG image blocks before the text, each at most 2576 px

  Scenario: A sideways photo reaches the model upright
    When I read the photo "sideways-6.jpg"
    Then the read is done and a review is open
    And the model received image blocks of 32x64 px, in that order
```

`sideways-6.jpg` is stored 64 x 32 with EXIF orientation 6 (`internal/imaging/testdata`, the fixture of `exif_test.go`), so a block of 32 x 64 proves the server turned it
upright; the HEIC fixture carries no rotation, so its scenario only claims "as JPEG".

"Five photos are refused" (`too_many_photos`, model not called) already exists and stays. New step definitions in `bdd/steps_recipe_assistant_test.go` (sized JPEG fixtures
generated in the step; the HEIC and sideways fixtures read from `internal/imaging/testdata/`; the fake Anthropic server already records the image blocks).
No production Go change is expected; if the HEIC or sideways scenario fails, that is a server bug to report, not to design around.

### 12.4 Manual release QA (user)

Real iPhone (Safari and home-screen app) and Android: take, turn, crop, reorder 4 photos and read; an iPhone portrait photo shows upright in the editor and in the read; a HEIC
from Files on Android Chrome is accepted as "sent as it is"; a 48 MP photo does not crash the tab.

## 13. Team split

Ownership (no file is owned by two tasks at once):

| Task | Files | Depends on |
|---|---|---|
| **T1 ImageEditor extraction** | **New** in `web/src/ui/ImageEditor/`: `ImageEditor.tsx`, `ImageEditor.test.tsx`, `ImageEditor.css` and `ImageEditor.css.test.ts` (both moved from `ImagePicker/components/CropEditor.css*`), `ImageEditor.structure.test.ts`, `index.ts`, `strings.ts`, `lib/size.ts` (moved), `lib/crop.ts` and `lib/crop.test.ts` (moved), `lib/turns.ts` + test, `lib/edit.ts` + test, `lib/prepare.ts` (moved `prepareImage`, `browserEngine`, `makeCanvas`, `ImageEditorError`, `DEFAULT_QUALITY`), `lib/render.ts` + test (`drawPlan` only), `hooks/useImageEditor.ts` + test. **Changed** in `web/src/ui/ImagePicker/`: `lib/size.ts`, `lib/crop.ts`, `lib/prepare.ts`, `lib/limits.ts`, `lib/problems.ts` (re-exports and the one `ImageEditorError` line), `lib/cameraStrategy.ts` + `lib/cameraStrategy.test.ts` (`'system'`), `hooks/useCropper.ts`, `components/CropEditor.tsx`, `strings.ts`. **Changed** elsewhere: `web/src/ui/index.ts` (its lines of section 9.1), `web/src/ui/icons.ts` (`photos` only), `web/src/ui/icons.test.tsx` (the `['photos', 'Images']` row of its table), `docs/dev/design/wp2-icons.md` (the `photos` row and the measured size), `scripts/test/icons-bundle_test.sh` (`MIN_MODULES` 102 -> 106: icons.ts imports 105 per-icon modules today, `Images` makes 106; **T1 re-counts just before merging** with `grep -cE "from '@phosphor-icons/react/dist/csr/[A-Za-z0-9]+'" web/src/ui/icons.ts`, because another team may have added icons, and sets `MIN_MODULES` to that count + 1). T1 reports the **measured gzipped icon bundle size** after the change in its commit message and in `wp2-icons.md` (today's budget is 46,080 B); if it is over budget, the PM decides (the user's rule: new size plus sensible headroom). | none |
| **T2 Image libs for the read** | **New** in `web/src/ui/ImageEditor/`: `lib/working.ts` (`workingSize`, `keepOriginal` and every constant of section 3.5), `lib/exif.ts`, `lib/header.ts`, `lib/engine.ts` (`browserImageEngine`: probe, `normalise`, `readHead`), `hooks/useObjectUrls.ts`, each with its test. After T1 has merged: its own lines in `ui/ImageEditor/index.ts` and `ui/index.ts` (section 9.1; handed over by the PM, never held together with T1). | T1 (`size.ts` and `prepare.ts`'s `makeCanvas` must be in `ui/ImageEditor`; `exif.ts`, `header.ts` and `useObjectUrls.ts` can start at once) |
| **T3 Read flow** | `web/src/features/import/{lib/photoPages.ts,lib/photoSlots.ts (deleted),lib/readRequest.ts,hooks/usePhotoPages.ts,hooks/usePhotoSources.ts,components/{ReadPhotoPanel,PhotoSources,PhotoList,PhotoRow,PhotoEditorPanel,ReadRecipeStep}.tsx,components/readStep.structure.test.ts,screens/ImportScreen.read.test.tsx,types.ts,strings.ts,import.css,fakeImagePicker.test-helper.tsx (deleted when unused)}` and their tests | T1, T2 |
| **T4 BDD** | `bdd/features/recipe-assistant/photo.feature`, `bdd/steps_recipe_assistant_test.go` | none |

No file has two owners: `render.ts` is T1's alone (`drawPlan`), `working.ts` is T2's alone; the two barrels pass from T1 to T2 in sequence.

Within the team, the pipeline stays: the **test author** writes the tests of T1 to T4 first (red, with type-only stubs), the **developer** makes them green, the
**reviewer** approves. T1 and T4 can start together; T2's `exif.ts`, `header.ts` and `useObjectUrls.ts` are pure or self-contained new files and can also start together
with T1, while `working.ts` and `engine.ts` wait for T1's moves; `photoPages.ts` (pure) can be written in parallel too. T3's hook and components wait for T1's
`ImageEditor` API and T2's barrel lines. T1 must land with **all existing ImagePicker tests green and unchanged** (except the moved CSS test path).

**Parallel with QA-1 to QA-4: yes.** This feature touches `ui/ImagePicker`, the new `ui/ImageEditor`, `features/import` and the Recipe Assistant BDD; none of them is owned by
QA-1 (plan, board), QA-2 (settings, notifications), QA-3 (signin, access) or QA-4 (`ui/StickyActionBar`). `ConfirmTile` and `ExportPicker` use `StickyActionBar` but are not
touched. The only shared files are **`web/src/ui/index.ts`**, **`web/src/ui/icons.ts`**, `icons.test.tsx`, `wp2-icons.md` and `icons-bundle_test.sh` (a few added lines
each): if a QA team also edits them, the PM serialises those merges (whoever merges second rebases; no logic conflict). QA-3 has changed `features/import/strings.ts`
(`photoOnlyOne`) and ImagePicker's "Uploading the image" string to avoid GLOSSARY words: T3 and T1 rebase on that work and use only GLOSSARY-safe words in new copy
("discard" and "upload" are avoided). `web/src/ui/Gallery*` is left alone unless no QA team holds it.

## 14. Product questions (each with the recommended default)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Crop shape: free, or offer presets (A4/A5 page ratio)? | **Free only**, no presets (decision 2 says free-shaped). |
| Q2 | Should turning and free crop also come to the Recipe, Ingredient, Product and Member pictures in a new form (e.g. edit step after capture there too)? | **No.** They already have Rotate and Crop on demand with their locked aspect; they keep it. They share the new `ImageEditor` under the hood, nothing visible changes. |
| Q3 | A photo below a minimum size: block it or warn? | **Warn, never block**: a crop is at least 160 px a side; a photo under 1,000 px on its long side shows "This photo is small. The text may be hard to read." |
| Q4 | Must the edit step open after every photo, or only when asked? | **Always opens** (decision 2); Use photo with no change is one tap. |
| Q5 | **PENDING the user's answer.** Keep the added photos if the phone unloads the tab while the camera app is open (Android low memory) or the User leaves the step? | Default until answered: **not in this release**; photos live only in memory. *If the answer is "keep them"*: a new task T5 (after T3) adds IndexedDB persistence: `features/import/lib/photoStore.ts` (an adapter over one object store `photo-read`, keyed by photo id, holding the working copy, the edit, the source kind and the order; never the output, which is rendered again), a restore step in `usePhotoPages` on mount ("2 photos from before are back." with Remove), clearing on a finished read, on Remove and on sign-out; at most 4 x 8 MB on the device, nothing sent anywhere; tests with `fake-indexeddb`; a line in the privacy note ("Photos stay on this device until the read is finished."). About one more team cycle; the rest of this design is unchanged. |
| Q6 | **PENDING the user's answer.** A HEIC the browser cannot show: accept as it is (no preview, no edit) or refuse? | Default until answered: **accept as it is** (D8); the server turns it upright. *If the answer is "refuse"*: the `as-is` source kind, `AS_IS_MAX_BYTES`, the `'as-is'` limit and its message, the "Will be sent as it is" status and the `heic\|heif` change to `readRequest` are dropped; an undecodable HEIC becomes `unreadable` with "This browser can't show HEIC photos. Use a JPEG, or open Feeder in Safari."; the BDD HEIC scenario stays (it proves the server). |
| Q7 | Keep pasted https image links as photos? | **Yes**, as today, without editing (the server fetches them). |
| Q8 | Choose photos with more than fit: refuse the whole pick or keep the first ones? | **Keep the first ones** in the order the system gives them, and say how many were left out. |
| Q9 | The largest original accepted? | **30 MB and 50 MP**; what is sent stays at most 8 MB and 2,576 px. |
| Q10 | Word in the UI: "photo" or "page"? | **"Photo n"**, listed "in page order" (the Web page tab already says "page"). |
| Q11 | *(dropped; the numbering keeps the gap so earlier references stay valid)* | n/a |
| Q12 | Offer a computer's webcam? | **No** (no live view; a computer uses files, paste and drop). |
