// Small key-value snapshots kept on the device (the last Shopping List per range, the offline bundle per Shop),
// so the app shows something when the phone has no signal (functional spec §10.3). Plain TypeScript, no React.
// Stubs until implemented; the IndexedDB implementation (idb) is idbStore.ts and is not unit-tested.

export interface SnapshotStore {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
}

/** An in-memory store (tests, and the fallback where IndexedDB is unavailable). get returns a copy, never the stored object. */
export function createMemorySnapshotStore(): SnapshotStore {
  throw new Error('not implemented')
}

export const snapshotKeys = {
  /** the Shopping List of a Shop and range */
  list: (shopId: number | null, to: string): string => `list:${shopId ?? 'home'}:${to}`,
  /** the offline bundle of a Shop (null = home) */
  bundle: (shopId: number | null): string => `bundle:${shopId ?? 'home'}`,
}
