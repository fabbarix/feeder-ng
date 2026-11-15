// B9-43 (SSP-13): the body of "Change the Price" from a Line. Plain TypeScript, no React. STUB (test author).
import type { PriceEntry } from '../../../ui/PriceKeypad'
import type { PriceBody } from '../../products/types'

/** null when nothing valid was typed. */
export function priceBodyOf(_entry: PriceEntry, _on: { shopId: number; date: string }): PriceBody | null {
  throw new Error('not implemented (B9-43)')
}
