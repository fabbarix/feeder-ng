// Flushes the offline queue when the phone is online: on mount, on the window `online` event, and after each
// enqueue (React hook; the queue and API are injected).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { backoffMs, type EnqueueResult, type OfflineQueue, type SyncApi } from '../lib/queue'
import { pictureNotices, syncNotices, type SyncNotice } from '../lib/notices'
import type { Op, ScanResult } from '../types'

export interface UseSyncQueueOptions {
  queue: OfflineQueue
  api: SyncApi
  /** navigator.onLine by default */
  isOnline?: () => boolean
  /** called with the results of each flush that sent something (results empty when only Pictures were given up) */
  onResults?: (results: ScanResult[], notices: SyncNotice[], sent: Op[]) => void
  /** PPX: called with the operation when enqueue could not keep its Picture (the scan is queued without it) */
  onPictureNotStored?: (op: Op) => void
  /** B9-54: false = inert (no flush, no listeners): a screen under the shell's SyncQueueProvider keeps no queue of its own. Default true. */
  enabled?: boolean
}

export interface UseSyncQueueResult {
  online: boolean
  /** operations still waiting (pending, not rejected) */
  pendingCount: number
  /** operations the server rejected */
  rejectedCount: number
  /** queues an operation (PPX: with the Blob of its offline Picture, if any) and, when online, flushes */
  enqueue(op: Op, picture?: Blob): Promise<void>
  /** flush now (no-op while offline) */
  flush(): Promise<void>
  /** forgets the rejected operations (their count goes to 0) */
  dismissRejected(): Promise<void>
  /** OfflineQueue.updatePrice: true when the queued operation took the new price (B6) */
  updateQueuedPrice(clientUuid: string, priceCents: number, pricePerKgCents?: number): Promise<boolean>
  /** OfflineQueue.cancel: true when the server has nothing for the operation, false when it must be Undone there */
  cancel(clientUuid: string): Promise<boolean>
  /** re-read the counts after the queue was changed elsewhere */
  refresh(): Promise<void>
  /** B9-54: the Ops still waiting, in the order they were made (Scans and Ticks); the Shop applies its Ticks to its list (shop/lib/pendingTicks) */
  pendingOps: readonly Op[]
  /** B9-54: the Ops the server refused in this session, until dismissed (the "Tick not synced" rows and notices read them) */
  rejectedOps: readonly Op[]
  /** B9-54: OfflineQueue.updateTick: true when the waiting Tick took the new amount; false when it already left the queue (the caller PATCHes the synced Tick) */
  updateQueuedTick(clientUuid: string, quantity: number): Promise<boolean>
}

const defaultOnline = (): boolean => (typeof navigator === 'undefined' ? true : navigator.onLine)

