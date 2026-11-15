// B9-43 (SSP-13): the body of "Change the Price" from a Line: PUT /api/products/{id}/prices. Plain TypeScript, no React.
import type { PriceEntry } from '../../../ui/PriceKeypad'
import type { PriceBody } from '../../products/types'
import type { LineDetails } from './lineDetails'

/**
 * Whether a Line's Price can be changed: it needs a Product and a Shop to price at, the picked one or, under Any Shop, the Shop of the
 * priced fallback's Price. A last-bought pack under Any Shop has neither, so the sheet shows no "Change the Price" (main-session ruling 3).
 */
export function canChangePrice(details: Pick<LineDetails, 'product' | 'priceShopId'>, shopPicked: boolean): boolean {
  return details.product !== null && (shopPicked || details.priceShopId !== null)
}

/**
 * A pack Price sends priceCents; a per kg Price sends pricePerKgCents and, when the pack Price it implies is known, priceCents too.
 * null when nothing valid was typed.
 */
export function priceBodyOf(entry: PriceEntry, on: { shopId: number; date: string }): PriceBody | null {
  if (entry.cents === null) return null
  if (entry.basis === 'perKg') {
    const perKg = entry.perKgCents ?? entry.cents
    return entry.packCents !== null ? { ...on, priceCents: entry.packCents, pricePerKgCents: perKg } : { ...on, pricePerKgCents: perKg }
  }
  return { ...on, priceCents: entry.packCents ?? entry.cents }
}
