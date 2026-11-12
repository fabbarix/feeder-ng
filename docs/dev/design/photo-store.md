# PHOTO-STORE: keep photos on the device (1.0.0-beta.4.1, task T5)

Product answer (Q5 of photo-read.md section 14): **yes**. The photos a User adds to a photo Recipe read are kept on the device (IndexedDB), so they survive the
browser unloading the tab while the camera app is open. They are cleared after a successful send, when the User removes them, and when the User leaves the read. Nothing
is sent anywhere by this.

## Phase 1 (this task): the storage lib

Files in `web/src/features/import/lib/`:

- `photoStore.ts`: the port `PhotoStore { load, save, remove, clear }`, `createMemoryPhotoStore()` and the pure helpers `toRecords`, `persistPhotos`, `restorePhotos`. Unit-tested.
- `photoStoreIdb.ts`: `openPhotoStore(name = 'feeder-photo-read')` and `appPhotoStore()` (the app's lazily opened store). Database `feeder-photo-read`, version 1, one object
  store `photos`, out-of-line key = photo id. Thin glue, not unit-tested (jsdom has no IndexedDB; no `fake-indexeddb`). Falls back to the memory store when `indexedDB` is
  missing or opening fails, as `scan/lib/idbStore.ts` does. Blobs are stored as bytes + type.
- `PhotoRecord { id, order, source, edit }`: `source` is the photo's `PhotoSource` (section 2): the working copy Blob with width, height and origin; or the as-is Blob with its
  declared type and name; or the link url. `edit` is the `ImageEdit` or null. **Never the rendered output** (it is rendered again after a restore) and never the revision.
- `restorePhotos(records)` treats records as untrusted: sorts by `order`, drops broken ones (wrong shape, empty or non-Blob bytes, bad size, unknown origin, a declared type
  that is not HEIC/HEIF, a link that is not https, a bad edit, a repeated id), forces `edit = null` for `as-is` and `link`, keeps at most `MAX_PHOTOS` (4), renumbers ids
  `p1`.. and returns `nextId` for the reducer's counter.
- `persistPhotos(store, photos)` makes the store equal to the list: saves every photo (new order included) and removes the stored ones that left.

The local types in `photoStore.ts` (`StoredSource`, `StoredEdit`, `StoredOrigin`, `MAX_PHOTOS`) mirror section 2 until T3's `photoPages.ts` lands; then they become imports.

## Phase 2 (after T3 merges): wiring in `usePhotoPages`

When the store is written:

- After a photo's working copy is ready (`added` with an `image`, or a link / as-is photo added): the hook calls `persistPhotos` with the new list.
- After `editCommitted` (the edit changed), `removed`, `moved`: `persistPhotos` again. A photo being edited for the first time (`isNew`) is already stored; Cancel on it removes it, so the store follows.
- Writes are fire-and-forget and serial (one chain), never block the UI; a failed write is ignored (the photos still work in memory).

When it is cleared (`store.clear()`):

- a **finished read**: the read came back successfully (the same moment `useRecipeRead` goes to its review step);
- **Remove** of the last photo (`persistPhotos([])`), and **Remove** of any photo removes just that record;
- **leaving the read**: the User navigates away from the import page, or cancels the read step (the Back/Cancel action that returns to the choice of how to add a Recipe);
- **sign-out**.

What does **not** clear: a tab unload, a reload, the browser killing the page, the camera app taking over. In those the records stay, and the next time the photo read step
mounts it restores them.

"Leaving the read" is therefore only the User's own act (navigating away or cancelling the step), never the page being unloaded; the hook clears in its unmount cleanup only
when the unmount came from navigation (a React unmount does not happen on a page unload, so the cleanup is safe to use for this).

Restore: on mount, `load()` then `restorePhotos`; if there is at least one photo, they are put in the state (a `restored(photos, nextId)` action; outputs `pending`, so they
render again) and a message says "2 photos from before are back." (singular for one) with **Remove** (clears the store and the photos). The store is rewritten once after a
restore so its ids match the renumbered ones. Restored photos are never sent without the User pressing Read recipe.

Privacy note: one line, "Photos stay on this device until the read is finished.". Size: at most 4 x 8 MB (section 8).

Open for phase 2: exact copy of the restore message and the Remove label (GLOSSARY words), and where the privacy line sits.
