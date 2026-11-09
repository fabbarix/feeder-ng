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

/**
 * Unit of a rule's value. Weight rules: g (default), kg, oz, lb. Price rules:
 * omitted, meaning the household currency's minor unit (cents for USD).
 * Resolutions are always in grams and cents.
 */
export type ValueUnit = 'g' | 'kg' | 'oz' | 'lb'

export interface WeightRule {
  id: number
  prefix: string
  item: Span
  value: Span
  valueKind: ValueKind
  /** omitted: g (weight) or the minor currency unit (price) */
  valueUnit?: ValueUnit
  /** value digits are divided by 10^decimalPlaces, in valueUnit */
  decimalPlaces: number
}

export interface Catalog {
  /** this Shop's Shop Barcodes: Scanned.code -> product id */
  shopBarcodes?: Record<string, number>
  weightRules?: WeightRule[]
  /** weightProductKey(ruleId, itemCode) -> product id */
  weightProducts?: Record<string, number>
  /** product id -> last price per kg at this Shop (cents) */
  pricePerKgCents?: Record<string, number>
  /** Scanned.code -> product id */
  globalBarcodes?: Record<string, number>
}

export type Outcome =
  | 'product'
  | 'weighed'
  | 'ask_weight'
  | 'unknown_weighed_product'
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
  /** grams, rounded to the mg */
  weightGrams?: number
  priceCents?: number
  pricePerKgCents?: number
  /** invalid: parse reasons | zero_value */
  reason?: string
}

const WEIGHT_UNITS: readonly string[] = ['g', 'kg', 'oz', 'lb']

/** Normalise a raw scan. See docs/dev/design/t5-barcode.md for the rules. */
export function parse(raw: string, format: Format): Scanned {
  const s = raw.trim()
  if (s === '') return invalid('empty')
  switch (format) {
    case 'ean_13':
      return gtinOfLength(s, 13)
    case 'ean_8':
      return gtinOfLength(s, 8)
    case 'upc_a':
      return gtinOfLength(s, 12)
    case 'upc_e':
      return upcE(s)
    case 'code_128':
      return { kind: 'opaque', code: s }
    case 'qr_code':
    case 'data_matrix':
      return digitalLink(s)
    case '':
      return unknownFormat(s)
    default:
      return { kind: 'not_product' }
  }
}

/** Normalise a barcode typed or stored by a user (unknown format). */
export function canonical(raw: string): string | null {
  const s = parse(raw, '')
  return s.kind === 'gtin' || s.kind === 'opaque' ? (s.code ?? null) : null
}

/** Returns a reason the rule cannot be used, or null when fine. */
export function validateRule(rule: WeightRule): string | null {
  if (!isDigits(rule.prefix)) return 'prefix must be one or more digits'
  if (rule.valueKind === 'weight') {
    if (rule.valueUnit !== undefined && !WEIGHT_UNITS.includes(rule.valueUnit)) {
      return `unknown weight unit ${String(rule.valueUnit)}`
    }
  } else if (rule.valueKind === 'price') {
    if (rule.valueUnit !== undefined) return 'a price rule has no value unit'
  } else {
    return 'unknown value kind'
  }
  const spanError = validSpan(rule.item) ?? validSpan(rule.value)
  if (spanError !== null) return spanError
  if (rule.item.start <= rule.prefix.length) return 'item starts inside the prefix'
  if (rule.value.start <= rule.prefix.length) return 'value starts inside the prefix'
  if (rule.item.start <= lastDigit(rule.value) && rule.value.start <= lastDigit(rule.item)) {
    return 'item and value overlap'
  }
  if (rule.decimalPlaces < 0 || rule.decimalPlaces > rule.value.length) {
    return 'decimal places must be between 0 and the value length'
  }
  return null
}

export function weightProductKey(ruleId: number, itemCode: string): string {
  return `${ruleId}:${itemCode}`
}

/** Shop Barcode -> Weight Barcode Rules -> global -> unknown. */
export function resolve(scanned: Scanned, catalog: Catalog): Resolution {
  if (scanned.kind === 'not_product') return { outcome: 'not_product' }
  if (scanned.kind === 'invalid') return { outcome: 'invalid', reason: scanned.reason ?? '' }
  const code = scanned.code ?? ''

  const shopId = lookup(catalog.shopBarcodes, code)
  if (shopId !== undefined) return { outcome: 'product', via: 'shop_barcode', productId: shopId, code }

  let unknown: Resolution | undefined
  const ean13 = scanned.ean13
  if (ean13 !== undefined) {
    for (const rule of rulesLongestPrefixFirst(catalog.weightRules ?? [])) {
      if (validateRule(rule) !== null || !ean13.startsWith(rule.prefix)) continue
      const value = Number(sliceSpan(ean13, rule.value))
      if (value === 0) {
        // a shorter rule's zero value does not override the unknown Product of a longer rule
        if (unknown !== undefined) continue
        return { outcome: 'invalid', reason: 'zero_value', code }
      }
      const itemCode = sliceSpan(ean13, rule.item)
      const productId = lookup(catalog.weightProducts, weightProductKey(rule.id, itemCode))
      if (productId === undefined) {
        unknown ??= unknownProduct(code, rule, itemCode, value)
        continue
      }
      return matchedProduct(code, rule, itemCode, productId, value, catalog)
    }
  }

  const globalId = lookup(catalog.globalBarcodes, code)
  if (globalId !== undefined) return { outcome: 'product', via: 'global', productId: globalId, code }
  if (unknown !== undefined) return unknown
  return { outcome: 'unknown', code }
}

