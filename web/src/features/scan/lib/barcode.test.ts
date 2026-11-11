import { describe, expect, it } from 'vitest'
// Shared with the Go suite (internal/barcode/barcode_test.go).
import rawVectors from '../../../../../internal/barcode/testdata/vectors.json'
import {
  canonical,
  parse,
  pricePerKgFromWeight,
  resolve,
  validateRule,
  ruleProblem,
  weightFromPrice,
  weightProductKey,
  type Catalog,
  type Format,
  type Resolution,
  type Scanned,
  type WeightRule,
} from './barcode'

interface Vectors {
  normalise: { name: string; raw: string; format: Format; expect: Scanned }[]
  rules: { name: string; rule: WeightRule; valid: boolean }[]
  catalogs: Record<string, Catalog>
  resolve: {
    name: string
    catalog: string
    raw: string
    format: Format
    expect: Resolution
  }[]
  price: {
    fromWeight: {
      priceCents: number
      grams: number
      expect: { ok: boolean; pricePerKgCents?: number }
    }[]
    weightFromPrice: {
      priceCents: number
      pricePerKgCents: number
      expect: { ok: boolean; grams?: number }
    }[]
  }
}
const v = rawVectors as unknown as Vectors

describe('parse (shared vectors)', () => {
  it.each(v.normalise)('$name', ({ raw, format, expect: want }) => {
    expect(parse(raw, format)).toEqual(want)
  })
})

describe('canonical', () => {
  it.each([
    ['4006381333931', '04006381333931'],
    [' 036000291452 ', '00036000291452'],
    ['SHOP-42', 'SHOP-42'],
    ['4006381333932', null],
    ['', null],
  ])('%j -> %j', (raw, want) => {
    expect(canonical(raw)).toBe(want)
  })
})

describe('validateRule (shared vectors)', () => {
  it.each(v.rules)('$name', ({ rule, valid }) => {
    if (valid) expect(validateRule(rule)).toBeNull()
    else expect(validateRule(rule)).not.toBeNull()
  })
})

describe('ruleProblem (the field a rule problem is about)', () => {
  const ok = { id: 0, prefix: '21', item: { start: 3, length: 4 }, value: { start: 7, length: 5 }, valueKind: 'weight', valueUnit: 'g', decimalPlaces: 3 } as const
  it('is null for a valid rule', () => expect(ruleProblem(ok)).toBeNull())
  it.each([
    ['prefix', { prefix: '' }, 'prefix'],
    ['item start inside prefix', { item: { start: 2, length: 2 } }, 'itemStart'],
    ['value start inside prefix', { value: { start: 2, length: 2 } }, 'valueStart'],
    ['item span reaching the check digit', { item: { start: 3, length: 11 } }, 'itemLength'],
    ['value span reaching the check digit', { value: { start: 7, length: 7 } }, 'valueLength'],
    ['item start past the digits', { item: { start: 13, length: 1 } }, 'itemStart'],
    ['zero item length', { item: { start: 3, length: 0 } }, 'itemLength'],
    ['overlap', { value: { start: 5, length: 3 } }, 'valueStart'],
    ['decimals', { decimalPlaces: 9 }, 'decimalPlaces'],
  ])('%s', (_n, over, field) => {
    expect(ruleProblem({ ...ok, ...over } as never)?.field).toBe(field)
  })
  it('validateRule keeps returning the message', () => {
    expect(validateRule({ ...ok, decimalPlaces: 9 })).toBe(ruleProblem({ ...ok, decimalPlaces: 9 })?.message)
  })
})

describe('weightProductKey', () => {
  it('joins rule id and item code', () => {
    expect(weightProductKey(2, '54321')).toBe('2:54321')
  })
})

describe('resolve (shared vectors)', () => {
  it.each(v.resolve)('$name', ({ catalog, raw, format, expect: want }) => {
    const cat = v.catalogs[catalog]
    expect(cat).toBeDefined()
    expect(resolve(parse(raw, format), cat as Catalog)).toEqual(want)
  })
})

describe('price helpers (shared vectors)', () => {
  it.each(v.price.fromWeight)('pricePerKgFromWeight($priceCents, $grams)', (c) => {
    const got = pricePerKgFromWeight(c.priceCents, c.grams)
    expect(got.ok).toBe(c.expect.ok)
    if (got.ok) expect(got.pricePerKgCents).toBe(c.expect.pricePerKgCents)
  })
  it.each(v.price.weightFromPrice)('weightFromPrice($priceCents, $pricePerKgCents)', (c) => {
    const got = weightFromPrice(c.priceCents, c.pricePerKgCents)
    expect(got.ok).toBe(c.expect.ok)
    if (got.ok) expect(got.grams).toBe(c.expect.grams)
  })
})

describe('ask_weight round trip', () => {
  it('a weight given once makes the next price-valued scan resolvable', () => {
    const cat = structuredClone(v.catalogs['shopA'] as Catalog)
    const first = resolve(parse('2299999005006', 'ean_13'), cat)
    expect(first.outcome).toBe('ask_weight')
    const ppk = pricePerKgFromWeight(first.priceCents ?? 0, 400) // 500 cents for 400 g
    expect(ppk).toEqual({ ok: true, pricePerKgCents: 1250 })
    cat.pricePerKgCents = { [String(first.productId)]: 1250 }
    const again = resolve(parse('2299999005006', 'ean_13'), cat)
    expect(again.outcome).toBe('weighed')
    expect(again.weightGrams).toBe(400)
    expect(again.pricePerKgCents).toBe(1250)
  })
})
