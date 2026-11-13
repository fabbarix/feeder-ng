// SR4: what the Price entry sheet knows about a row's Product (shop-scan-proposals.md 13.4): the pack size, which switches
// "per pack · per kg" on, and the last Price paid here with its day ("Last time here €1.29 · 3 Nov"). Pure TypeScript, no React.
import type { PackSize } from '../../../ui/lib/priceImplication'
import type { OfflineProduct } from '../types'

export interface PriceContext {
  pack?: PackSize
  last: { cents: number; date: string } | null
}

/** The context of a row's Product; a Product the phone does not know (a queued scan that creates one) has neither. */
export function priceContext(product?: OfflineProduct): PriceContext {
  if (!product) return { last: null }
  const context: PriceContext = { pack: { amount: product.packSize, unit: product.baseUnit }, last: null }
  if (product.lastPriceCents != null && product.lastPriceDate) context.last = { cents: product.lastPriceCents, date: product.lastPriceDate }
  return context
}
