// IndexedDB implementations (library `idb`) of OpStore, PictureStore and SnapshotStore, in one database "feeder-scan":
// object store `ops` (keyPath op.clientUuid, ordered by an auto-increment `seq` index so all() keeps insertion order),
// `snapshots` (out-of-line keys) and, since version 2 (PPX), `pictures` (out-of-line keys = clientUuid, the Blob of a
// Picture queued offline, kept as bytes so older Safari has nothing to persist). Thin glue, not unit-tested (jsdom has no
// IndexedDB); falls back to the memory stores when indexedDB is missing or opening fails.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { OpStore, PictureStore, QueuedOp } from './queue'
import { createMemoryOpStore, createMemoryPictureStore } from './queue'
import { createMemorySnapshotStore, type SnapshotStore } from './snapshots'
import { withChangeEvents } from './queueEvents'

export interface Stores {
  ops: OpStore
  pictures: PictureStore
  snapshots: SnapshotStore
  /** false when the in-memory fallback is in use */
  persistent: boolean
}

interface ScanDb extends DBSchema {
  ops: {
    key: string
    value: QueuedOp & { seq?: number }
    indexes: { seq: number }
  }
  snapshots: {
    key: string
    value: unknown
  }
  pictures: {
    key: string
    /** the Blob's bytes and type (a Blob is rebuilt on read) */
    value: { bytes: ArrayBuffer; type: string }
  }
}

async function openDatabase(name: string): Promise<IDBPDatabase<ScanDb>> {
  const db = await openDB<ScanDb>(name, 2, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        const ops = db.createObjectStore('ops', { keyPath: 'op.clientUuid' })
        ops.createIndex('seq', 'seq')
        db.createObjectStore('snapshots')
      }
      if (oldVersion < 2) db.createObjectStore('pictures')
    },
    // A newer tab wants to upgrade the schema: close this connection so it is not blocked, and reopen on next use.
    blocking() {
      db.close()
      shared = undefined
    },
    // The browser dropped the connection: forget it so the next use reopens the database.
    terminated() {
      db.close()
      shared = undefined
    },
  })
  return db
}

function idbPictureStore(db: IDBPDatabase<ScanDb>): PictureStore {
  return {
    async put(clientUuid, blob) {
      await db.put('pictures', { bytes: await blob.arrayBuffer(), type: blob.type }, clientUuid)
    },
    async get(clientUuid) {
      const row = await db.get('pictures', clientUuid)
      return row ? new Blob([row.bytes], { type: row.type }) : undefined
    },
    async remove(clientUuid) {
      await db.delete('pictures', clientUuid)
    },
  }
}

let seqCounter = 0

function idbOpStore(db: IDBPDatabase<ScanDb>): OpStore {
  return {
    async append(entry) {
      seqCounter += 1
      await db.put('ops', { ...entry, seq: Date.now() * 1000 + seqCounter })
    },
    async all() {
      const rows = await db.getAllFromIndex('ops', 'seq')
      return rows.map(({ seq: _seq, ...entry }) => entry)
    },
    async put(entry) {
      const existing = await db.get('ops', entry.op.clientUuid)
      await db.put('ops', { ...entry, seq: existing?.seq ?? Date.now() * 1000 })
    },
    async remove(clientUuid) {
      await db.delete('ops', clientUuid)
    },
  }
}

function idbSnapshotStore(db: IDBPDatabase<ScanDb>): SnapshotStore {
  return {
    async get<T>(key: string) {
      const raw = await db.get('snapshots', key)
      return raw === undefined ? undefined : (JSON.parse(raw as string) as T)
    },
    async set<T>(key: string, value: T) {
      await db.put('snapshots', JSON.stringify(value), key)
    },
    async delete(key: string) {
      await db.delete('snapshots', key)
    },
  }
}

export async function openStores(name = 'feeder-scan'): Promise<Stores> {
  if (typeof indexedDB === 'undefined') {
    return { ops: createMemoryOpStore(), pictures: createMemoryPictureStore(), snapshots: createMemorySnapshotStore(), persistent: false }
  }
  try {
    const db = await openDatabase(name)
    return { ops: idbOpStore(db), pictures: idbPictureStore(db), snapshots: idbSnapshotStore(db), persistent: true }
  } catch {
    return { ops: createMemoryOpStore(), pictures: createMemoryPictureStore(), snapshots: createMemorySnapshotStore(), persistent: false }
  }
}

let shared: Promise<Stores> | undefined
function sharedStores(): Promise<Stores> {
  shared ??= openStores()
  return shared
}

/** The app's snapshot store: IndexedDB, opened on first use (memory when unavailable). */
export function appSnapshots(): SnapshotStore {
  return {
    async get<T>(key: string) {
      return (await sharedStores()).snapshots.get<T>(key)
    },
    async set<T>(key: string, value: T) {
      await (await sharedStores()).snapshots.set(key, value)
    },
    async delete(key: string) {
      await (await sharedStores()).snapshots.delete(key)
    },
  }
}

/** The app's operation queue store (IndexedDB, memory when unavailable), wrapped so every change is announced (queueEvents). */
export function appOpStore(): OpStore {
  return withChangeEvents({
    async append(entry) {
      await (await sharedStores()).ops.append(entry)
    },
    async all() {
      return (await sharedStores()).ops.all()
    },
    async put(entry) {
      await (await sharedStores()).ops.put(entry)
    },
    async remove(clientUuid) {
      await (await sharedStores()).ops.remove(clientUuid)
    },
  })
}

/** PPX: the app's Picture store for queued scans (IndexedDB, memory when unavailable: the Pictures then last as long as the page). */
export function appPictureStore(): PictureStore {
  return {
    async put(clientUuid, blob) {
      await (await sharedStores()).pictures.put(clientUuid, blob)
    },
    async get(clientUuid) {
      return (await sharedStores()).pictures.get(clientUuid)
    },
    async remove(clientUuid) {
      await (await sharedStores()).pictures.remove(clientUuid)
    },
  }
}
