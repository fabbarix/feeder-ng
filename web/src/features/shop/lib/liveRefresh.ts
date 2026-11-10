// One refetch of the Shopping List per burst of changes (WP7, QA: /api/shopping/list was fetched about 4 times per tick).
// Cause: a tick invalidated ['shopping'] itself AND the server then published `shopping`, `stock` and `plan`/`products`
// events, each of which invalidated the same query again; invalidateQueries cancels the request in flight by default, so
// every call became its own request. All paths (local mutations, SSE events, scan results) now ask this scheduler, which
// collapses the requests of one burst into a single invalidation. Plain TypeScript, no React.
import type { QueryClient } from '@tanstack/react-query'

export interface LiveRefresh {
  /** Ask for a refetch. The first request of a burst starts a timer; requests while it runs add nothing. */
  request(): void
  /** Drop a pending request (tests, unmount of the last user). */
  cancel(): void
}

/** Burst window in ms: long enough for the server's follow-up events, short enough to feel instant. */
export const LIVE_REFRESH_WINDOW_MS = 250

/** Calls `invalidate` once, `windowMs` after the first of any number of `request()` calls (trailing only). */
export function createLiveRefresh(invalidate: () => void, windowMs: number = LIVE_REFRESH_WINDOW_MS): LiveRefresh {
  let timer: ReturnType<typeof setTimeout> | null = null
  return {
    request() {
      if (timer !== null) return
      timer = setTimeout(() => {
        timer = null
        invalidate()
      }, windowMs)
    },
    cancel() {
      if (timer === null) return
      clearTimeout(timer)
      timer = null
    },
  }
}

const schedulers = new WeakMap<QueryClient, LiveRefresh>()

/** The scheduler shared by everything that uses `queryClient` (one per client). It invalidates ['shopping'] with cancelRefetch: false. */
export function liveRefreshFor(queryClient: QueryClient): LiveRefresh {
  let scheduler = schedulers.get(queryClient)
  if (!scheduler) {
    scheduler = createLiveRefresh(() => void queryClient.invalidateQueries({ queryKey: ['shopping'] }, { cancelRefetch: false }))
    schedulers.set(queryClient, scheduler)
  }
  return scheduler
}
