// IndexedDB implementation (library `idb`) of PhotoStore, database "feeder-photo-read", one object store `photos` keyed by photo id.
// A record holds the working copy (or the as-is Blob), the edit, the source kind, the declared type, the link url and the order; never
// the rendered output. Blobs are kept as bytes + type (as scan/lib/idbStore.ts does), so older Safari has nothing to persist.
// Thin glue, not unit-tested (jsdom has no IndexedDB); falls back to the memory store when indexedDB is missing or opening fails.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { createMemoryPhotoStore, type PhotoRecord, type PhotoStore, type StoredSource } from './photoStore'

interface BytesBlob {
  bytes: ArrayBuffer
  type: string
}
type PackedSource =
  | { kind: 'image'; working: BytesBlob; width: number; height: number; origin: Extract<StoredSource, { kind: 'image' }>['origin'] }
  | { kind: 'as-is'; blob: BytesBlob; type: 'image/heic' | 'image/heif'; name?: string }
  | { kind: 'link'; url: string }
type PackedRecord = Omit<PhotoRecord, 'source'> & { source: PackedSource }

interface PhotoDb extends DBSchema {
  photos: { key: string; value: PackedRecord }
}

const pack = async (b: Blob): Promise<BytesBlob> => ({ bytes: await b.arrayBuffer(), type: b.type })
const unpack = (b: BytesBlob): Blob => new Blob([b.bytes], { type: b.type })

async function packRecord(r: PhotoRecord): Promise<PackedRecord> {
  const s = r.source
  if (s.kind === 'image') return { ...r, source: { ...s, working: await pack(s.working) } }
  if (s.kind === 'as-is') return { ...r, source: { ...s, blob: await pack(s.blob) } }
  return { ...r, source: s }
}
function unpackRecord(r: PackedRecord): PhotoRecord {
  const s = r.source
  if (s.kind === 'image') return { ...r, source: { ...s, working: unpack(s.working) } }
  if (s.kind === 'as-is') return { ...r, source: { ...s, blob: unpack(s.blob) } }
  return { ...r, source: s }
}

function idbPhotoStore(db: IDBPDatabase<PhotoDb>): PhotoStore {
  return {
    async load() {
      const rows = await db.getAll('photos')
      return rows.map(unpackRecord).sort((a, b) => a.order - b.order)
    },
    async save(record) {
      await db.put('photos', await packRecord(record), record.id)
    },
    async remove(id) {
      await db.delete('photos', id)
    },
    async clear() {
      await db.clear('photos')
    },
  }
}

export interface OpenedPhotoStore {
  store: PhotoStore
  /** false when the in-memory fallback is in use */
  persistent: boolean
}

export async function openPhotoStore(name = 'feeder-photo-read'): Promise<OpenedPhotoStore> {
  if (typeof indexedDB === 'undefined') return { store: createMemoryPhotoStore(), persistent: false }
  try {
    const db = await openDB<PhotoDb>(name, 1, {
      upgrade(d) {
        d.createObjectStore('photos')
      },
      blocking() {
        db.close()
        shared = undefined
      },
      terminated() {
        db.close()
        shared = undefined
      },
    })
    return { store: idbPhotoStore(db), persistent: true }
  } catch {
    return { store: createMemoryPhotoStore(), persistent: false }
  }
}

let shared: Promise<OpenedPhotoStore> | undefined
function sharedStore(): Promise<OpenedPhotoStore> {
  shared ??= openPhotoStore()
  return shared
}

/** The app's photo store: IndexedDB, opened on first use (memory when unavailable: the photos then last as long as the page). */
export function appPhotoStore(): PhotoStore {
  return {
    async load() {
      return (await sharedStore()).store.load()
    },
    async save(record) {
      await (await sharedStore()).store.save(record)
    },
    async remove(id) {
      await (await sharedStore()).store.remove(id)
    },
    async clear() {
      await (await sharedStore()).store.clear()
    },
  }
}
