// SAFE-01 (B9-18): the debounce and the flushes every editor with a reload draft shares. Plain TypeScript, no React: an editor's
// hook (useRecipeDraft, B9-31) wraps it. Writes 500 ms after the last change, and at once on pagehide and when the page is hidden.
// A failing store never throws into the editor (the leave guard still works; a reload then loses the changes).
import type { DraftArea, DraftStore } from './draftStore'

export interface DraftWriterOptions {
  store: DraftStore
  area: DraftArea
  key: string
  /** The record's updatedAt when editing began; null for a new record. */
  baseUpdatedAt: string | null
  /** Default 500. */
  delayMs?: number
  now?: () => number
  /** Where the pagehide and visibilitychange listeners go. Default window and document. */
  target?: { window: Window; document: Document }
}

export interface DraftWriter<T> {
  /** Schedules a write delayMs after the LAST change. */
  change(draft: T): void
  /** Writes the latest change now, if one is pending. */
  flush(): Promise<void>
  /** Cancels what is pending and removes the stored draft (Save, Discard changes). */
  discard(): Promise<void>
  /** Removes the listeners and cancels the timer without writing. */
  dispose(): void
}

export function createDraftWriter<T>({ store, area, key, baseUpdatedAt, delayMs = 500, now = Date.now, target }: DraftWriterOptions): DraftWriter<T> {
  const win = target?.window ?? window
  const doc = target?.document ?? document
  let pending: { draft: T } | null = null
  let timer: ReturnType<typeof setTimeout> | undefined

  const cancel = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
  }

  const flush = async () => {
    cancel()
    if (!pending) return
    const { draft } = pending
    pending = null
    try {
      await store.put(area, key, { draft, baseUpdatedAt, savedAt: now() })
    } catch {
      // swallowed: see the header
    }
  }

  const onPageHide = () => void flush()
  const onVisibility = () => {
    if (doc.hidden) void flush()
  }
  win.addEventListener('pagehide', onPageHide)
  doc.addEventListener('visibilitychange', onVisibility)

  return {
    change(draft) {
      pending = { draft }
      cancel()
      timer = setTimeout(() => void flush(), delayMs)
    },
    flush,
    async discard() {
      cancel()
      pending = null
      try {
        await store.remove(area, key)
      } catch {
        // swallowed
      }
    },
    dispose() {
      cancel()
      pending = null
      win.removeEventListener('pagehide', onPageHide)
      doc.removeEventListener('visibilitychange', onVisibility)
    },
  }
}
