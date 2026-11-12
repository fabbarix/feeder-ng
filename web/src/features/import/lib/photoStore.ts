// Phase 1 of "keep photos on the device" (docs/dev/design/photo-store.md): the storage port, its in-memory implementation, the pure
// helpers between a photo-pages state and stored records, and the serial writer the hook uses. The IndexedDB implementation is
// photoStoreIdb.ts (thin glue).
//
// TODO(wire-up after T3 lands photoPages.ts): StoredSource, StoredEdit, StoredRect and MAX_PHOTOS mirror design photo-read.md
// section 2 (PhotoSource, ImageEdit, Rect, MAX_PHOTOS); replace them with imports of T3's types and delete the local copies.
import { parseImageLink } from '../../../ui/ImagePicker/lib/imageUrl'
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

const TURNS = [0, 1, 2, 3] as const
const HEIC_TYPES = ['image/heic', 'image/heif'] as const
const ID_PATTERN = /^p[1-9]\d*$/

function copyEdit(e: StoredEdit | null): StoredEdit | null {
  return e === null ? null : { turns: e.turns, crop: { ...e.crop } }
}
/** A shallow copy: the Blobs are shared, which is fine because they are never mutated. */
function copySource(s: StoredSource): StoredSource {
  return { ...s }
}
function sameEdit(a: StoredEdit | null, b: StoredEdit | null): boolean {
  if (a === null || b === null) return a === b
  return a.turns === b.turns && a.crop.x === b.crop.x && a.crop.y === b.crop.y && a.crop.width === b.crop.width && a.crop.height === b.crop.height
}

/** Map-backed store for tests and for the fallback; copies `source` and `edit` (not the Blobs) on the way in and out. */
export function createMemoryPhotoStore(): PhotoStore {
  const rows = new Map<string, PhotoRecord>()
  const out = (r: PhotoRecord): PhotoRecord => ({ ...r, source: copySource(r.source), edit: copyEdit(r.edit) })
  return {
    async load() {
      return [...rows.values()].sort((a, b) => a.order - b.order).map(out)
    },
    async keys() {
      return [...rows.keys()]
    },
    async save(record) {
      rows.set(record.id, out(record))
    },
    async update(id, changes) {
      const row = rows.get(id)
      if (row) rows.set(id, { ...row, order: changes.order, edit: copyEdit(changes.edit) })
    },
    async remove(id) {
      rows.delete(id)
    },
    async clear() {
      rows.clear()
    },
  }
}

/** Photos in page order to records (`order` = index). */
export function toRecords(photos: readonly SavablePhoto[], userId: number): PhotoRecord[] {
  return photos.map((p, order) => ({ id: p.id, userId, order, source: p.source, edit: p.edit }))
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
  const wanted = new Set(photos.map((p) => p.id))
  for (const id of await store.keys()) {
    if (!wanted.has(id)) await store.remove(id)
  }
  const before = new Map<string, { photo: SavablePhoto; index: number }>()
  previous?.forEach((photo, index) => before.set(photo.id, { photo, index }))
  for (const [order, photo] of photos.entries()) {
    const was = before.get(photo.id)
    if (!was || was.photo.source !== photo.source) {
      await store.save({ id: photo.id, userId, order, source: photo.source, edit: photo.edit })
    } else if (was.index !== order || !sameEdit(was.photo.edit, photo.edit)) {
      await store.update(photo.id, { order, edit: copyEdit(photo.edit) })
    }
  }
}

export interface RestoreResult {
  photos: SavablePhoto[]
  /** The counter the photo-pages state continues from: the highest kept number + 1 (1 when none). */
  nextId: number
  /** true when a well-formed record belongs to another User: the caller clears the store instead of restoring. */
  otherUser: boolean
}