export function weightFromPrice(
  priceCents: number,
  pricePerKgCents: number,
): { ok: true; grams: number } | { ok: false } {
  if (priceCents <= 0 || pricePerKgCents <= 0) return { ok: false }
  // round half up of priceCents * 1000 / pricePerKgCents, in integers
  return { ok: true, grams: Math.floor((2 * priceCents * 1000 + pricePerKgCents) / (2 * pricePerKgCents)) }
}

export function pricePerKgFromWeight(
  priceCents: number,
  grams: number,
): { ok: true; pricePerKgCents: number } | { ok: false } {
  if (priceCents <= 0 || grams <= 0) return { ok: false }
  return { ok: true, pricePerKgCents: Math.round((priceCents * 1000) / grams) }
}

// ---- resolution helpers -------------------------------------------------

function matchedProduct(
  code: string,
  rule: WeightRule,
  itemCode: string,
  productId: number,
  value: number,
  catalog: Catalog,
): Resolution {
  const base: Resolution = { outcome: 'weighed', via: 'weight_rule', productId, code, ruleId: rule.id, itemCode }
  if (rule.valueKind === 'weight') return { ...base, weightGrams: weightGrams(value, rule) }
  const cents = priceCents(value, rule.decimalPlaces)
  const ppk = lookup(catalog.pricePerKgCents, String(productId))
  if (ppk === undefined || ppk <= 0) {
    return { outcome: 'ask_weight', via: 'weight_rule', productId, code, ruleId: rule.id, itemCode, priceCents: cents }
  }
  const derived = weightFromPrice(cents, ppk)
  const grams = derived.ok ? derived.grams : 0
  return { ...base, priceCents: cents, pricePerKgCents: ppk, weightGrams: grams }
}

function unknownProduct(code: string, rule: WeightRule, itemCode: string, value: number): Resolution {
  const base: Resolution = { outcome: 'unknown_weighed_product', code, ruleId: rule.id, itemCode }
  if (rule.valueKind === 'weight') return { ...base, weightGrams: weightGrams(value, rule) }
  return { ...base, priceCents: priceCents(value, rule.decimalPlaces) }
}

/** Longest prefix first; equal prefixes keep their order (Array sort is stable). */
function rulesLongestPrefixFirst(rules: readonly WeightRule[]): WeightRule[] {
  return rules.slice().sort((a, b) => b.prefix.length - a.prefix.length)
}

/** Weight in grams: value / 10^decimalPlaces in the rule's unit, rounded to the mg. */
function weightGrams(value: number, rule: WeightRule): number {
  return roundMilligram((value / pow10(rule.decimalPlaces)) * unitGrams(rule.valueUnit))
}

/** Price in cents: value / 10^decimalPlaces, rounded half up. */
function priceCents(value: number, decimalPlaces: number): number {
  const p = pow10(decimalPlaces)
  return Math.floor((2 * value + p) / (2 * p))
}

function unitGrams(unit: ValueUnit | undefined): number {
  switch (unit) {
    case 'kg':
      return 1000
    case 'oz':
      return 28.349523125
    case 'lb':
      return 453.59237
    default:
      return 1
  }
}

function pow10(n: number): number {
  let p = 1
  for (let i = 0; i < n; i++) p *= 10
  return p
}

function roundMilligram(g: number): number {
  return Math.round(g * 1000) / 1000
}

/** Reason a span is unusable, or null. */
function validSpan(span: Span): string | null {
  if (span.start < 1 || span.length < 1) return 'span must start at 1 or later and have a length of at least 1'
  if (lastDigit(span) > 12) return 'span reaches the check digit or beyond'
  return null
}

/** 1-based position of the last digit of a span. */
function lastDigit(span: Span): number {
  return span.start + span.length - 1
}

function sliceSpan(digits: string, span: Span): string {
  return digits.slice(span.start - 1, lastDigit(span))
}

function lookup<T>(record: Record<string, T> | undefined, key: string): T | undefined {
  return record !== undefined && Object.hasOwn(record, key) ? record[key] : undefined
}

// ---- parsing helpers ----------------------------------------------------

function invalid(reason: string): Scanned {
  return { kind: 'invalid', reason }
}

function gtinOfLength(s: string, length: number): Scanned {
  if (!isDigits(s)) return invalid('format')
  if (s.length !== length) return invalid('length')
  return gtin(s)
}

/** Checks the check digit of a digit string and returns the GTIN-14. */
function gtin(digits: string): Scanned {
  if (!checkDigitOk(digits)) return invalid('check_digit')
  return gtinResult(digits)
}

