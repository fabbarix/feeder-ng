// B9-43 (SSP-13): "Change the Price" of a Line's Product at a Shop. STUB (test author).
import type { PriceEntry } from '../../../ui/PriceKeypad'
import type { PackSize } from '../../../ui/lib/priceImplication'
import type { ListEntry } from '../lib/lines'

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

export function useChangePrice(_options: UseChangePriceOptions): ChangePrice {
  throw new Error('not implemented (B9-43)')
}
