// Pure barcode logic (no React). Mirrors internal/barcode (Go); both are tested
// against internal/barcode/testdata/vectors.json. The phone uses it offline with
// the cached Products, Shop Barcodes and Weight Barcode Rules.

export type Format =
  | 'ean_13'
  | 'ean_8'
  | 'upc_a'
  | 'upc_e'
  | 'code_128'
  | 'qr_code'
  | 'data_matrix'
  | ''

export type Kind = 'gtin' | 'opaque' | 'not_product' | 'invalid'

export interface Scanned {
  kind: Kind
  /** GTIN-14 (zero padded) or opaque string */
  code?: string
  /** 13 digit form when code starts with 0; what Weight Barcode Rules read */
  ean13?: string
  /** invalid: empty | length | format | check_digit */
  reason?: string
}

export type ValueKind = 'weight' | 'price'

/** A run of digits in the 13 digit barcode; start is 1-based. */
export interface Span {
  start: number
  length: number
}

export interface WeightRule {
  id: number
  prefix: string
  item: Span
  value: Span
  valueKind: ValueKind
  /** value digits are divided by 10^decimalPlaces (unit: g or cents) */
  decimalPlaces: number
}

export interface Catalog {
  /** this Shop's Shop Barcodes: Scanned.code -> product id */
  shopBarcodes?: Record<string, number>
  weightRules?: WeightRule[]
  /** weightItemKey(ruleId, itemCode) -> product id */
  weightItems?: Record<string, number>
  /** product id -> last price per kg at this Shop (cents) */
  pricePerKgCents?: Record<string, number>
  /** Scanned.code -> product id */
  globalBarcodes?: Record<string, number>
}

export type Outcome =
  | 'product'
  | 'weighed'
  | 'ask_weight'
  | 'unknown_weighed_item'
  | 'unknown'
  | 'not_product'
  | 'invalid'

export type Source = 'shop_barcode' | 'weight_rule' | 'global'

/** Flat result; absent properties are simply not set (never undefined-valued zeros). */
export interface Resolution {
  outcome: Outcome
  via?: Source
  productId?: number
  code?: string
  ruleId?: number
  itemCode?: string
  weightGrams?: number
  priceCents?: number
  pricePerKgCents?: number
  /** invalid: parse reasons | zero_value */
  reason?: string
}

export function parse(_raw: string, _format: Format): Scanned {
  throw new Error('TODO')
}

/** Normalise a barcode typed or stored by a user (unknown format). */
export function canonical(_raw: string): string | null {
  throw new Error('TODO')
}

/** Returns a reason the rule cannot be used, or null when fine. */
export function validateRule(_rule: WeightRule): string | null {
  throw new Error('TODO')
}

export function weightItemKey(_ruleId: number, _itemCode: string): string {
  throw new Error('TODO')
}

/** Shop Barcode -> Weight Barcode Rules -> global -> unknown. */
export function resolve(_scanned: Scanned, _catalog: Catalog): Resolution {
  throw new Error('TODO')
}

export function weightFromPrice(
  _priceCents: number,
  _pricePerKgCents: number,
): { ok: true; grams: number } | { ok: false } {
  throw new Error('TODO')
}

export function pricePerKgFromWeight(
  _priceCents: number,
  _grams: number,
): { ok: true; pricePerKgCents: number } | { ok: false } {
  throw new Error('TODO')
}
