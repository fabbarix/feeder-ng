/** What a Stock hook tells the screen. Never infer "empty" from a failed request. */
export type StockStatus = 'loading' | 'error' | 'offline' | 'empty' | 'ready'

export interface StatusInput {
  /** True while the first fetch has no data yet. */
  isLoading: boolean
  /** The query's error, if the last fetch failed. */
  error: Error | null
  /** Data already held (fetched or cached), even if stale. */
  hasData: boolean
  /** True when there is data and it holds nothing. */
  isEmpty: boolean
  /** `navigator.onLine === false`. */
  offline: boolean
}

/**
 * Pure. Held data always wins (offline with cached data is `ready`: the shell shows the banner);
 * otherwise offline -> 'offline' (even when the fetch failed because of it), error -> 'error',
 * loading -> 'loading'. 'empty' only when data was received and is empty.
 */
export function resolveStockStatus(_input: StatusInput): StockStatus {
  throw new Error('not implemented')
}