interface ParsedRecord {
  id: string
  userId: unknown
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
function isStoredBlob(x: unknown): x is Blob {
  return x instanceof Blob && x.size > 0 && x.size <= MAX_PHOTO_BYTES
}

function restoreSource(s: unknown): StoredSource | null {
  if (!isObject(s)) return null
  switch (s.kind) {
    case 'image': {
      const { working, width, height, origin } = s
      if (!isStoredBlob(working) || !working.type.startsWith('image/')) return null
      if (!isPositiveInteger(width) || !isPositiveInteger(height)) return null
      if (!isOneOf(IMAGE_ORIGINS, origin)) return null
      return { kind: 'image', working, width, height, origin }
    }
    case 'as-is': {
      const { blob, type, name } = s
      if (!isStoredBlob(blob) || !isOneOf(HEIC_TYPES, type)) return null
      if (name !== undefined && typeof name !== 'string') return null
      return name === undefined ? { kind: 'as-is', blob, type } : { kind: 'as-is', blob, type, name }
    }
    case 'link': {
      const { url } = s
      if (typeof url !== 'string') return null
      const parsed = parseImageLink(url)
      if (!parsed.ok || parsed.kind !== 'https') return null
      return { kind: 'link', url }
    }
    default:
      return null
  }
}

/** An edit against the TURNED working copy: a turn by 1 or 3 swaps width and height. Null when malformed or the crop does not fit. */
function restoreEdit(e: unknown, width: number, height: number): StoredEdit | null {
  if (!isObject(e)) return null
  const turns = e.turns
  if (!isOneOf(TURNS, turns)) return null
  const c = e.crop
  if (!isObject(c) || !isFiniteNumber(c.x) || !isFiniteNumber(c.y) || !isFiniteNumber(c.width) || !isFiniteNumber(c.height)) return null
  if (c.x < 0 || c.y < 0 || c.width <= 0 || c.height <= 0) return null
  const turned = turns % 2 === 1
  const turnedWidth = turned ? height : width
  const turnedHeight = turned ? width : height
  if (c.x + c.width > turnedWidth || c.y + c.height > turnedHeight) return null
  return { turns, crop: { x: c.x, y: c.y, width: c.width, height: c.height } }
}

/** A record as read from the store (untrusted) to a usable one, or null when it is broken. The User is checked by the caller. */
function parseRecord(r: unknown): ParsedRecord | null {
  if (!isObject(r)) return null
  const { id, userId, order, source, edit } = r
  if (typeof id !== 'string' || !ID_PATTERN.test(id) || !isFiniteNumber(order)) return null
  const restored = restoreSource(source)
  if (!restored) return null
  // An edit only applies to a photo with a working copy; as-is and link photos are never edited.
  let kept: StoredEdit | null = null
  if (restored.kind === 'image' && edit !== undefined && edit !== null) {
    kept = restoreEdit(edit, restored.width, restored.height)
    if (!kept) return null
  }
  return { id, userId, order, source: restored, edit: kept }
}

/**
 * Records (as read from the store, so untrusted) back to restorable photos: only those of `userId`, sorted by `order`, broken records
 * dropped (ids kept as they are: /^p[1-9]\d*$/), at most MAX_PHOTOS kept.
 */
export function restorePhotos(records: readonly unknown[], userId: number): RestoreResult {
  const mine: ParsedRecord[] = []
  let otherUser = false
  for (const r of records) {
    const parsed = parseRecord(r)
    if (!parsed) continue
    if (parsed.userId !== userId) {
      otherUser = true
      continue
    }
    mine.push(parsed)
  }
  mine.sort((a, b) => a.order - b.order)

  const seen = new Set<string>()
  const kept: ParsedRecord[] = []
  for (const p of mine) {
    if (kept.length >= MAX_PHOTOS) break
    if (seen.has(p.id)) continue
    seen.add(p.id)
    kept.push(p)
  }

  let nextId = 1
  for (const p of kept) nextId = Math.max(nextId, Number(p.id.slice(1)) + 1)
  return {
    photos: kept.map(({ id, source, edit }) => ({ id, source, edit })),
    nextId,
    otherUser,
  }
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

type WriterTask = { kind: 'persist'; photos: SavablePhoto[] } | { kind: 'clear' }

/** One serial chain over a store: a failure is swallowed and forgets `previous`, so the next persist rewrites everything. */
export function createPhotoWriter(store: PhotoStore, userId: number): PhotoWriter {
  let started = false
  let previous: SavablePhoto[] | null = null
  let busy = false
  const queue: WriterTask[] = []
  let waiters: Array<() => void> = []

  function settle(): void {
    if (busy || queue.length > 0) return
    const done = waiters
    waiters = []
    for (const resolve of done) resolve()
  }

  async function run(task: WriterTask): Promise<void> {
    try {
      if (task.kind === 'clear') {
        await store.clear()
        previous = null
      } else {
        await persistPhotos(store, task.photos, previous, userId)
        previous = task.photos
      }
    } catch {
      previous = null
    }
  }

  function pump(): void {
    if (busy) return
    const task = queue.shift()
    if (!task) {
      settle()
      return
    }
    busy = true
    void run(task).then(() => {
      busy = false
      pump()
    })
  }

  return {
    start(restored) {
      started = true
      previous = restored ? [...restored] : null
    },
    persist(photos) {
      if (!started) return
      const task: WriterTask = { kind: 'persist', photos: [...photos] }
      const last = queue[queue.length - 1]
      if (last?.kind === 'persist') queue[queue.length - 1] = task
      else queue.push(task)
      pump()
    },
    clear() {
      for (let i = queue.length - 1; i >= 0; i--) {
        if (queue[i]!.kind === 'persist') queue.splice(i, 1)
      }
      queue.push({ kind: 'clear' })
      pump()
    },
    idle() {
      return new Promise<void>((resolve) => {
        waiters.push(resolve)
        settle()
      })
    },
  }
}
