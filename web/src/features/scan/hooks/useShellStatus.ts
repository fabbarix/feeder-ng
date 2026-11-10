// The Scan feature's contribution to the app shell's status banner (the WP5 extension point, see
// docs/dev/design/wp5-shell.md "useShellStatus"): how many scans sit in the persisted offline queue. It is called on
// EVERY screen, so it owns no sync queue and no network: it only counts the persisted entries. React hook; WP7 stub.
import type { OpStore } from '../lib/queue'

export interface ShellStatus {
  pendingScans: number
}

/**
 * Counts `store.all()` (rejected operations are not in the store, so this is "waiting to sync"). Reads on mount and again
 * on onQueueChange, on the window `online`/`offline` events and when the tab becomes visible. 0 until the first read;
 * a read that throws (no IndexedDB) counts 0. `store` is injectable for tests (default withChangeEvents(appOpStore())).
 */
export function useShellStatus(store?: OpStore): ShellStatus {
  void store
  return { pendingScans: 0 }
}
