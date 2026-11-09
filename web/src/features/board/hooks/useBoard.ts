import type { BoardData } from '../types'

export interface UseBoard {
  data: BoardData | undefined
  isLoading: boolean
  error: Error | null
}

/**
 * GET /api/board through react-query ['board']. Live: refetches on SSE topics
 * `plan`, `stock`, `timers` and `cook` and after a reconnect (one connection).
 * Does nothing where there is no EventSource.
 */
export function useBoard(): UseBoard {
  throw new Error('TODO')
}

export interface Scheme {
  dark: boolean
}

/**
 * The board's light/dark scheme from the server's theme. Starts with
 * theme.dark; sets one timeout for msUntil(theme.nextChangeAt) and then refetches
 * the board (which carries the new answer) instead of guessing the flip itself,
 * so a clock that drifts cannot flip the wrong way. Before data arrives: light.
 * Clears the timeout on unmount or when the theme changes.
 */
export function useBoardScheme(_data: BoardData | undefined, _refetch: () => void, _nowMs?: () => number): Scheme {
  throw new Error('TODO')
}

/** A Date that re-renders every tickMs (default 1000; the board clock uses 10 000). */
export function useNow(_tickMs?: number): Date {
  throw new Error('TODO')
}
