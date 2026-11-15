// B9-20 (RES-02, RES-06): the one state model of a data screen, and the retry policy behind it. Plain TypeScript, no React.
import { ApiError, GET_TIMEOUT_MS } from './http'

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
export { GET_TIMEOUT_MS }

/**
 * "Unknown is not empty": an empty or "matches" state needs a successful answer. Without data, offline is always
 * offlineUnknown (Try again could not work), online is loading until the request fails. A refetch that fails over
 * held data keeps the data.
 */
export function screenState(q: QueryShape, o: ScreenStateOptions): ScreenState {
  if (q.data === undefined) {
    if (!o.online) return 'offlineUnknown'
    return q.isError ? 'failed' : 'loading'
  }
  if (o.isEmpty) return o.hasFilter ? 'filteredEmpty' : 'empty'
  return o.online ? 'ready' : 'offlineSaved'
}

/** States in which the screen has nothing of its own to show yet, from the least to the most telling. */
const NOT_KNOWN: readonly ScreenState[] = ['loading', 'failed', 'offlineUnknown']

/**
 * The state of a screen that needs several answers: `primary` (the one that decides empty and ready), unless another
 * answer it needs is not known yet; then the most telling of those (offlineUnknown, then failed, then loading).
 */
export function combineScreenStates(primary: ScreenState, ...needed: ScreenState[]): ScreenState {
  const all = [primary, ...needed]
  for (const s of [...NOT_KNOWN].reverse()) if (all.includes(s)) return s
  return primary
}

/** One retry, only for what a second try can fix: a network error, a timeout or a 5xx. Never a 4xx or a bug. */
export function retryPolicy(failureCount: number, error: unknown): boolean {
  if (failureCount >= 1 || !(error instanceof ApiError)) return false
  return error.status === 0 || error.status >= 500
}

export const queryDefaults = {
  queries: { networkMode: 'offlineFirst' as const, retry: retryPolicy, retryDelay: RETRY_DELAY_MS },
  mutations: { networkMode: 'offlineFirst' as const, retry: 0 },
}
