// Phase 1 of "keep photos on the device" (docs/dev/design/photo-store.md): the storage port, its in-memory implementation and the pure
// helpers between a photo-pages state and stored records. The IndexedDB implementation is photoStoreIdb.ts (thin glue).
//
// TODO(wire-up after T3 lands photoPages.ts): the types below mirror design photo-read.md section 2 on purpose; replace them with
// imports of Photo, PhotoSource, ImageEdit, ImageOrigin and MAX_PHOTOS, and delete the local copies.

export const MAX_PHOTOS = 4

export interface StoredRect {
  x: number
  y: number
  width: number
  height: number
}
export interface StoredEdit {
  turns: 0 | 1 | 2 | 3
  crop: StoredRect
}
export type StoredOrigin = 'file' | 'drop' | 'paste' | 'link' | 'camera'

/** What a photo was made from, as kept: the same shape as PhotoSource (section 2). */
export type StoredSource =
  | { kind: 'image'; working: Blob; width: number; height: number; origin: StoredOrigin }
  | { kind: 'as-is'; blob: Blob; type: 'image/heic' | 'image/heif'; name?: string }
  | { kind: 'link'; url: string }

/** One stored photo. Never the rendered output (it is rendered again after a restore). `order` is the page position (0-based). */
export interface PhotoRecord {
  id: string
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

/** A photo ready to go back into the photo-pages state. */
export interface RestoredPhoto {
  id: string
  source: StoredSource
  edit: StoredEdit | null
}

export interface PhotoStore {
  /** All saved photos in page order (by `order`). */
  load(): Promise<PhotoRecord[]>
  /** Saves a photo, replacing the one with the same id. */
  save(record: PhotoRecord): Promise<void>
  remove(id: string): Promise<void>
  clear(): Promise<void>
}

export function createMemoryPhotoStore(): PhotoStore {
  throw new Error('not implemented')
}

/** Photos in page order to records (`order` = index). */
export function toRecords(photos: readonly SavablePhoto[]): PhotoRecord[] {
  void photos
  throw new Error('not implemented')
}

/**
 * Writes the current pages to the store: saves every photo and removes stored ones that are no longer in the list.
 */
export async function persistPhotos(store: PhotoStore, photos: readonly SavablePhoto[]): Promise<void> {
  void store
  void photos
  throw new Error('not implemented')
}

/**
 * Records (as read from the store, so untrusted) back to restorable photos: sorted by `order`, broken records dropped, at most
 * MAX_PHOTOS kept, ids renumbered 'p1'.. in that order. `nextId` is the counter the photo-pages state continues from.
 */
export function restorePhotos(records: readonly unknown[]): { photos: RestoredPhoto[]; nextId: number } {
  void records
  throw new Error('not implemented')
}
