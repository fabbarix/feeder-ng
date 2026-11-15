// B9-29 (TB-11): /pantry?lot=<id> (the "about to spoil" notification) opens that Stock Lot's sheet on arrival. An id that is not a
// Lot opens nothing. It opens once per address: closing the sheet does not open it again. React hook.
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { StockLot } from '../types'

/** Reads the `lot` parameter; once `lots` has loaded, calls onOpen with that Lot when there is one. */
export function useLotParam(lots: readonly StockLot[] | undefined, onOpen: (lot: StockLot) => void): void {
  const [params] = useSearchParams()
  const wanted = Number(params.get('lot'))
  const handled = useRef<number | null>(null)
  useEffect(() => {
    if (!Number.isInteger(wanted) || wanted <= 0 || lots === undefined || handled.current === wanted) return
    handled.current = wanted
    const lot = lots.find((l) => l.id === wanted)
    if (lot) onOpen(lot)
  }, [wanted, lots, onOpen])
}
