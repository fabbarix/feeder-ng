// Flushes the offline queue when the phone is online: on mount, on the window `online` event, and after each
// enqueue (React hook; the queue and API are injected).
import { useCallback, useEffect, useRef, useState } from 'react'
import type { OfflineQueue, SyncApi } from '../lib/queue'
import { syncNotices, type SyncNotice } from '../lib/notices'
import type { Op, ScanResult } from '../types'

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
  enqueue(op: Op): Promise<void>
  /** flush now (no-op while offline) */
  flush(): Promise<void>
  /** forgets the rejected operations (their count goes to 0) */
  dismissRejected(): Promise<void>
  /** OfflineQueue.cancel: true when the server has nothing for the operation, false when it must be Undone there */
  cancel(clientUuid: string): Promise<boolean>
  /** re-read the counts after the queue was changed elsewhere */
  refresh(): Promise<void>
}

const defaultOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine)

export function useSyncQueue(options: UseSyncQueueOptions): UseSyncQueueResult {
  const queueRef = useRef(options.queue)
  const apiRef = useRef(options.api)
  const onResultsRef = useRef(options.onResults)
  const isOnlineRef = useRef(options.isOnline ?? defaultOnline)
  queueRef.current = options.queue
  apiRef.current = options.api
  onResultsRef.current = options.onResults
  isOnlineRef.current = options.isOnline ?? defaultOnline

  const [online, setOnline] = useState(() => isOnlineRef.current())
  const [pendingCount, setPendingCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)

  const refreshCounts = useCallback(async () => {
    const [pending, rejected] = await Promise.all([queueRef.current.pending(), queueRef.current.rejected()])
    setPendingCount(pending.length)
    setRejectedCount(rejected.length)
  }, [])

  const flush = useCallback(async () => {
    if (!isOnlineRef.current()) return
    const { offline, results } = await queueRef.current.flush(apiRef.current)
    if (offline || results.length === 0) {
      await refreshCounts()
      return
    }
    onResultsRef.current?.(results, syncNotices(results))
    await refreshCounts()
  }, [refreshCounts])

  const enqueue = useCallback(
    async (op: Op) => {
      await queueRef.current.enqueue(op)
      await refreshCounts()
      await flush()
    },
    [flush, refreshCounts],
  )

  // Stubs: the Developer implements them (see the design note, "Client queue").
  const dismissRejected = useCallback(async () => {}, [])
  const cancel = useCallback((clientUuid: string) => queueRef.current.cancel(clientUuid), [])

  useEffect(() => {
    void refreshCounts()
    if (isOnlineRef.current()) void flush()
    const goOnline = () => {
      setOnline(true)
      void flush()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [flush, refreshCounts])

  return { online, pendingCount, rejectedCount, enqueue, flush, dismissRejected, cancel, refresh: refreshCounts }
}
