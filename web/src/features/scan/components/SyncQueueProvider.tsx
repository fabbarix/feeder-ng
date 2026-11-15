// B9-54 (RES-03): the offline queue is one per app, mounted once under the shell, so Shop and Scan share it (Ticks and Scans keep one order and go
// in one batch) and it syncs on every screen.
//   <SyncQueueProvider queue? api? isOnline?>  owns `useSyncQueue({ queue, api, isOnline, onResults })`; defaults: OfflineQueue over appOpStore() and
//                     appPictureStore(), the Scan API's sync and uploadPicture, navigator.onLine. After each flush that sent something it asks the
//                     Shopping List once (liveRefreshFor), invalidates Stock, and the offline data when a Product was created or merged; then it
//                     tells every subscriber.
//   useSharedSyncQueue(given?)   what the provider holds (or `given`), plus subscribe(listener): the listener hears each flush that sent something, with
//                     (results, notices, sent), until it unsubscribes. Without a provider it owns a private queue (as Scan did before B9-54),
//                     so a screen rendered alone still works.
import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { createContext, useCallback, useContext, useMemo, useRef, type ReactNode } from 'react'
import { liveRefreshFor } from '../../shop/lib/liveRefresh'
import { scanApi } from '../api'
import { useSyncQueue, type UseSyncQueueResult } from '../hooks/useSyncQueue'
import { appOpStore, appPictureStore } from '../lib/idbStore'
import type { SyncNotice } from '../lib/notices'
import { shouldRefreshOfflineData } from '../lib/offlineRefresh'
import { createMemoryOpStore, OfflineQueue, type SyncApi } from '../lib/queue'
import type { Op, ScanResult } from '../types'

export type SyncResultsListener = (results: ScanResult[], notices: SyncNotice[], sent: Op[]) => void

export interface SharedSyncQueue extends UseSyncQueueResult {
  subscribe(listener: SyncResultsListener): () => void
  /** PPX: `listener` hears an operation queued WITHOUT its Picture (the phone had no room for it), until it unsubscribes */
  onPictureNotStored(listener: (op: Op) => void): () => void
}

export interface SyncQueueProviderProps {
  queue?: OfflineQueue
  api?: SyncApi
  isOnline?: () => boolean
  children?: ReactNode
}

const SharedContext = createContext<SharedSyncQueue | null>(null)

const appSyncApi: SyncApi = { sync: (ops: Op[]) => scanApi.sync(ops), uploadPicture: (blob: Blob) => scanApi.uploadPicture(blob) }

/** The query client when there is one (a screen test may render without it); the hook is always called, so the order of hooks holds. */
function useOptionalQueryClient(): QueryClient | null {
  try {
    return useQueryClient()
  } catch {
    return null
  }
}

let inertQueue: OfflineQueue | null = null
/** The queue an inert (disabled) owner holds: never flushed, never written. */
function inert(): OfflineQueue {
  inertQueue ??= new OfflineQueue(createMemoryOpStore())
  return inertQueue
}

/** A queue and its sync, with the post-flush refresh and the subscribers. `enabled` false = inert (a provider above owns the queue). */
function useOwnedSyncQueue({ queue, api, isOnline, enabled }: Omit<SyncQueueProviderProps, 'children'> & { enabled: boolean }): SharedSyncQueue {
  const queryClient = useOptionalQueryClient()
  const listeners = useRef(new Set<SyncResultsListener>())
  const pictureListeners = useRef(new Set<(op: Op) => void>())
  const owned = useMemo(() => queue ?? (enabled ? new OfflineQueue(appOpStore(), undefined, appPictureStore()) : inert()), [queue, enabled])
  const sync = useSyncQueue({
    queue: owned,
    api: api ?? appSyncApi,
    ...(isOnline ? { isOnline } : {}),
    enabled,
    onPictureNotStored: (op) => {
      for (const listener of [...pictureListeners.current]) listener(op)
    },
    onResults: (results, notices, sent) => {
      if (results.length > 0 && queryClient) {
        // A Product created (or merged into one) by this batch: the cached offline data must learn its barcode.
        if (shouldRefreshOfflineData(results)) void queryClient.invalidateQueries({ queryKey: ['scan', 'offline'] })
        liveRefreshFor(queryClient).request()
        void queryClient.invalidateQueries({ queryKey: ['stock'] })
      }
      for (const listener of [...listeners.current]) listener(results, notices, sent)
    },
  })
  const subscribe = useCallback((listener: SyncResultsListener) => {
    listeners.current.add(listener)
    return () => {
      listeners.current.delete(listener)
    }
  }, [])
  const onPictureNotStored = useCallback((listener: (op: Op) => void) => {
    pictureListeners.current.add(listener)
    return () => {
      pictureListeners.current.delete(listener)
    }
  }, [])
  return useMemo(() => ({ ...sync, subscribe, onPictureNotStored }), [sync, subscribe, onPictureNotStored])
}

export function SyncQueueProvider({ queue, api, isOnline, children }: SyncQueueProviderProps) {
  const shared = useOwnedSyncQueue({ queue, api, isOnline, enabled: true })
  return <SharedContext.Provider value={shared}>{children}</SharedContext.Provider>
}

/** `given`: a queue the caller already holds (the Scan screen's, for the tick flow inside it): used as it is, and no private one is made. */
export function useSharedSyncQueue(given?: SharedSyncQueue): SharedSyncQueue {
  const shared = useContext(SharedContext)
  const own = useOwnedSyncQueue({ enabled: shared === null && given === undefined })
  return given ?? shared ?? own
}
