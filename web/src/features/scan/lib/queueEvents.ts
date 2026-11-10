// A change signal for the persisted offline queue, so the app shell can show "N scans waiting" on every screen
// (useShellStatus) without owning a sync queue. Plain TypeScript, no React. WP7 stubs.
import type { OpStore } from './queue'

/** Calls `listener` after every change made through a store wrapped by withChangeEvents (same tab). Returns the unsubscribe function. */
export function onQueueChange(listener: () => void): () => void {
  void listener
  return () => {}
}

/** Tells the listeners the queue changed (withChangeEvents calls it; exported for tests). */
export function emitQueueChange(): void {}

/** The same OpStore, but append, put and remove emit a change after they succeed (a failed write emits nothing). The default appOpStore() is wrapped in it. */
export function withChangeEvents(store: OpStore): OpStore {
  return store
}
