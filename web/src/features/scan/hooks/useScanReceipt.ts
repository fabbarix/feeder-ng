// The Scan screen's side of receipt reading (receipt-reading.md 3.1, 7.2, 7.3): the footer row's props, the session the
// receipt routes read (published on every change), and an apply's results put into the Scanned session once it is loaded.
import { useEffect, useMemo, useState } from 'react'
import { useReadAvailability } from '../../import/hooks/useReadAvailability'
import type { ReadReceiptFooterProps } from '../../receipt/components/ReadReceiptFooter'
import { useReceiptApplied } from '../../receipt/hooks/useReceiptApplied'
import { footerAvailability } from '../../receipt/lib/readGate'
import { publishReceiptSession } from '../../receipt/lib/receiptSession'
import type { ReceiptAppliedEvent } from '../../receipt/types'
import { appliedClientUuids, applyReceiptToSession } from '../lib/receiptApplied'
import type { ScannedList } from './useScannedList'

export interface UseScanReceiptOptions {
  /** the Shop of a Shop session; null in Stock-take, which reads no receipt */
  shopId: number | null
  scanned: ScannedList
  online: boolean
  /** scans still waiting in the offline queue */
  pendingScans: number
  /** asks the live Shopping List again */
  refreshLive?: () => void
}

/** The footer row's props, or null in Stock-take. */
export function useScanReceipt({ shopId, scanned, online, pendingScans, refreshLive }: UseScanReceiptOptions): ReadReceiptFooterProps | null {
  const avail = useReadAvailability()
  const { entries, loaded, update } = scanned
  const clientUuids = useMemo(() => appliedClientUuids(entries), [entries])
  const uuidsKey = clientUuids.join('\n')

  // The receipt routes read the session from here; it changes with every scan, Undo and Change Shop.
  useEffect(() => {
    if (shopId === null || !loaded) return
    publishReceiptSession({ shopId, clientUuids: uuidsKey === '' ? [] : uuidsKey.split('\n') })
  }, [shopId, loaded, uuidsKey])

  // An apply lands while the screen is mounting (its event waited as pending): it is held until the stored session is in.
  const [waiting, setWaiting] = useState<ReceiptAppliedEvent[]>([])
  useReceiptApplied((event) => {
    if (shopId !== null) setWaiting((w) => [...w, event])
  })
  useEffect(() => {
    if (shopId === null || !loaded || waiting.length === 0) return
    const now = new Date().toISOString()
    for (const event of waiting) update((current) => applyReceiptToSession(current, event, { shopId, now }))
    setWaiting([])
    refreshLive?.()
  }, [shopId, loaded, waiting, update, refreshLive])

  if (shopId === null) return null
  return { shopId, clientUuids, online, pendingScans, ...footerAvailability(avail) }
}
