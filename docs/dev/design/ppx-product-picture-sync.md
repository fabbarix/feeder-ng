# PPX: Product pictures on scans (merge fill and the offline queue)

PP gave a **Product** a **Picture**, including through the "what is this?" form of an unknown barcode. Two gaps were left open as Product
questions 2 and 3 of [pp-product-pictures.md](pp-product-pictures.md) and are closed here by user decision:

1. **PP1, merged scan fills a missing Picture.** An unknown-barcode scan that merges into an existing Product (the barcode was created first by
   someone else) gives that Product the form's Picture **only if the Product has none**.
2. **PP2, offline Picture.** The Picture field stays on the form while the phone is offline. The picture is queued with the scan and uploaded on sync,
   before the scan is sent.

Inputs: [functional-spec.md](../../spec/functional-spec.md) (§5, §10.1, §10.3), [pp-product-pictures.md](pp-product-pictures.md),
[ip1-imagepicker.md](ip1-imagepicker.md) (upload mode vs raw mode, orphan sweep), [t13-shopping-scan.md](t13-shopping-scan.md).

Pipeline step 1 (this commit): this note, the spec edits, **red tests**, and type-only stubs so `go vet` and `typecheck` stay green. No behaviour is implemented.

## Decisions
- **"Merge" is one thing.** The only merge in the code is the taken barcode (`BarcodeTakenError` in `service.shopUnknown`). Products have no unique name, so
  "same name" never merges; if that is ever added, it goes through the same `FillPicture` call.
- **The loser's file stays.** When the Product already has a Picture, the form's uploaded file is left for the nightly `images.sweep` (24 h grace), not
  deleted by the scan. It costs one orphan for a day, and avoids a delete path that races a second phone, a replayed op or a Guarded refusal. A replayed op
  (same `clientUuid`) is `duplicate` and never reaches this code.
- **The fill is atomic and lives in the store.** `UPDATE products SET image=?, updated_at=? WHERE id=? AND image=''`, rows affected = filled. Two phones merging
  at once: the first wins, the second reports `filled=false` and gets the winner's picture in its result. The service skips the call when `ProductInfo.ImageURL`
  is already set (nothing to do), but the store is the authority.
- **Typed sentinel instead of a string match.** `product.ErrPictureMissing` ("the id is well formed but names no stored file") replaces the
  `Field == "image"` test in `service.shopUnknown`. It crosses the layers like the other domain errors (`ErrProductGone`, `ErrUnknownIngredient`).
- **Upload at sync time, not when the Picture is picked.** Offline there is nothing to upload to; online, the picker already uploads. Uploading right before
  the scan keeps the window between upload and the scan that references the id as short as the network allows (the sweep never sees it).
- **Raw mode and a Blob in IndexedDB**, in a store of its own (not inside the `ops` rows), so `pending()` and the queue counters never load pictures.
- **Failure policy.** A Picture is decoration. It may delay a scan (the phone is unreachable: retry), but it must never lose one or hold it for ever:
  a Picture that cannot be uploaded for good is dropped, the scan syncs, and the User is told.

## Go

### Typed error
- `product.ErrPictureMissing` (stub added). `product.ValidationError` gains `Err error` and `Unwrap()` (stubs added). `Store.checkImage` returns
  `&ValidationError{Field: "image", Message: "The picture was not uploaded", Err: ErrPictureMissing}` for a **well-formed but missing** id, from `CreateProduct`,
  `SetImage` and `FillImage`. So the existing `400 invalid_product` mapping (`errors.As` to `ValidationError`) is unchanged, `errors.Is(err, ErrInvalid)` still holds,
  and `errors.Is(err, ErrPictureMissing)` is true. A **malformed** id (`Input.Validate`) is **not** `ErrPictureMissing`.
- `service.ErrPictureMissing` (stub added) is the scan service's own sentinel. The adapter (`internal/scan/httpapi/wiring.go`, `catalogue`) maps
  `errors.Is(err, product.ErrPictureMissing)` to it **before** the generic `product.ValidationError` -> `scan.ValidationError` mapping (use `fmt.Errorf("%w: %v", service.ErrPictureMissing, err)` so the message survives).
- `service.shopUnknown` replaces
  `errors.As(err, &ve) && ve.Field == "image" && np.Image != ""` with `errors.Is(err, ErrPictureMissing) && np.Image != ""`. A `scan.ValidationError{Field:"image"}` that is **not** the
  sentinel is rejected `validation_failed` like any other (test `...NoLongerTheRetrySignal`). The retry order is unchanged: the store checks the barcode before the picture, so a taken barcode
  merges even when its picture is gone.

