// IndexedDB implementation (library `idb`) of PhotoStore, database "feeder-photo-read" (version 1), two object stores keyed by photo id:
//   `photos` the metadata: id, userId, order, edit, and the source WITHOUT its bytes (kind, size, origin, declared type, name, link url);
//   `bytes`  {bytes, type} of the working copy or the as-is original (kept as bytes + type, as scan/lib/idbStore.ts does).
// Never the rendered output. save/remove/clear touch both stores in one transaction; update touches `photos` only, so an edit or a
// reorder never rewrites a Blob. load() never throws on a malformed row: it joins what it can and leaves the rest for restorePhotos
// to drop. Thin glue, not unit-tested (jsdom has no IndexedDB); falls back to the memory store when indexedDB is missing or opening fails.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { createMemoryPhotoStore, type PhotoRecord, type PhotoStore, type StoredEdit } from './photoStore'

interface BytesRow {
  bytes: ArrayBuffer
  type: string
}
/** The record minus the Blob: `source` keeps every field except `working` / `blob`. */
type MetaRow = Omit<PhotoRecord, 'source'> & { source: Record<string, unknown> }

interface PhotoDb extends DBSchema {
  photos: { key: string; value: MetaRow }
  bytes: { key: string; value: BytesRow }
}

function split(record: PhotoRecord, bytes: BytesRow): { meta: MetaRow; bytes: BytesRow } {
  const { working: _w, blob: _b, ...rest } = record.source as Record<string, unknown>
  return { meta: { ...record, source: rest }, bytes }
}

function idbPhotoStore(db: IDBPDatabase<PhotoDb>): PhotoStore {
  return {
    async load() {
      const out: unknown[] = []
      try {
        const tx = db.transaction(['photos', 'bytes'])
        const rows = await tx.objectStore('photos').getAll()
        for (const row of rows) {
          try {
            const joined: Record<string, unknown> = { ...row, source: { ...(row.source ?? {}) } }
            const b = await tx.objectStore('bytes').get(row.id)
            if (b && b.bytes instanceof ArrayBuffer) {
              const blob = new Blob([b.bytes], { type: String(b.type ?? '') })
              const src = joined.source as Record<string, unknown>
              if (src.kind === 'image') src.working = blob
              else if (src.kind === 'as-is') src.blob = blob
            }
            out.push(joined)
          } catch {
            // a malformed row is left out
          }
        }
      } catch {
        // nothing readable: nothing to restore
      }
      return out
    },
    async keys() {
      return (await db.getAllKeys('photos')).map(String)
    },
    async save(record) {
      const s = record.source
      const blob = s.kind === 'image' ? s.working : s.kind === 'as-is' ? s.blob : null
      // The bytes are read before the transaction opens (a transaction closes when it has nothing pending).
      const bytes: BytesRow | null = blob ? { bytes: await blob.arrayBuffer(), type: blob.type } : null
      const { meta } = split(record, bytes ?? { bytes: new ArrayBuffer(0), type: '' })
      const tx = db.transaction(['photos', 'bytes'], 'readwrite')
      await tx.objectStore('photos').put(meta, record.id)
      if (bytes) await tx.objectStore('bytes').put(bytes, record.id)
      else await tx.objectStore('bytes').delete(record.id)
      await tx.done
    },
    async update(id, changes: { order: number; edit: StoredEdit | null }) {
      const tx = db.transaction('photos', 'readwrite')
      const row = await tx.store.get(id)
      if (row) await tx.store.put({ ...row, order: changes.order, edit: changes.edit }, id)
      await tx.done
    },
    async remove(id) {
      const tx = db.transaction(['photos', 'bytes'], 'readwrite')
      await Promise.all([tx.objectStore('photos').delete(id), tx.objectStore('bytes').delete(id), tx.done])
    },
    async clear() {
      const tx = db.transaction(['photos', 'bytes'], 'readwrite')
      await Promise.all([tx.objectStore('photos').clear(), tx.objectStore('bytes').clear(), tx.done])
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
        d.createObjectStore('bytes')
      },
      // A newer tab wants to upgrade the schema, or the browser dropped the connection: close it and reopen on next use.
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
    async keys() {
      return (await sharedStore()).store.keys()
    },
    async save(record) {
      await (await sharedStore()).store.save(record)
    },
    async update(id, changes) {
      await (await sharedStore()).store.update(id, changes)
    },
    async remove(id) {
      await (await sharedStore()).store.remove(id)
    },
    async clear() {
      await (await sharedStore()).store.clear()
    },
  }
}
