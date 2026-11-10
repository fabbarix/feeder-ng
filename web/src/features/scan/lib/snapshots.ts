// Small key-value snapshots kept on the device (the last Shopping List per range, the offline data per Shop),
// so the app shows something when the phone has no signal (functional spec §10.3). Plain TypeScript, no React.
// Stubs until implemented; the IndexedDB implementation (idb) is idbStore.ts and is not unit-tested.

export interface SnapshotStore {
  get<T>(key: string): Promise<T | undefined>
  set<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<void>
}

/** An in-memory store (tests, and the fallback where IndexedDB is unavailable). get returns a copy, never the stored object. */
export function createMemorySnapshotStore(): SnapshotStore {
  const data = new Map<string, string>()
  return {
    async get<T>(key: string) {
      const raw = data.get(key)
      return raw === undefined ? undefined : (JSON.parse(raw) as T)
    },
    async set<T>(key: string, value: T) {
      data.set(key, JSON.stringify(value))
    },
    async delete(key: string) {
      data.delete(key)
    },
  }
}

export const snapshotKeys = {
  /** the Shopping List of a Shop and range */
  list: (shopId: number | null, to: string): string => `list:${shopId ?? 'home'}:${to}`,
  /** the offline data of a Shop (null = home) */
  offline: (shopId: number | null): string => `offline:${shopId ?? 'home'}`,
}
