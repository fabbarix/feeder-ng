// B9-54 (RES-03): the offline queue is one per app, mounted once under the shell, so Shop and Scan share it (Ticks and Scans keep one order and go
// in one batch) and it syncs on every screen. STUB (test author): the API the tests pin; the developer writes it.
//   <SyncQueueProvider queue? api? isOnline?>  owns `useSyncQueue({ queue, api, isOnline, onResults })`; defaults: OfflineQueue over appOpStore() and
//                     appPictureStore(), the Scan API's sync and uploadPicture, navigator.onLine. Its onResults tells every subscriber.
//   useSharedSyncQueue()   what the provider holds, plus subscribe(listener): the listener hears each flush that sent something, with
//                     (results, notices, sent), until it unsubscribes. Without a provider it owns a private queue (as Scan did before B9-54),
//                     so a screen rendered alone still works.
import type { ReactNode } from 'react'
import type { OfflineQueue, SyncApi } from '../lib/queue'
import type { SyncNotice } from '../lib/notices'
import type { Op, ScanResult } from '../types'
import type { UseSyncQueueResult } from '../hooks/useSyncQueue'

export type SyncResultsListener = (results: ScanResult[], notices: SyncNotice[], sent: Op[]) => void

export interface SharedSyncQueue extends UseSyncQueueResult {
  subscribe(listener: SyncResultsListener): () => void
}

export interface SyncQueueProviderProps {
  queue?: OfflineQueue
  api?: SyncApi
  isOnline?: () => boolean
  children?: ReactNode
}

export function SyncQueueProvider({ children }: SyncQueueProviderProps) {
  return <>{children}</>
}

export function useSharedSyncQueue(): SharedSyncQueue {
  throw new Error('not implemented')
}
