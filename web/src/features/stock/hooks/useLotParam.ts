// B9-29 (TB-11): /pantry?lot=<id> (the "about to spoil" notification) opens that Stock Lot's sheet on arrival. An id that is not a
// Lot opens nothing. It opens once per address: closing the sheet does not open it again. React hook.
import { useCallback, useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import { unsortedLots } from '../lib/putAway'
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

/**
 * B9-43 (SSP-09): /pantry?putAway=1 (the Shop's "Put away 17 Stock Lots") opens the Put away sheet over the Not sorted Stock Lots once they
 * have loaded, once per address. With none Not sorted nothing opens. `clear()` removes the parameter (replace, so Back does not open the
 * sheet again); the screen calls it when the sheet closes.
 */
export function usePutAwayParam(lots: readonly StockLot[] | undefined, onOpen: (lots: StockLot[]) => void): { clear: () => void } {
  const [params, setParams] = useSearchParams()
  const wanted = params.get('putAway') === '1'
  const handled = useRef(false)
  useEffect(() => {
    if (!wanted) {
      handled.current = false
      return
    }
    if (lots === undefined || handled.current) return
    handled.current = true
    const unsorted = unsortedLots(lots)
    if (unsorted.length > 0) onOpen(unsorted)
    else
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.delete('putAway')
          return next
        },
        { replace: true },
      )
  }, [wanted, lots, onOpen, setParams])
  const clear = useCallback(() => {
    if (!wanted) return
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.delete('putAway')
        return next
      },
      { replace: true },
    )
  }, [wanted, setParams])
  return { clear }
}