export function useSyncQueue(options: UseSyncQueueOptions): UseSyncQueueResult {
  const queueRef = useRef(options.queue)
  const apiRef = useRef(options.api)
  const onResultsRef = useRef(options.onResults)
  const onPictureNotStoredRef = useRef(options.onPictureNotStored)
  const isOnlineRef = useRef(options.isOnline ?? defaultOnline)
  queueRef.current = options.queue
  apiRef.current = options.api
  onResultsRef.current = options.onResults
  onPictureNotStoredRef.current = options.onPictureNotStored
  isOnlineRef.current = options.isOnline ?? defaultOnline

  const [online, setOnline] = useState(() => isOnlineRef.current())
  const [pendingCount, setPendingCount] = useState(0)
  const [rejectedCount, setRejectedCount] = useState(0)
  const [pendingOps, setPendingOps] = useState<readonly Op[]>(NO_OPS)
  const [rejectedOps, setRejectedOps] = useState<readonly Op[]>(NO_OPS)
  // Automatic retries after an unreachable server (network error or 5xx) while the phone thinks it is online.
  const retryRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const failuresRef = useRef(0)
  const flushRef = useRef<() => Promise<void>>(async () => {})
  /** B9-54: enqueues of this owner under way: their change notice is not a reason to flush (enqueue flushes itself) */
  const enqueuingRef = useRef(0)

  const refreshCounts = useCallback(async () => {
    const [pending, rejected] = await Promise.all([queueRef.current.pending(), queueRef.current.rejected()])
    setPendingCount(pending.length)
    setRejectedCount(rejected.length)
    // B9-54: the same array while nothing changed, so a screen that applies them (shop/lib/pendingTicks) keeps its memo
    setPendingOps((prev) => sameOps(prev, pending.map((e) => e.op)))
    setRejectedOps((prev) => sameOps(prev, rejected.map((e) => e.op)))
  }, [])

  const clearRetry = useCallback(() => {
    if (retryRef.current !== undefined) clearTimeout(retryRef.current)
    retryRef.current = undefined
  }, [])

  const flush = useCallback(async () => {
    clearRetry()
    if (!isOnlineRef.current()) return
    const { offline, results, pictureFailures, sent = [] } = await queueRef.current.flush(apiRef.current)
    // PPX: Pictures given up in this flush are reported even when the batch itself is waiting for the server.
    const pictureFound = pictureNotices(pictureFailures ?? [])
    if (offline) {
      failuresRef.current += 1
      if (isOnlineRef.current()) {
        retryRef.current = setTimeout(() => void flushRef.current(), backoffMs(failuresRef.current))
      }
      if (pictureFound.length > 0) onResultsRef.current?.([], pictureFound, [])
      await refreshCounts()
      return
    }
    failuresRef.current = 0
    if (results.length === 0) {
      await refreshCounts()
      return
    }
    onResultsRef.current?.(results, [...syncNotices(results, sent), ...pictureFound], sent)
    await refreshCounts()
  }, [clearRetry, refreshCounts])
  flushRef.current = flush

  const enqueue = useCallback(
    async (op: Op, picture?: Blob) => {
      enqueuingRef.current += 1
      let result: EnqueueResult
      try {
        result = await queueRef.current.enqueue(op, picture)
      } finally {
        enqueuingRef.current -= 1
      }
      if (picture && !result.pictureStored) onPictureNotStoredRef.current?.(op)
      await refreshCounts()
      await flush()
    },
    [flush, refreshCounts],
  )

  const dismissRejected = useCallback(async () => {
    queueRef.current.dismissRejected()
    await refreshCounts()
  }, [refreshCounts])

  const cancel = useCallback(
    async (clientUuid: string) => {
      const serverHasNothing = await queueRef.current.cancel(clientUuid)
      await refreshCounts()
      return serverHasNothing
    },
    [refreshCounts],
  )

  const enabled = options.enabled ?? true
  useEffect(() => {
    if (!enabled) return
    void refreshCounts()
    // B9-54: another owner of the same queue (or a direct call) changed it; an operation it added is sent from here too when online
    const offChange = queueRef.current.onChange((kind) => {
      void refreshCounts()
      if (kind === 'enqueue' && enqueuingRef.current === 0 && isOnlineRef.current()) void flush()
    })
    if (isOnlineRef.current()) void flush()
    const goOnline = () => {
      setOnline(true)
      void flush()
    }
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      offChange()
      clearRetry()
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [enabled, clearRetry, flush, refreshCounts])

  const updateQueuedPrice = useCallback(
    async (clientUuid: string, priceCents: number, pricePerKgCents?: number) => queueRef.current.updatePrice(clientUuid, priceCents, pricePerKgCents),
    [],
  )

  const updateQueuedTick = useCallback(
    async (clientUuid: string, quantity: number) => {
      const changed = await queueRef.current.updateTick(clientUuid, quantity)
      await refreshCounts()
      return changed
    },
    [refreshCounts],
  )

  return useMemo(
    () => ({ online, pendingCount, rejectedCount, pendingOps, rejectedOps, updateQueuedTick, updateQueuedPrice, enqueue, flush, dismissRejected, cancel, refresh: refreshCounts }),
    [online, pendingCount, rejectedCount, pendingOps, rejectedOps, updateQueuedTick, updateQueuedPrice, enqueue, flush, dismissRejected, cancel, refreshCounts],
  )
}

const NO_OPS: readonly Op[] = []

/** `prev` when `next` holds the same Ops (same ids and contents), else `next`. */
function sameOps(prev: readonly Op[], next: readonly Op[]): readonly Op[] {
  if (next.length === 0) return NO_OPS
  if (prev.length === next.length && prev.every((op, i) => JSON.stringify(op) === JSON.stringify(next[i]))) return prev
  return next
}
