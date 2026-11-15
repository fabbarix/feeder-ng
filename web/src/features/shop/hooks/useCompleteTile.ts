// B9-43 (SSP-09): the props of "Shopping List complete" (components/CelebrationTile), for the Shop and for Scan's empty To get: the
// Not sorted count behind Put away, whether Read the receipt is offered, and where the two buttons go.
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReadAvailability } from '../../import/hooks/useReadAvailability'
import { useScanSessionActive } from '../../scan/hooks/useScanSessionActive'
import { appSessionStore } from '../../scan/lib/sessionStore'
import type { CelebrationTileProps } from '../components/CelebrationTile'
import type { ShoppingList } from '../types'
import { useUnsortedFromList } from './useUnsortedFromList'

/** The Pantry's Put away sheet over the Not sorted Stock Lots (stock/hooks/useLotParam usePutAwayParam). */
export const PUT_AWAY_PATH = '/pantry?putAway=1'
/** Receipt reading of the Shop's Scan session. */
export const READ_RECEIPT_PATH = '/scan/receipt'

/**
 * Whether this phone has a Scan session today: the Scan screen is open in Shop mode, or a Scan session of the picked Shop is stored for
 * the list's day (the Shop screen is open after the Scan screen closed). Read only while the list is complete.
 */
function useScanSessionToday(list: ShoppingList | undefined, shopId: number | null): boolean {
  const active = useScanSessionActive()
  const day = list?.today ?? null
  const wanted = !active && list?.complete === true && shopId !== null && day !== null
  const [stored, setStored] = useState<{ key: string; has: boolean } | null>(null)
  const key = `${shopId}|${day}`
  useEffect(() => {
    if (!wanted) return
    let alive = true
    const done = (has: boolean) => {
      if (alive) setStored({ key, has })
    }
    try {
      appSessionStore()
        .load(shopId as number, day as string)
        .then((entries) => done(entries.length > 0), () => done(false))
    } catch {
      done(false)
    }
    return () => {
      alive = false
    }
  }, [wanted, key, shopId, day])
  return active || (stored?.key === key && stored.has)
}

/** null while the list is not complete; else the tile's props (Put away when some of its Stock Lots are Not sorted, Read the receipt after Scans). */
export function useCompleteTile({ list, shopId, shopName }: { list: ShoppingList | undefined; shopId: number | null; shopName: string | null }): CelebrationTileProps | null {
  const navigate = useNavigate()
  const unsorted = useUnsortedFromList(list)
  const scanned = useScanSessionToday(list, shopId)
  const assistant = useReadAvailability()
  if (!list?.complete) return null
  return {
    summary: list.summary,
    currency: list.currency,
    shopName,
    unsorted,
    canReadReceipt: scanned && assistant.enabled,
    onPutAway: () => navigate(PUT_AWAY_PATH),
    onReadReceipt: () => navigate(READ_RECEIPT_PATH),
  }
}
