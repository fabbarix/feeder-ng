import type { ReadErrorInput } from '../lib/readErrors'
import type { AdoptedRead, ReadInput, ReadState } from '../types'

export interface UseRecipeRead {
  /** idle: nothing running. starting: the POST is in flight. running: polling. failed: `error` is set. */
  phase: 'idle' | 'starting' | 'running' | 'failed'
  /** starting or running. */
  busy: boolean
  kind: ReadInput['kind'] | undefined
  /** The server state last seen (undefined while idle). */
  state: ReadState | undefined
  error: ReadErrorInput | undefined
  /** Whole seconds since the read started (for "Still working…"). */
  elapsedSeconds: number
  /** Checks the input (lib/readRequest), POSTs, then polls GET until a final state. A second call while busy does nothing. */
  start: (input: ReadInput) => Promise<void>
  /** DELETE the read and go idle (no error). A failed DELETE still goes idle. */
  cancel: () => Promise<void>
  /** Clears a failure. */
  reset: () => void
}

/**
 * Start, poll, cancel one Recipe Assistant read (docs/dev/design/ra-e-import.md section 5.1). `onDone` receives the finished
 * read's review (the screen passes useImportReview.adopt). TODO(ra-e developer).
 */
export function useRecipeRead(opts: { onDone: (read: AdoptedRead) => void }): UseRecipeRead {
  void opts
  return {
    phase: 'idle',
    busy: false,
    kind: undefined,
    state: undefined,
    error: undefined,
    elapsedSeconds: 0,
    start: () => Promise.reject(new Error('TODO(ra-e developer): not implemented')),
    cancel: () => Promise.reject(new Error('TODO(ra-e developer): not implemented')),
    reset: () => undefined,
  }
}
