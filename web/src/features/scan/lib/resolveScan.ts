// Turns a parsed scan into what the UI should do next, using only the cached bundle (so it works offline).
// Plain TypeScript, no React. Stubs until the Developer implements them.
import type { Bundle, BundleProduct } from '../types'
import type { Scanned } from './barcode'

export type ScanPlan =
  /** a Product (pack size, or the decoded weight) ready to become a Stock Lot */
  | { kind: 'known'; product: BundleProduct; quantity: number; priceCents: number | null; pricePerKgCents?: number }
  /** a price-valued Weight Barcode Rule with no price per kg yet: ask the weight once */
  | { kind: 'ask_weight'; product: BundleProduct; priceCents: number }
  /** nothing matched: the full "what is this?" form for this canonical code */
  | { kind: 'unknown'; code: string }
  /** a Weight Barcode Rule matched but the item code is new: only Ingredient and Product name (and the weight when needsWeight) */
  | { kind: 'unknown_weighed'; ruleId: number; itemCode: string; weightGrams?: number; priceCents?: number; needsWeight: boolean }
  /** QR/DataMatrix that is not a GS1 Digital Link: toast "not a product code" */
  | { kind: 'not_product' }
  /** unreadable (bad check digit, wrong length, zero value) */
  | { kind: 'invalid'; reason: string }

/**
 * Resolves with barcode.resolve against bundle.catalog and looks the Product up in bundle.products.
 * known: quantity = pack size; priceCents = the Product's lastPriceCents (null when none). A weighed Product:
 * quantity = decoded grams; pricePerKgCents from the catalog; priceCents = the decoded price (price rule) or
 * round(pricePerKg x grams / 1000) (weight rule), null when neither is known.
 * A resolved Product that is missing from bundle.products is treated as unknown.
 */
export function planScan(scanned: Scanned, bundle: Bundle): ScanPlan {
  void scanned
  void bundle
  throw new Error('not implemented')
}

export interface AskedWeight {
  /** grams */
  quantity: number
  priceCents: number
  /** barcode.pricePerKgFromWeight, recorded so the next scan decodes the weight */
  pricePerKgCents: number
}

/** The weight the User gave for an ask_weight plan. Throws for a weight <= 0. */
export function applyAskedWeight(plan: Extract<ScanPlan, { kind: 'ask_weight' }>, grams: number): AskedWeight {
  void plan
  void grams
  throw new Error('not implemented')
}
