// Flushes the offline queue when the phone is online: on mount, on the window `online` event, and after each
// enqueue (React hook; the queue and API are injected). Stubs until implemented.
import type { OfflineQueue, SyncApi } from '../lib/queue'
import type { SyncNotice } from '../lib/notices'
import type { ScanResult } from '../types'

export interface UseSyncQueueOptions {
  queue: OfflineQueue
  api: SyncApi
  /** navigator.onLine by default */
  isOnline?: () => boolean
  /** called with the results of each flush that sent something */
  onResults?: (results: ScanResult[], notices: SyncNotice[]) => void
}

export interface UseSyncQueueResult {
  online: boolean
  /** operations still waiting (pending, not rejected) */
  pendingCount: number
  /** operations the server rejected */
  rejectedCount: number
  /** queues an operation and, when online, flushes */
  enqueue(op: import('../types').Op): Promise<void>
  /** flush now (no-op while offline) */
  flush(): Promise<void>
}

export function useSyncQueue(options: UseSyncQueueOptions): UseSyncQueueResult {
  void options
  throw new Error('not implemented')
}
