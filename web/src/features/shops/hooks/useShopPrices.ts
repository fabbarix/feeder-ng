import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { useHouseholdDate } from '../../../app/useHouseholdDate'
import { shopsApi } from '../api'
import { shopPriceRows, type ShopPriceRow } from '../lib/shopPrices'

export interface UseShopPrices {
  state: 'loading' | 'error' | 'ready'
  rows: ShopPriceRow[]
  /** The Products with a Price at the Shop (the "Sold at" group of the Add Shop Barcode sheet). */
  productIds: number[]
  refetch: () => void
}

/** SET-02: the Prices recorded at a Shop, in one request (key ['shops', id, 'prices'], refreshed with ['shops']). */
export function useShopPrices(shopId: number, currency: string): UseShopPrices {
  const query = useQuery({ queryKey: ['shops', shopId, 'prices'], queryFn: () => shopsApi.prices(shopId) })
  // The year shows only for a Price from another year: the Household's year, or the device's before /api/me is known.
  const today = useHouseholdDate() ?? new Date().toISOString().slice(0, 10)
  const rows = useMemo(() => shopPriceRows(query.data ?? [], currency, today), [query.data, currency, today])
  const productIds = useMemo(() => (query.data ?? []).map((w) => w.product.id), [query.data])
  return {
    state: query.isSuccess ? 'ready' : query.isError ? 'error' : 'loading',
    rows,
    productIds,
    refetch: () => void query.refetch(),
  }
}
