// IndexedDB implementations (library `idb`) of OpStore and SnapshotStore, in one database "feeder-scan":
// object store `ops` (keyPath op.clientUuid, ordered by an auto-increment `seq` index so all() keeps insertion order)
// and `snapshots` (out-of-line keys). Thin glue, not unit-tested (jsdom has no IndexedDB); falls back to the memory
// stores when indexedDB is missing or opening fails. Stub until implemented.
import type { OpStore } from './queue'
import type { SnapshotStore } from './snapshots'

export interface Stores {
  ops: OpStore
  snapshots: SnapshotStore
  /** false when the in-memory fallback is in use */
  persistent: boolean
}

export async function openStores(name = 'feeder-scan'): Promise<Stores> {
  void name
  throw new Error('not implemented')
}
