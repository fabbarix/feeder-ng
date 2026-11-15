// B9-43 (SSP-13): "Change the Price" of a Line's suggested Product at a Shop, from the open Line's sheet.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { failureLine, saveFailed } from '../../../lib/errorCopy'
import type { PriceEntry } from '../../../ui/PriceKeypad'
import type { PackSize } from '../../../ui/lib/priceImplication'
import { productsApi } from '../../products/api'
import { priceBodyOf } from '../lib/changePrice'
import type { ListEntry } from '../lib/lines'
import { liveRefreshFor } from '../lib/liveRefresh'

export interface ChangePrice {
  /** the Line whose Product's Price is being changed; null while closed */
  target: ListEntry | null
  /** the Product's name and pack for the sheet; null while closed */
  product: { id: number; name: string; pack: PackSize } | null
  /** the last Price paid at the Shop ("Last time here $2.99 · 14 Nov"); null while loading or when none */
  last: { cents: number; date: string } | null
  /** a failed save, in words; the sheet stays open */
  error: string | null
  open(entry: ListEntry): void
  /** Close with what was typed: a valid typed Price is saved, nothing valid just closes */
  close(entry: PriceEntry): void
  save(entry: PriceEntry): Promise<void>
}

export interface UseChangePriceOptions {
  /** the Shop the list is priced at; null = Any Shop (the Price is then the priced fallback's Shop) */
  shopId: number | null
  /** the Household's today (YYYY-MM-DD): the Price's date */
  today: string | undefined
}

/** The Shop a Line's Price is changed at: the picked one, else the priced fallback's; null = none (no Price can be set). */
export function changePriceShop(entry: ListEntry, shopId: number | null): number | null {
  return shopId ?? entry.details?.priceShopId ?? null
}

export function useChangePrice({ shopId, today }: UseChangePriceOptions): ChangePrice {
  const queryClient = useQueryClient()
  const [target, setTarget] = useState<ListEntry | null>(null)
  const [last, setLast] = useState<{ cents: number; date: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  // the open request: a late answer for an earlier Line is dropped
  const seq = useRef(0)
  useEffect(() => () => void (seq.current += 1), [])

  const productOf = target?.details?.product ?? null
  const product = useMemo(
    () => (productOf ? { id: productOf.id, name: productOf.name, pack: { amount: productOf.packSize, unit: productOf.baseUnit } } : null),
    [productOf],
  )
  const shop = target ? changePriceShop(target, shopId) : null

  const open = useCallback(
    (entry: ListEntry) => {
      const p = entry.details?.product
      const at = changePriceShop(entry, shopId)
      if (!p || at === null) return
      const mine = ++seq.current
      setTarget(entry)
      setLast(null)
      setError(null)
      productsApi
        .latestPrice(p.id, at)
        .then((price) => {
          if (seq.current !== mine) return
          setLast(price && price.priceCents !== null ? { cents: price.priceCents, date: price.date } : null)
        })
        .catch(() => undefined)
    },
    [shopId],
  )

  const finish = useCallback(() => {
    seq.current += 1
    setTarget(null)
    setLast(null)
    setError(null)
  }, [])

  const save = useCallback(
    async (entry: PriceEntry) => {
      if (!target || !productOf || shop === null || !today) return
      const body = priceBodyOf(entry, { shopId: shop, date: today })
      if (!body) return
      try {
        await productsApi.recordPrice(productOf.id, body)
      } catch (err) {
        setError(failureLine(saveFailed('the Price', err)))
        return
      }
      liveRefreshFor(queryClient).request()
      finish()
    },
    [target, productOf, shop, today, queryClient, finish],
  )

  const close = useCallback(
    (entry: PriceEntry) => {
      if (entry.cents !== null && target) {
        void save(entry)
        return
      }
      finish()
    },
    [save, target, finish],
  )

  return useMemo(() => ({ target, product, last, error, open, close, save }), [target, product, last, error, open, close, save])
}
