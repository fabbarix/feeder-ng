// IndexedDB implementations (library `idb`) of OpStore and SnapshotStore, in one database "feeder-scan":
// object store `ops` (keyPath op.clientUuid, ordered by an auto-increment `seq` index so all() keeps insertion order)
// and `snapshots` (out-of-line keys). Thin glue, not unit-tested (jsdom has no IndexedDB); falls back to the memory
// stores when indexedDB is missing or opening fails.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { OpStore, QueuedOp } from './queue'
import { createMemoryOpStore } from './queue'
import { createMemorySnapshotStore, type SnapshotStore } from './snapshots'
import { withChangeEvents } from './queueEvents'

export interface Stores {
  ops: OpStore
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
}

async function openDatabase(name: string): Promise<IDBPDatabase<ScanDb>> {
  return openDB<ScanDb>(name, 1, {
    upgrade(db) {
      const ops = db.createObjectStore('ops', { keyPath: 'op.clientUuid' })
      ops.createIndex('seq', 'seq')
      db.createObjectStore('snapshots')
    },
  })
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
    return { ops: createMemoryOpStore(), snapshots: createMemorySnapshotStore(), persistent: false }
  }
  try {
    const db = await openDatabase(name)
    return { ops: idbOpStore(db), snapshots: idbSnapshotStore(db), persistent: true }
  } catch {
    return { ops: createMemoryOpStore(), snapshots: createMemorySnapshotStore(), persistent: false }
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
