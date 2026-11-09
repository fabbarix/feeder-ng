import type { CookedResult, CookPreview, SlotKey, StockWarning } from '../types'

export interface MarkCookedController {
  preview: CookPreview | null
  isLoading: boolean
  /** The Leftover portions the ± control shows; starts at preview.proposedLeftover. */
  leftover: number
  setLeftover: (next: number) => void
  /** POST .../cooked with the edited portions; resolves to the result (null on failure, with `error` set). */
  confirm: () => Promise<CookedResult | null>
  notCooked: () => Promise<boolean>
  busy: boolean
  error: string | null
  result: CookedResult | null
  /** Shortfall warnings still on screen (dismissed ones are removed). */
  warnings: StockWarning[]
  dismissWarning: (ingredientId: number) => void
}

/** State of the Mark as Cooked flow for one slot; idle while key is null. */
export function useMarkCooked(key: SlotKey | null): MarkCookedController {
  void key
  const none = async () => null
  return {
    preview: null, isLoading: false, leftover: 0, setLeftover: () => {}, confirm: none, notCooked: async () => false,
    busy: false, error: null, result: null, warnings: [], dismissWarning: () => {},
  }
}
