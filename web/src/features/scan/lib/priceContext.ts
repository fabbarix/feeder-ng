// SR4: what the Price entry sheet knows about a row's Product (shop-scan-proposals.md 13.4): the pack size, which switches
// "per pack · per kg" on, and the last Price paid here with its day ("Last time here €1.29 · 3 Nov"). Pure TypeScript, no React.
import type { PackSize } from '../../../ui/lib/priceImplication'
import type { OfflineProduct } from '../types'

export interface PriceContext {
  pack?: PackSize
  last: { cents: number; date: string } | null
}

/** B9-41 (SSP-07): the pack a new weighed Product's row prices against until the phone knows the Product: 1 kg (1 l), so per kg is on. */
const WEIGHED_FALLBACK = 1000

/**
 * The context of a row's Product; a Product the phone does not know (a queued scan that creates one) has neither, except a weighed row
 * in g or ml (B9-41, SSP-07): it gets a 1 kg (1 l) pack, so its keypad opens on per kg.
 */
export function priceContext(product?: OfflineProduct, row?: { weighed: boolean; baseUnit: string }): PriceContext {
  if (!product) {
    if (row?.weighed && (row.baseUnit === 'g' || row.baseUnit === 'ml')) return { pack: { amount: WEIGHED_FALLBACK, unit: row.baseUnit }, last: null }
    return { last: null }
  }
  const context: PriceContext = { pack: { amount: product.packSize, unit: product.baseUnit }, last: null }
  if (product.lastPriceCents != null && product.lastPriceDate) context.last = { cents: product.lastPriceCents, date: product.lastPriceDate }
  return context
}
