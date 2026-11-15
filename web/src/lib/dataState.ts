// B9-20 (RES-02, RES-06): the one state model of a data screen. Plain TypeScript, no React.
// STUB for the tests: the developer replaces every body. The shapes below are the public API the tests pin.

export type ScreenState = 'loading' | 'ready' | 'empty' | 'filteredEmpty' | 'offlineSaved' | 'offlineUnknown' | 'failed'

/** The part of a TanStack query result the model reads. */
export interface QueryShape {
  data: unknown
  isError: boolean
  fetchStatus: 'fetching' | 'paused' | 'idle'
}

export interface ScreenStateOptions {
  /** the connection, as `!useConnectivity().offline` */
  online: boolean
  /** the answer holds no rows (only read when there is data) */
  isEmpty: boolean
  /** a search or a filter is active (only read when the answer is empty) */
  hasFilter: boolean
}

export const RETRY_DELAY_MS = 1000
export const GET_TIMEOUT_MS = 10_000

export function screenState(_q: QueryShape, _o: ScreenStateOptions): ScreenState {
  throw new Error('not implemented (B9-20)')
}

export function retryPolicy(_failureCount: number, _error: unknown): boolean {
  throw new Error('not implemented (B9-20)')
}

export const queryDefaults: { queries: Record<string, unknown>; mutations: Record<string, unknown> } = { queries: {}, mutations: {} }