function gtinResult(digits: string): Scanned {
  const code = digits.padStart(14, '0')
  return code.startsWith('0') ? { kind: 'gtin', code, ean13: code.slice(1) } : { kind: 'gtin', code }
}

function upcE(s: string): Scanned {
  if (!isDigits(s)) return invalid('format')
  if (s.length !== 8) return invalid('length')
  if (s[0] !== '0' && s[0] !== '1') return invalid('format')
  const upca = expandUpcE(s)
  return upca === null ? invalid('check_digit') : gtinResult(upca)
}

/**
 * Expands an 8 digit UPC-E (number system, six digits, check digit) to its
 * 12 digit UPC-A. Returns null when the UPC-E check digit does not match.
 */
function expandUpcE(s: string): string | null {
  const ns = s.slice(0, 1)
  const x = s.slice(1, 7)
  const check = s.charCodeAt(7) - 48
  const last = x.slice(5, 6)
  let mfr: string
  let item: string
  switch (last) {
    case '0':
    case '1':
    case '2':
      mfr = x.slice(0, 2) + last + '00'
      item = '00' + x.slice(2, 5)
      break
    case '3':
      mfr = x.slice(0, 3) + '00'
      item = '000' + x.slice(3, 5)
      break
    case '4':
      mfr = x.slice(0, 4) + '0'
      item = '0000' + x.slice(4, 5)
      break
    default:
      mfr = x.slice(0, 5)
      item = '0000' + last
  }
  const body = ns + mfr + item
  const c = checkDigit(body)
  return c === check ? body + String(c) : null
}

function unknownFormat(s: string): Scanned {
  if (afterHttpScheme(s) !== null) return digitalLink(s)
  if (!isDigits(s)) return { kind: 'opaque', code: s }
  switch (s.length) {
    case 12:
    case 13:
    case 14:
      return gtin(s)
    case 8: {
      if (checkDigitOk(s)) return gtinResult(s)
      if (s[0] === '0' || s[0] === '1') {
        const upca = expandUpcE(s)
        if (upca !== null) return gtinResult(upca)
      }
      return invalid('check_digit')
    }
    default:
      return { kind: 'opaque', code: s }
  }
}

/** QR and DataMatrix: only a GS1 Digital Link URL carries a product code. */
function digitalLink(s: string): Scanned {
  const digits = digitalLinkGtin(s)
  return digits === null ? { kind: 'not_product' } : gtin(digits)
}

/**
 * The key digits after the first "01" path segment of an http(s) URL that is
 * followed by a segment of 8, 12, 13 or 14 digits, or null. The query and
 * fragment are ignored, one trailing slash is allowed, and every path segment is
 * percent-decoded first; a malformed escape gives null.
 */
function digitalLinkGtin(s: string): string | null {
  const rest = afterHttpScheme(s)
  if (rest === null) return null
  const cut = rest.search(/[?#]/)
  const path = cut < 0 ? rest : rest.slice(0, cut)
  const slash = path.indexOf('/')
  if (slash < 0) return null
  const segs = path.slice(slash + 1).split('/')
  if (segs.length > 0 && segs[segs.length - 1] === '') segs.pop()
  const decoded: string[] = []
  for (const seg of segs) {
    const d = percentDecode(seg)
    if (d === null) return null
    decoded.push(d)
  }
  for (let j = 0; j + 1 < decoded.length; j++) {
    const key = decoded[j + 1] ?? ''
    if (decoded[j] === '01' && isGtinKey(key)) return key
  }
  return null
}

/** GTIN-8, -12, -13 or -14 digits. */
function isGtinKey(s: string): boolean {
  return [8, 12, 13, 14].includes(s.length) && isDigits(s)
}

/** Decodes the %XX escapes of a path segment; null for a malformed escape. */
function percentDecode(s: string): string | null {
  let out = ''
  for (let i = 0; i < s.length; i++) {
    const c = s.charAt(i)
    if (c !== '%') {
      out += c
      continue
    }
    const hex = s.slice(i + 1, i + 3)
    if (!/^[0-9A-Fa-f]{2}$/.test(hex)) return null
    out += String.fromCharCode(parseInt(hex, 16))
    i += 2
  }
  return out
}

/** What follows an http:// or https:// prefix (ASCII case-insensitive), or null. */
function afterHttpScheme(s: string): string | null {
  const m = /^https?:\/\//i.exec(s)
  return m === null ? null : s.slice(m[0].length)
}

/** GS1 mod-10 check digit of a body: weights 3 and 1 counted from its right. */
function checkDigit(body: string): number {
  let sum = 0
  for (let i = 0; i < body.length; i++) {
    const w = (body.length - 1 - i) % 2 === 1 ? 1 : 3
    sum += (body.charCodeAt(i) - 48) * w
  }
  return (10 - (sum % 10)) % 10
}

function checkDigitOk(d: string): boolean {
  return checkDigit(d.slice(0, -1)) === d.charCodeAt(d.length - 1) - 48
}

function isDigits(s: string): boolean {
  return /^[0-9]+$/.test(s)
}
