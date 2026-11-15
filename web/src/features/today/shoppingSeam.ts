// B9-44 (TB-12, decision TB 5): the one place Today reads the Scan session (kept out of seams.ts, whose tests mock ../scan and ../shop
// their own way). While this phone has an active Scan session, Today leads with "Shopping at <Shop>".
import { useHouseholdDate } from '../../app/useHouseholdDate'
import { useActiveScanSession } from '../scan'
import { useShops } from '../shops/hooks/useShops'

export interface ShoppingSession {
  shopId: number
  shopName: string
  /** How many Scans the Scanned list holds. */
  scanned: number
  /** Epoch ms of the last Scan. */
  lastScanAt: number
  /** Done shopping: ends the session, keeps the Scanned list. */
  end: () => Promise<void>
  /** Back to Scan: Scan opens straight on this Shop. */
  resume: () => void
}

/** The active Scan session with its Shop's name, or null (none, or its Shop is not known yet). */
export function useShoppingSession(): ShoppingSession | null {
  const day = useHouseholdDate()
  const session = useActiveScanSession(day)
  const { shops } = useShops()
  if (!session) return null
  const shop = shops.find((s) => s.id === session.shopId)
  if (!shop) return null
  return { shopId: session.shopId, shopName: shop.name, scanned: session.scanned, lastScanAt: session.lastScanAt, end: session.end, resume: session.resume }
}
