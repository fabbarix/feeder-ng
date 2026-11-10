// G3: the Shop the Shopping List is priced at, chosen with a ShopSelect and shared with the Scan screen through the
// "last Shop used" (scan/lib/lastShop). React hook.
import { useEffect, useState } from 'react'
import { getLastShopId, setLastShopId } from '../../scan/lib/lastShop'
import { useShops } from '../../shops/hooks/useShops'
import type { ShopChoice } from '../../../ui/Select/options'

type Storage_ = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export interface UseShopChoice {
  /** every Shop, in the order the ShopSelect lists them */
  shops: ShopChoice[]
  /** the last Shop used when it still exists (while the Shops load, the stored id is trusted so the list can start); else null = no Shop picked */
  shopId: number | null
  /** remembers the Shop (setLastShopId) and returns it from then on; null = "Any Shop" (forgets the last Shop) */
  setShopId: (id: number | null) => void
  isLoading: boolean
}

/** window.localStorage, or null where it is missing or throws (private modes). */
function defaultStorage(): Storage_ | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/**
 * Reads getLastShopId(localStorage) once. Once useShops() has answered, a stored id that is not a Shop any more gives
 * shopId null and is forgotten (setLastShopId(null)). setShopId(id) stores it and updates shopId at once.
 * `storage` is injectable for tests (default window.localStorage, guarded: it may throw or be missing).
 */
export function useShopChoice(storage?: Storage_ | null): UseShopChoice {
  const store = storage === undefined ? defaultStorage() : storage
  const { shops, isLoading } = useShops()
  const [stored, setStored] = useState<number | null>(() => getLastShopId(store))
  const known = stored !== null && shops.some((s) => s.id === stored)
  const stale = !isLoading && stored !== null && !known

  useEffect(() => {
    if (!stale) return
    setLastShopId(store, null)
    setStored(null)
  }, [stale, store])

  return {
    shops,
    shopId: isLoading ? stored : known ? stored : null,
    setShopId: (id) => {
      setLastShopId(store, id)
      setStored(id)
    },
    isLoading,
  }
}
