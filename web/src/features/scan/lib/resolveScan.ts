// Turns a parsed scan into what the UI should do next, using only the cached offline data (so it works offline).
// Plain TypeScript, no React. Stubs until the Developer implements them.
import type { OfflineData, OfflineProduct } from '../types'
import { pricePerKgFromWeight, resolve, type Scanned } from './barcode'

export type ScanPlan =
  /** a Product (pack size, or the decoded weight) ready to become a Stock Lot */
  | { kind: 'known'; product: OfflineProduct; quantity: number; priceCents: number | null; pricePerKgCents?: number; weighed?: true }
  /** a price-valued Weight Barcode Rule with no price per kg yet: ask the weight once */
  | { kind: 'ask_weight'; product: OfflineProduct; priceCents: number }
  /** nothing matched: the full "what is this?" form for this canonical code */
  | { kind: 'unknown'; code: string }
  /** a Weight Barcode Rule matched but the item code is new: only Ingredient and Product name (and the weight when needsWeight) */
  | { kind: 'unknown_weighed'; ruleId: number; itemCode: string; weightGrams?: number; priceCents?: number; needsWeight: boolean }
  /** QR/DataMatrix that is not a GS1 Digital Link: toast "not a product code" */
  | { kind: 'not_product' }
  /** unreadable (bad check digit, wrong length, zero value) */
  | { kind: 'invalid'; reason: string }

const roundHalfUp = (x: number): number => Math.floor(x + 0.5)

/** The price per kg a Product's last pack Price implies (gram Products with a pack size only), or undefined. */
function derivedPricePerKg(product: OfflineProduct): number | undefined {
  if (product.lastPriceCents === null || product.baseUnit !== 'g' || !(product.packSize > 0)) return undefined
  const perKg = roundHalfUp((product.lastPriceCents * 1000) / product.packSize)
  return perKg >= 1 ? perKg : undefined
}

/**
 * What the weighed grams cost, mirroring product.PriceForWeight on the server: explicit price per kg x grams / 1000,
 * else the pack price x grams / pack size (gram Products only). Rounded half up once; null with no basis.
 */
function weightPrice(grams: number, explicitPerKg: number | undefined, product: OfflineProduct): number | null {
  let cents: number
  if (explicitPerKg !== undefined) {
    cents = (explicitPerKg * grams) / 1000
  } else if (product.lastPriceCents !== null && product.baseUnit === 'g' && product.packSize > 0) {
    cents = (product.lastPriceCents * grams) / product.packSize
  } else {
    return null
  }
  const r = roundHalfUp(cents)
  return r >= 1 ? r : null
}

/**
 * Resolves with barcode.resolve against offline.catalog and looks the Product up in offline.products.
 * known: quantity = pack size; priceCents = the Product's lastPriceCents (null when none). A weighed Product:
 * quantity = decoded grams; pricePerKgCents from the catalog; priceCents = the decoded price (price rule) or
 * round(pricePerKg x grams / 1000) (weight rule), null when neither is known.
 * A resolved Product that is missing from offline.products is treated as unknown.
 */
export function planScan(scanned: Scanned, offline: OfflineData): ScanPlan {
  const r = resolve(scanned, offline.catalog)
  const unknown: ScanPlan = { kind: 'unknown', code: r.code ?? scanned.code ?? '' }
  switch (r.outcome) {
    case 'product': {
      const product = offline.products.find((p) => p.id === r.productId)
      if (!product) return unknown
      return { kind: 'known', product, quantity: product.packSize, priceCents: product.lastPriceCents }
    }
    case 'weighed': {
      const product = offline.products.find((p) => p.id === r.productId)
      if (!product || r.weightGrams === undefined) return unknown
      const explicit = r.pricePerKgCents ?? offline.catalog.pricePerKgCents?.[String(product.id)]
      const derived = explicit === undefined ? derivedPricePerKg(product) : undefined
      const pricePerKg = explicit ?? derived
      const priceCents = r.priceCents ?? weightPrice(r.weightGrams, explicit, product)
      return {
        kind: 'known',
        product,
        quantity: r.weightGrams,
        priceCents,
        weighed: true,
        ...(pricePerKg !== undefined ? { pricePerKgCents: pricePerKg } : {}),
      }
    }
    case 'ask_weight': {
      const product = offline.products.find((p) => p.id === r.productId)
      if (!product || r.priceCents === undefined) return unknown
      return { kind: 'ask_weight', product, priceCents: r.priceCents }
    }
    case 'unknown_weighed_product': {
      const plan: ScanPlan = {
        kind: 'unknown_weighed',
        ruleId: r.ruleId ?? 0,
        itemCode: r.itemCode ?? '',
        needsWeight: r.weightGrams === undefined,
      }
      if (r.weightGrams !== undefined) plan.weightGrams = r.weightGrams
      if (r.priceCents !== undefined) plan.priceCents = r.priceCents
      return plan
    }
    case 'not_product':
      return { kind: 'not_product' }
    case 'invalid':
      return { kind: 'invalid', reason: r.reason ?? 'invalid' }
    default:
      return unknown
  }
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
  const perKg = pricePerKgFromWeight(plan.priceCents, grams)
  if (!perKg.ok) throw new Error('the weight must be above 0')
  return { quantity: grams, priceCents: plan.priceCents, pricePerKgCents: perKg.pricePerKgCents }
}