### Merge fill
- `Catalogue.FillPicture(ctx, productID, image) (ProductInfo, filled bool, error)` (stub added to the port, `wiring.go` and the `fakeCatalogue`). Adapter: `st.FillImage` then reads the Product back
  (`ProductInfo.ImageURL` is then the winner's). `product.ErrPictureMissing` -> `service.ErrPictureMissing`; `ErrNotFound` -> `service.ErrProductGone`.
- `store.FillImage(ctx, id, image) (bool, error)` (stub added): `""` -> `(false, nil)`; checks the id (`checkImage`; **the check runs first**, so a ghost id never writes); unknown Product -> `ErrNotFound`;
  `UPDATE ... WHERE image = ''`; never deletes a file; bumps `updated_at` only when it filled.
- In `shopUnknown`, in the `BarcodeTakenError` branch, after `p` is read: if `np.Image != "" && p.ImageURL == ""`, call `FillPicture`.
  `filled` -> `p = info`, `Merged.PictureFilled = true`. `ErrPictureMissing` -> ignore (the merge goes ahead without a picture). `filled == false` with no error -> `p = info`
  (somebody else filled it between the read and the write; the result shows their picture). Any other error is an infrastructure error, as everywhere. The `purchase` path then puts `p.ImageURL` in `Applied.ProductImageURL` as today.
- `scan.Merged.PictureFilled` (`pictureFilled`, `omitempty`, stub added) says the picture was added, for the notice. The ledger stores the result JSON, so a replay returns the same notice.
- `Op.ProductImage` rules are unchanged (malformed -> `ValidationError{Field: "productImage"}`; allowed only on `shop_unknown`). A queued op that carries an id from a sync-time upload is a normal op.
  An id swept before the op is applied hits `ErrPictureMissing` in `CreateProduct` (dropped, retried) or in `FillPicture` (ignored).

## Web: offline Picture

### The form
- `UnknownFormValues.picture?: RawImage | null` (stub added): the Picture picked **offline** (raw mode). `UnknownFormValues.image` stays the uploaded id of the online picker.
- `UnknownBarcodeSheet`: `canUpload` keeps its name and meaning (the phone can reach the server, `ScanScreen` passes `c.online`).
  - `canUpload` true: unchanged upload-mode `ImagePicker` bound to `values.image`.
  - `canUpload` false: a **raw-mode** `ImagePicker` with the same `label` (`scanStrings.pictureLabel`), `aspect={CROP_ASPECTS.landscape}`, `listenOn="dialog"`,
    `maxSide={OFFLINE_PICTURE_MAX_SIDE}` (1600), `maxBytes={OFFLINE_PICTURE_MAX_BYTES}` (2 MiB) and `sources={OFFLINE_PICTURE_SOURCES}` (`file`, `paste`, `camera`; **no `link`**, because a link is fetched by the server),
    bound to `values.picture`. `lib/offlinePicture.ts` holds the three constants (added, they are configuration, not behaviour).
  - On Save, `onSave` receives the values with `picture: null` when `canUpload` is true (a Blob picked while offline is not kept once the phone is online: the upload picker is empty again and the User sees that),
    and with `image` untouched always (an id uploaded while online stays valid when the phone then goes offline).
- 1600 px is what the server keeps anyway (`imaging.MaxSide`); raw mode's own default is 2576 (it exists for the Recipe Assistant, which needs detail to read). `prepareImage` already re-encodes and walks the JPEG quality
  down to 0.6 to fit `maxBytes`; a picture that cannot fit shows the picker's own "too large" message. A 1600 x 1200 JPEG at 0.9 is about 250-500 KB.
- `useScanFlow.saveUnknown`: after `toUnknownOp` (which sets `productImage` only from `values.image`), `const blob = !op.productImage && values.picture?.kind === 'blob' ? values.picture.blob : undefined`.
  `ScanFlowDeps.submit` is `(op, picture?: Blob)` (stub added). **When there is no Blob the flow must call `d.submit(op)` with ONE argument** (the existing `useScanFlow.test` pins `toHaveBeenCalledWith(op)`;
  the new test checks the second argument is `undefined`). A `{kind:'url'}` result is never queued (the offline picker has no link source anyway).
- `useScanController.submit(op, picture?)` passes it to `sync.enqueue(op, picture)`; when online, `enqueue` flushes at once, which uploads and sends in one go (the online case with a Blob only happens when the connection
  dropped between opening the sheet and Save).
- The scan line of a queued scan with a local Picture shows no thumbnail (there is no Product yet, and no URL to show); the Product's thumbnail appears with the sync Result.

### The queue (`lib/queue.ts`)
New exports (stubs and the in-memory store added): `PictureStore` (`put/get/remove` by `clientUuid`), `createMemoryPictureStore`, `QueuedOp.picture?: {type, size}`, `PictureFailure`,
`EnqueueResult`, `MAX_QUEUED_PICTURE_BYTES` (2 MiB), `SyncApi.uploadPicture?(blob): Promise<string>`, `FlushResult.pictureFailures?` (the key is **absent** when there are none, so the existing
`toEqual({offline, results})` assertions hold), `OfflineQueue` third constructor argument `pictures?: PictureStore`.

**`enqueue(op, picture?) -> {pictureStored}`**
1. A `clientUuid` already queued is ignored (including its Picture).
2. With a Blob, a `PictureStore`, and `blob.size <= MAX_QUEUED_PICTURE_BYTES`: `pictures.put(uuid, blob)` first, then append the entry with `picture: {type, size}`.
3. If there is no store, the Blob is too big, or `put` throws (`QuotaExceededError`, private mode): the operation is **queued without the Picture** and `pictureStored` is `false`.
   Order matters: the blob is written before the entry, so an entry never points at a Blob that was not written; a crash between the two leaves an unreferenced Blob that `cancel`/`flush` cleanup removes by uuid.
4. `useSyncQueue.enqueue(op, picture?)` stays `Promise<void>` (existing tests type it so) and calls the new option `onPictureNotStored(op)` when a Picture was given and `pictureStored` is false;
   the controller shows `scanStrings.pictureNotSaved` as a toast.

**`flush`** (inside the queue's existing exclusive turn; `send()` gets a phase before the batch):
```
sent = pending()
for each entry in order that has entry.picture:
    blob = pictures.get(uuid)
    if no blob (or no api.uploadPicture): give up, reason 'missing'
    else try id = api.uploadPicture(blob)
         ok       -> store.put({...entry without picture, op.productImage = id}); pictures.remove(uuid)     // persisted BEFORE the sync
         retry    -> (status 0, 408, 429, >= 500) every entry gets attempts+1, return {offline: true, results: []}; nothing is sent
         401/403  -> rethrow, like a failed sync does; nothing is lost
         other 4xx or any other error -> give up: reason from err.code
give up = pictures.remove(uuid); store.put(entry without picture, no productImage); failures.push({clientUuid, productName, reason})
then the batch is sent as today, with the updated ops; the result carries pictureFailures when any
```
- Reasons: `image_too_large` and `image_too_large_pixels` -> `too_large`; `unsupported_image` -> `unsupported`; any other 4xx or a non-ApiError (the Blob could not be read) -> `rejected`; blob or uploader missing -> `missing`.
  (These codes are what `internal/images/httpapi` answers: 413 / 422 / 422.)
- **Why persist the id before the sync:** if a later upload fails (503) or the sync itself fails, the next flush must not upload the same Picture again. The id is on the Op in the store, the Blob is gone, so the retry
  just sends the batch. (Test: `an id already returned is kept on the Op...`.) If the id is swept before the retry succeeds (the phone was offline for more than 24 h after a partial flush) the server drops it, see Go.
- **Retry = the existing backoff.** `offline: true` makes `useSyncQueue` schedule `backoffMs(failures)` (1, 2, 4, 8, 16, then 30 s) while the phone thinks it is online, and the `online` event retries at once. No new timer.
- **Ordering.** Uploads run before the batch, in queue order, one at a time. A failing upload holds the **whole** batch (it returns `offline` before sending), because the scans must apply in order and a
  Picture-less retry would reorder nothing but lose the User's picture. The batch is therefore delayed only while the server is unreachable, as for any failed sync; a 4xx never delays.
- `cancel(uuid)` (Undo before the sync) also removes the Blob. A rejected result needs no cleanup (the Blob was removed when it was uploaded).
- `useSyncQueue.flush` builds the notices as `[...syncNotices(results), ...pictureNotices(pictureFailures)]` and passes them to `onResults` (so the existing notice line shows them).

### The upload call (`api.ts`)
`ScanApi.uploadPicture(blob): Promise<string>` (stub added): read the Blob to a data URL with `FileReader`, `client.post('/api/images', { dataUrl })`, answer `.id`. It is the endpoint `ImagePicker` uses (`ui/ImagePicker/api.ts`),
so there is still one image path on the server; the `image-input` guard (`scripts/check-ui.sh`) is about inputs, and this file builds none. `useScanController` wires `syncApi = { sync, uploadPicture }`. A failure is an `ApiError`
(`status`, `code`) from `lib/http`, a network error is `ApiError(0, ...)`.

### Notices and copy (`lib/notices.ts`, `strings.ts`; strings added, `pictureNotices` stubbed)
- Merge that filled a picture: `scanStrings.mergedWithPicture(name)` ("Someone already added this barcode; yours was merged into <name>, and your picture was added"); a plain merge keeps `merged(name)`.
- Picture given up: `SyncNotice.kind` `'picture'`, `scanStrings.pictureDropped(name, reason)` ("The picture of <name> was too large to send, so it was added without one" and its siblings).
- Phone full: `scanStrings.pictureNotSaved` ("This phone has no room for the picture, so the Scan was queued without it").
- A picture that the **server** drops (swept id) is not reported: the sync Result has no `productImageUrl` and nothing else says why; this needs a phone offline for over 24 h after uploading, which the upload-at-sync design makes very rare.

### IndexedDB (`lib/idbStore.ts`, thin glue, not unit-tested because jsdom has no IndexedDB; the contract is tested through `createMemoryPictureStore` and the queue)
- Database `feeder-scan` goes to **version 2**: `upgrade(db, oldVersion)` keeps creating `ops` and `snapshots` for `oldVersion < 1` and adds `pictures` (out-of-line keys = `clientUuid`) for `oldVersion < 2`. Existing queues survive.
- Value stored: `{ bytes: ArrayBuffer, type: string }`, not a `Blob`: older Safari had trouble persisting Blobs. `get` rebuilds `new Blob([bytes], {type})`.
- `appPictureStore()` like `appOpStore()` (lazy shared connection). Memory fallback when IndexedDB is missing or opening fails: Pictures then live only until the page closes, as the ops do (`persistent: false`).
- `useScanController`: `new OfflineQueue(store, undefined, appPictureStore())`.
- Storage budget: the queue guards at 2 MiB per Picture; a shopper who queues 20 unknown pack pictures keeps about 5-10 MB, well under the quota of an installed PWA. No total cap (the quota error path covers a full device).

## GLOSSARY text (for a later team: this team must not edit GLOSSARY.md)
Nothing new is a domain term. Optional wording for **Product**, after the Picture sentence:

> A scan that finds the barcode already taken merges into that Product and gives it the form's **Picture** only if it has none.

## Tests (all red unless noted)

Go
- `internal/product/store/image_fill_test.go` (7): a never-uploaded id is `ErrPictureMissing` and still `ErrInvalid` + `ValidationError{image}` on `CreateProduct` and `SetImage`; a malformed id is not missing (green);
  `FillImage` fills a Product with none, keeps an existing picture and deletes nothing (green with the stub), the first of two wins, a ghost id is typed and writes nothing, unknown Product is `ErrNotFound`, `""` does nothing (green).
- `internal/scan/service/ppx_test.go` (9, fakes extended in `fakes_test.go`: `ghostImages`, `missingErr`, `fills`, `FillPicture`): a merge fills a missing picture and says `PictureFilled`; keeps an existing one with no catalogue call (green);
  no picture on the form fills nothing (green); a gone picture still merges; a created Product is not filled again (green); the sentinel retries without the picture; it is matched through wrapping;
  a `ValidationError{Field:"image"}` is no longer the signal (rejected); a queued batch with a swept picture applies every op.
- `internal/scan/httpapi/wiring_picture_test.go` (package `httpapi`, real store, 5): the adapter maps a missing picture on create and on fill to `service.ErrPictureMissing`, keeps other validation errors (green), fills once and reports it, unknown Product is `ErrProductGone`.
- `internal/scan/httpapi/image_test.go` (+3): a merge into the fixture Product fills its picture over HTTP and keeps the file; a merge keeps the existing picture and leaves the loser's file; a sync batch with a gone picture applies fully (green: regression pin through the real adapter).

BDD (`bdd/features/shopping-scan/offline_pictures.feature`, 7 scenarios, steps in `bdd/steps_ppx_test.go`): merged scan fills a Product without a Picture (red); never replaces one (green); the unused file is left for the clean-up (green);
the phone uploads then syncs with the image id (green); syncing again is `duplicate` (green); a swept picture is dropped and the scan, and the next one, still apply (green); a queued scan merged into a Product without a Picture fills it on sync (red).

Web (vitest, all under `web/src/features/scan`)
- `lib/offlinePicture.test.ts` (3, green: constants): 1600 px below raw mode's 2576, 2 MiB equal to the queue guard, no link source.
- `lib/queue.picture.test.ts` (26): memory store contract; enqueue keeps the Blob out of the entry, over-limit / quota / no store queue without the picture, duplicate uuid, cancel removes the Blob; flush uploads then syncs with the id (order checked),
  only pictured ops are uploaded and order is kept, the id is persisted so a retry does not re-upload, connectivity failures (0, 408, 429, 502, 503) keep everything and count an attempt, 401 is raised, permanent failures (413, 422 x2, 400, unreadable Blob)
  sync without the picture and report the reason, a missing Blob is `missing`, and `pictureFailures` is absent when all is well.
- `hooks/useSyncQueue.picture.test.tsx` (4): offline queue then online event uploads and syncs; the 1 s / 2 s backoff for a failing upload; a given-up picture is a `'picture'` notice with the results; `onPictureNotStored`.
- `lib/notices.picture.test.ts` (8): the merge notice with and without a picture, `pictureNotices` for each reason, order.
- `api.picture.test.ts` (2): `uploadPicture` posts `{dataUrl}` to `/api/images` and answers the id; a 413 raises `ApiError`.
- `hooks/useScanFlow.offlinePicture.test.tsx` (5): the Blob is the second argument of `submit`, none when absent (second argument `undefined`), an uploaded id wins, a url result is never queued, the line shows a queued scan.
- `components/UnknownBarcodeSheet.offlinePicture.test.tsx` (8, helper `components/rawPicker.test-helper.tsx`): raw mode, 4:3, no link; 1600 px and 2 MiB; saves the Blob; removing it; optional; upload mode online (green);
  a Blob picked offline is dropped once online; an uploaded id survives going offline (green).
- **Existing tests changed (2):** `UnknownBarcodeSheet.picture.test.tsx` ("is left out while the phone is offline" -> "is there ... in raw mode") and `ScanScreen.picture.test.tsx` ("leaves it out while offline" -> raw mode offline, upload mode online). Both pinned PP's rule that PPX reverses.

### Red list and what stays green
Red now: `go test ./...` has 16 failing tests, only in `internal/product/store` (5), `internal/scan/service` (6) and `internal/scan/httpapi` (5), plus 2 scenarios of `bdd` (`TestFeatures`); vitest has 39 failing tests, all in the 8 new or changed files above.
Everything else is green, and the green-by-design cases pin behaviour that must not regress. The web tests were run against a throwaway reference implementation of the design (not committed) and all passed, so a red test is red for the missing behaviour, not for a test bug.

## Order of work for the Developer
1. Go: `checkImage` sets `Err: ErrPictureMissing`; `Store.FillImage`; the adapter (`wiring.go`) maps the sentinel and implements `FillPicture`; `service.shopUnknown` (sentinel match, merge fill, `PictureFilled`).
2. Web queue: `enqueue` with the picture, `flush` upload phase, `cancel`; `useSyncQueue` (`onPictureNotStored`, notices); `pictureNotices` and the merge notice text; `api.uploadPicture`.
3. Web form: `UnknownBarcodeSheet` raw-mode branch and `picture: null` on Save online; `useScanFlow.saveUnknown` (one-argument `submit` when no Blob); `useScanController` (picture store, `syncApi.uploadPicture`, toast).
4. `idbStore.ts` version 2 and `appPictureStore()` (check by hand in the browser: queue offline, reload, go online).
5. `scripts/check.sh`.

## Open points
- The picker's raw mode returns the cropped, downscaled Blob but no preview of the **Picture** exists on the scan line while the scan is queued. Fine for beta; PE-style thumbs can use an object URL later.
- If the User queues a scan with a Picture and the Ingredient or Shop is gone by sync time, the scan is rejected as today and the uploaded file waits for the sweep (one orphan, 24 h).
- No total cap on queued Pictures; revisit if real use shows quota errors (they are already handled by queueing without the picture).
