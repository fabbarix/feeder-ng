# PHOTO-STORE: keep photos on the device (1.0.0-beta.4.1, task T5)

Product answer (Q5 of photo-read.md section 14): **yes**. The photos a User adds to a photo Recipe read are kept on the device (IndexedDB), so they survive the
browser unloading the tab while the camera app is open. They are cleared after a successful read, when the User removes them, when the User leaves the read and on
sign-out. Nothing is sent anywhere by this.

## Phase 1: the storage lib (`web/src/features/import/lib/`)

- `photoStore.ts`: types, the port, `createMemoryPhotoStore()`, and the pure helpers `toRecords`, `persistPhotos`, `restorePhotos`, plus `createPhotoWriter`. Unit-tested.
- `photoStoreIdb.ts`: `openPhotoStore(name = 'feeder-photo-read')` and `appPhotoStore()`. Thin glue, not unit-tested (jsdom has no IndexedDB; no `fake-indexeddb`).
  Falls back to the memory store when `indexedDB` is missing or opening fails.

**The port** `PhotoStore { load(): Promise<unknown[]>, keys(): Promise<string[]>, save(record), update(id, {order, edit}), remove(id), clear() }`.
`save` writes a whole record; `update` writes metadata only (no Blob) and does nothing for an unknown id; `keys` lists ids without reading Blobs. `load` returns untrusted
rows: it never throws on a malformed row.

**IndexedDB layout**: database `feeder-photo-read`, version 1, two object stores keyed by photo id: `photos` (id, userId, order, edit, and the source without its bytes:
kind, width, height, origin, declared type, name, link url) and `bytes` (`{bytes, type}` of the working copy or the as-is original). `save`, `remove` and `clear` use one
transaction over both stores; `update` touches `photos` only, so an edit or a reorder never rewrites a Blob. `load` joins metadata to bytes per row; a row with no bytes is
left for `restorePhotos` to drop. Never the rendered output, never the revision.

**`restorePhotos(records, userId)`** treats records as untrusted. It keeps only records of this User (`otherUser: true` when a well-formed record belongs to someone else),
sorts by `order`, keeps at most `MAX_PHOTOS` (4), and **keeps ids as stored** (`/^p[1-9]\d*$/`; any other id is dropped); `nextId` = highest kept number + 1. It drops a
record when: the shape is wrong or an id repeats; an image's working copy is empty, over 8 MB, or its type does not start with `image/`; width/height are not positive
integers; the origin is unknown; an as-is Blob is empty or over 8 MB or its declared type is not HEIC/HEIF; a link fails `parseImageLink` (so it must be https with no
credentials); the edit is malformed or its crop does not fit inside the turned working copy (width and height swap for 1 and 3 turns). `edit` is forced to null for `as-is`
and `link`. A restored photo is `{id, source, edit}`; the reducer adds the pending output and `revision: 0`.

**`persistPhotos(store, photos, previous, userId)`** writes as little as possible: removes the stored ids not in the list (`keys()`), then `save` only for a new id or one
whose `source` object differs from `previous`, `update` when only order or edit changed, nothing otherwise. `previous` null = full write. A reorder or an edit writes no Blob.

**`createPhotoWriter(store, userId)`** (`start(restored?)`, `persist(photos)`, `clear()`, `idle()`) is the only way the hook writes. One serial chain; a rejection is swallowed
and the chain continues; a queued (not yet running) persist is replaced by the newest list; after a failure `previous` is forgotten so the next persist is a full resync;
`clear()` drops queued persists, runs after the operation in flight and resets `previous`; before `start()` persist does nothing. `start(restored)` records the restored
photos as `previous` so they are not written again.

The local types in `photoStore.ts` (`StoredSource`, `StoredEdit`, `StoredRect`, `MAX_PHOTOS`) mirror photo-read.md section 2 until T3's `photoPages.ts` lands; then they become
imports. `ImageOrigin` is already imported from `ui/ImagePicker/types`.

## Phase 2 (after T3 merges): wiring

**Writes.** Only through the writer. Persist after `added`, `editCommitted`, `editCancelled` of a new photo (it was removed), `removed` and `moved`. Never after `rendered`,
`draftChanged` or a problem change. A failed write is silent (the photos still work in memory).

**Restore.** Runs at mount of the state owner: `load`, then `restorePhotos(records, me.id)`, then a `restored(photos, nextId)` action, then `writer.start(photos)`. Photos added
while the load runs are merged after the restored ones (ids from the state's counter, which `restored` moves past `nextId`). Restore never gates the UI, and restored photos are
never sent without the User pressing Read recipe. If `otherUser` is true, the store is cleared instead of restored.

**State owner.** `usePhotoPages` lives at `ReadRecipeStep` level, not in the photo panel. Switching tabs neither clears nor restores. If the store holds photos after a reload,
the step opens on the Photo tab.

**Finished read.** Clear when `useRecipeRead` reaches review on success. A failed read, or Try again, keeps the photos.

**Leaving the read.** There is no cancel control (PM decision), so only navigation away from the import page counts. The clear is triggered from the location change, never from
a plain unmount cleanup (StrictMode mounts, unmounts and mounts again). A tab unload, a reload or the browser killing the page never clears.

**Remove.** Removing one photo removes its record. The Remove button on the restore message clears all.

**Sign-out.** `AppRoot.signOut` calls `forgetStoredPhotos()` (exported from the import feature's `index.ts`, clears `appPhotoStore()`) with `.catch(() => {})`, before `/api/logout`.

**Different User.** Records carry the signed-in User's id; restore keeps only a matching User's records, otherwise the store is cleared (see above).

**Copy.** "2 photos from before are back." / "1 photo from before is back." with a **Remove** button; and, in the photo panel's note, "Photos stay on this device until the read
is finished." Checked against GLOSSARY: "Photo" is the Recipe/Step/Member picture term and is used here for the read's pictures as photo-read.md does; none of the `_Avoid_`
words (Thumbnail, Upload, ...) appear.

Size: at most 4 x 8 MB on the device (photo-read.md section 8).
