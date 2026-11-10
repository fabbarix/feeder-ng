// A change signal for the persisted offline queue, so the app shell can show "N scans waiting" on every screen
// (useShellStatus) without owning a sync queue. Plain TypeScript, no React.
import type { OpStore } from './queue'

const listeners = new Set<() => void>()

/** Calls `listener` after every change made through a store wrapped by withChangeEvents (same tab). Returns the unsubscribe function. */
export function onQueueChange(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** Tells the listeners the queue changed (withChangeEvents calls it; exported for tests). */
export function emitQueueChange(): void {
  for (const listener of [...listeners]) listener()
}

/** The same OpStore, but append, put and remove emit a change after they succeed (a failed write emits nothing). The default appOpStore() is wrapped in it. */
export function withChangeEvents(store: OpStore): OpStore {
  return {
    ...store,
    async append(entry) {
      await store.append(entry)
      emitQueueChange()
    },
    async put(entry) {
      await store.put(entry)
      emitQueueChange()
    },
    async remove(clientUuid) {
      await store.remove(clientUuid)
      emitQueueChange()
    },
  }
}
