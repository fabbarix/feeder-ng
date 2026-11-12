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

const ORIGINS = ['file', 'drop', 'paste', 'link', 'camera'] as const
const TURNS = [0, 1, 2, 3] as const
const HEIC_TYPES = ['image/heic', 'image/heif'] as const

export function createMemoryPhotoStore(): PhotoStore {
  const records = new Map<string, PhotoRecord>()
  // Copies on the way in and out, so a caller cannot change what is stored through an object it holds.
  const sorted = (): PhotoRecord[] =>
    [...records.values()].sort((a, b) => a.order - b.order).map((r) => ({ ...r }))
  return {
    async load() {
      return sorted()
    },
    async save(record) {
      records.set(record.id, { ...record })
    },
    async remove(id) {
      records.delete(id)
    },
    async clear() {
      records.clear()
    },
  }
}

/** Photos in page order to records (`order` = index). */
export function toRecords(photos: readonly SavablePhoto[]): PhotoRecord[] {
  return photos.map((p, order) => ({ id: p.id, order, source: p.source, edit: p.edit }))
}

/**
 * Writes the current pages to the store: saves every photo and removes stored ones that are no longer in the list.
 */
export async function persistPhotos(store: PhotoStore, photos: readonly SavablePhoto[]): Promise<void> {
  for (const record of toRecords(photos)) await store.save(record)
  const keep = new Set(photos.map((p) => p.id))
  for (const stored of await store.load()) {
    if (!keep.has(stored.id)) await store.remove(stored.id)
  }
}

interface ValidRecord {
  id: string
  order: number
  source: StoredSource
  edit: StoredEdit | null
}

function isObject(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null
}
function isFiniteNumber(x: unknown): x is number {
  return typeof x === 'number' && Number.isFinite(x)
}
function isPositiveInteger(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x) && x > 0
}
function isOneOf<T extends string | number>(list: readonly T[], x: unknown): x is T {
  return (list as readonly unknown[]).includes(x)
}
function isNonEmptyBlob(x: unknown): x is Blob {
  return x instanceof Blob && x.size > 0
}
function isHttpsUrl(url: string): boolean {
  try {
    return new URL(url).protocol === 'https:'
  } catch {
    return false
  }
}
function isRect(r: unknown): r is StoredRect {
  return (
    isObject(r) &&
    isFiniteNumber(r.x) &&
    r.x >= 0 &&
    isFiniteNumber(r.y) &&
    r.y >= 0 &&
    isFiniteNumber(r.width) &&
    r.width > 0 &&
    isFiniteNumber(r.height) &&
    r.height > 0
  )
}
function isEdit(e: unknown): e is StoredEdit {
  return isObject(e) && isOneOf(TURNS, e.turns) && isRect(e.crop)
}

function restoreSource(s: unknown): StoredSource | null {
  if (!isObject(s)) return null
  switch (s.kind) {
    case 'image': {
      const { working, width, height, origin } = s
      if (!isNonEmptyBlob(working) || !isPositiveInteger(width) || !isPositiveInteger(height)) return null
      if (!isOneOf(ORIGINS, origin)) return null
      return { kind: 'image', working, width, height, origin }
    }
    case 'as-is': {
      const { blob, type, name } = s
      if (!isNonEmptyBlob(blob) || !isOneOf(HEIC_TYPES, type)) return null
      if (name !== undefined && typeof name !== 'string') return null
      return name === undefined ? { kind: 'as-is', blob, type } : { kind: 'as-is', blob, type, name }
    }
    case 'link': {
      const { url } = s
      if (typeof url !== 'string' || !isHttpsUrl(url)) return null
      return { kind: 'link', url }
    }
    default:
      return null
  }
}

/** A record as read from the store (untrusted) to a usable one, or null when it is broken. */
function restoreRecord(r: unknown): ValidRecord | null {
  if (!isObject(r)) return null
  const { id, order, source, edit } = r
  if (typeof id !== 'string' || id === '' || !isFiniteNumber(order)) return null
  const restored = restoreSource(source)
  if (!restored) return null
  // An edit only applies to a photo that has a working copy; as-is and link photos are never edited.
  if (restored.kind !== 'image' || edit === undefined || edit === null) return { id, order, source: restored, edit: null }
  if (!isEdit(edit)) return null
  return { id, order, source: restored, edit: { turns: edit.turns, crop: { ...edit.crop } } }
}

/**
 * Records (as read from the store, so untrusted) back to restorable photos: sorted by `order`, broken records dropped, at most
 * MAX_PHOTOS kept, ids renumbered 'p1'.. in that order. `nextId` is the counter the photo-pages state continues from.
 */
export function restorePhotos(records: readonly unknown[]): { photos: RestoredPhoto[]; nextId: number } {
  const valid: ValidRecord[] = []
  for (const r of records) {
    const v = restoreRecord(r)
    if (v) valid.push(v)
  }
  valid.sort((a, b) => a.order - b.order)

  const seen = new Set<string>()
  const kept: ValidRecord[] = []
  for (const v of valid) {
    if (kept.length >= MAX_PHOTOS) break
    if (seen.has(v.id)) continue
    seen.add(v.id)
    kept.push(v)
  }

  const photos = kept.map((v, i) => ({ id: `p${i + 1}`, source: v.source, edit: v.edit }))
  return { photos, nextId: photos.length + 1 }
}
