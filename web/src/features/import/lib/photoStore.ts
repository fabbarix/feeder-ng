// Phase 1 of "keep photos on the device" (docs/dev/design/photo-store.md): the storage port, its in-memory implementation, the pure
// helpers between a photo-pages state and stored records, and the serial writer the hook uses. The IndexedDB implementation is
// photoStoreIdb.ts (thin glue). STUBS: the developer implements the functions below against photoStore.test.ts.
//
// TODO(wire-up after T3 lands photoPages.ts): StoredSource, StoredEdit, StoredRect and MAX_PHOTOS mirror design photo-read.md
// section 2 (PhotoSource, ImageEdit, Rect, MAX_PHOTOS); replace them with imports of T3's types and delete the local copies.
import type { ImageOrigin } from '../../../ui/ImagePicker/types'

export const MAX_PHOTOS = 4
/** The largest Blob kept per photo (the working copy, or an as-is original): design photo-read.md section 8. */
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024

export const IMAGE_ORIGINS = ['file', 'drop', 'paste', 'link', 'camera'] as const satisfies readonly ImageOrigin[]

export interface StoredRect {
  x: number
  y: number
  width: number
  height: number
}
export interface StoredEdit {
  turns: 0 | 1 | 2 | 3
  /** In pixels of the TURNED working copy. */
  crop: StoredRect
}

/** What a photo was made from, as kept: the same shape as PhotoSource (section 2). */
export type StoredSource =
  | { kind: 'image'; working: Blob; width: number; height: number; origin: ImageOrigin }
  | { kind: 'as-is'; blob: Blob; type: 'image/heic' | 'image/heif'; name?: string }
  | { kind: 'link'; url: string }

/** One stored photo. Never the rendered output (it is rendered again after a restore) and never the revision. `order` is the page position (0-based). */
export interface PhotoRecord {
  id: string
  /** The signed-in User who added it; a restore for another User clears instead. */
  userId: number
  order: number
  source: StoredSource
  edit: StoredEdit | null
}

/** The part of a Photo the store needs (a Photo is assignable to it). */
export interface SavablePhoto {
  id: string
  source: StoredSource
  edit: StoredEdit | null
}

export interface PhotoStore {
  /** Everything stored, untrusted (a row may be malformed; restorePhotos decides). Any order. */
  load(): Promise<unknown[]>
  /** The ids of the stored photos, without reading any Blob. */
  keys(): Promise<string[]>
  /** Writes a whole record (metadata and bytes), replacing the one with the same id. */
  save(record: PhotoRecord): Promise<void>
  /** Writes the metadata only (no Blob is touched). A no-op for an unknown id. */
  update(id: string, changes: { order: number; edit: StoredEdit | null }): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

/** Map-backed store for tests and for the fallback; copies `source` and `edit` (not the Blobs) on the way in and out. */
export function createMemoryPhotoStore(): PhotoStore {
  throw new Error('not implemented')
}

/** Photos in page order to records (`order` = index). */
export function toRecords(photos: readonly SavablePhoto[], userId: number): PhotoRecord[] {
  void photos
  void userId
  throw new Error('not implemented')
}

/**
 * Brings the store in line with `photos`, writing as little as possible:
 * 1. removes the stored ids (keys()) that are not in the list;
 * 2. save() only for an id that is new, or whose `source` object differs from `previous`'s;
 * 3. update() when only the order or the edit changed; nothing when nothing changed.
 * `previous` null = unknown: every photo is saved.
 */
export async function persistPhotos(
  store: PhotoStore,
  photos: readonly SavablePhoto[],
  previous: readonly SavablePhoto[] | null,
  userId: number,
): Promise<void> {
  void store
  void photos
  void previous
  void userId
  throw new Error('not implemented')
}

export interface RestoreResult {
  photos: SavablePhoto[]
  /** The counter the photo-pages state continues from: the highest kept number + 1 (1 when none). */
  nextId: number
  /** true when a well-formed record belongs to another User: the caller clears the store instead of restoring. */
  otherUser: boolean
}

/**
 * Records (as read from the store, so untrusted) back to restorable photos: only those of `userId`, sorted by `order`, broken records
 * dropped (ids kept as they are: /^p[1-9]\d*$/), at most MAX_PHOTOS kept.
 */
export function restorePhotos(records: readonly unknown[], userId: number): RestoreResult {
  void records
  void userId
  throw new Error('not implemented')
}

export interface PhotoWriter {
  /** Until start() is called, persist does nothing. */
  start(restored?: readonly SavablePhoto[]): void
  /** Queues "make the store equal to this list"; a queued (not yet running) persist is replaced by the newest list. Never throws. */
  persist(photos: readonly SavablePhoto[]): void
  /** Drops queued persists, then empties the store after the operation in flight, and forgets what was written. Never throws. */
  clear(): void
  /** Resolves (never rejects) when everything queued so far has run. */
  idle(): Promise<void>
}

/** One serial chain over a store: a failure is swallowed and forgets `previous`, so the next persist rewrites everything. */
export function createPhotoWriter(store: PhotoStore, userId: number): PhotoWriter {
  void store
  void userId
  throw new Error('not implemented')
}
