// G3: the Shop the Shopping List is priced at, chosen with a ShopSelect and shared with the Scan screen through the
// "last Shop used" (scan/lib/lastShop). React hook; WP7 stub.
import type { ShopChoice } from '../../../ui/Select/options'

export interface UseShopChoice {
  /** every Shop, in the order the ShopSelect lists them */
  shops: ShopChoice[]
  /** the last Shop used when it still exists (while the Shops load, the stored id is trusted so the list can start); else null = no Shop picked */
  shopId: number | null
  /** remembers the Shop (setLastShopId) and returns it from then on */
  setShopId: (id: number) => void
  isLoading: boolean
}

/**
 * Reads getLastShopId(localStorage) once. Once useShops() has answered, a stored id that is not a Shop any more gives
 * shopId null and is forgotten (setLastShopId(null)). setShopId(id) stores it and updates shopId at once.
 * `storage` is injectable for tests (default window.localStorage, guarded: it may throw or be missing).
 */
export function useShopChoice(storage?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null): UseShopChoice {
  void storage
  return { shops: [], shopId: null, setShopId: () => {}, isLoading: true }
}
