import { describe, expect, it } from 'vitest'
import type { Bundle, BundleProduct } from '../types'
import { parse } from './barcode'
import { applyAskedWeight, planScan } from './resolveScan'

const product = (id: number, name: string, size: number, last: number | null, ingredientName = name): BundleProduct => ({
  id,
  name,
  ingredientId: id + 100,
  ingredientName,
  baseUnit: 'g',
  packSize: size,
  lastPriceCents: last,
})

function bundle(over: Partial<Bundle['catalog']> = {}): Bundle {
  return {
    shopId: 1,
    shopName: 'Coop',
    products: [product(7, 'Mutti passata 700 g', 700, 159, 'passata'), product(8, 'Milk', 1000, null), product(20, 'Loose carrots', 1000, null), product(21, 'Loose cheese', 1000, null)],
    catalog: {
      globalBarcodes: { '08000500310427': 7, '04000000000013': 8 },
      shopBarcodes: {},
      weightRules: [
        { id: 3, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'g', decimalPlaces: 0 },
        { id: 4, prefix: '22', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'price', decimalPlaces: 0 },
      ],
      weightProducts: { '3:00005': 20, '4:00007': 21 },
      pricePerKgCents: { '20': 400 },
      ...over,
    },
  }
}

const ean = (code: string) => parse(code, 'ean_13')

describe('planScan', () => {
  it('a global barcode is a known Product with its pack size and last price', () => {
    const plan = planScan(ean('8000500310427'), bundle())
    expect(plan).toMatchObject({ kind: 'known', quantity: 700, priceCents: 159 })
    expect(plan.kind === 'known' && plan.product.id).toBe(7)
  })

  it('a Product never bought has no price to prefill', () => {
    expect(planScan(ean('4000000000013'), bundle())).toMatchObject({ kind: 'known', quantity: 1000, priceCents: null })
  })

  it('a weight-valued Weight Barcode Rule gives the decoded weight and a price from the price per kg', () => {
    expect(planScan(ean('2100005007504'), bundle())).toMatchObject({ kind: 'known', quantity: 750, priceCents: 300, pricePerKgCents: 400 })
  })

  it('a weighed Product without a price per kg has no price', () => {
    expect(planScan(ean('2100005007504'), bundle({ pricePerKgCents: {} }))).toMatchObject({ kind: 'known', quantity: 750, priceCents: null })
  })

  it('a price-valued rule without a price per kg asks for the weight once', () => {
    expect(planScan(ean('2200007002504'), bundle())).toMatchObject({ kind: 'ask_weight', priceCents: 250 })
  })

  it('a price-valued rule with a price per kg decodes the weight', () => {
    // 200 cents at 500 cents/kg is 400 g
    expect(planScan(ean('2200007002009'), bundle({ pricePerKgCents: { '21': 500 } }))).toMatchObject({
      kind: 'known',
      quantity: 400,
      priceCents: 200,
      pricePerKgCents: 500,
    })
  })

  it('a rule that matches an unknown item code asks only for the Ingredient and the Product name', () => {
    expect(planScan(ean('2100009005001'), bundle())).toEqual({ kind: 'unknown_weighed', ruleId: 3, itemCode: '00009', weightGrams: 500, needsWeight: false })
  })

  it('an unknown item code on a price-valued rule also needs the weight', () => {
    expect(planScan(ean('2200009003004'), bundle())).toEqual({ kind: 'unknown_weighed', ruleId: 4, itemCode: '00009', priceCents: 300, needsWeight: true })
  })

  it('a barcode nobody knows asks the full form for its canonical code', () => {
    expect(planScan(ean('5012345678900'), bundle())).toEqual({ kind: 'unknown', code: '05012345678900' })
  })

  it('a resolved Product missing from the cached Products is treated as unknown', () => {
    expect(planScan(ean('8000500310427'), { ...bundle(), products: [] })).toEqual({ kind: 'unknown', code: '08000500310427' })
  })

  it('QR content that is not a GS1 Digital Link is not a product code', () => {
    expect(planScan(parse('https://example.com/menu', 'qr_code'), bundle())).toEqual({ kind: 'not_product' })
  })

  it('a GS1 Digital Link QR resolves like the EAN', () => {
    expect(planScan(parse('https://id.gs1.org/01/08000500310427', 'qr_code'), bundle())).toMatchObject({ kind: 'known', quantity: 700 })
  })

  it('a bad check digit is invalid, never silently unknown', () => {
    expect(planScan(ean('8000500310428'), bundle())).toEqual({ kind: 'invalid', reason: 'check_digit' })
  })
})

describe('applyAskedWeight', () => {
  const ask = { kind: 'ask_weight', product: product(21, 'Loose cheese', 1000, null), priceCents: 250 } as const

  it('records the price per kg so the next scan decodes the weight', () => {
    expect(applyAskedWeight(ask, 500)).toEqual({ quantity: 500, priceCents: 250, pricePerKgCents: 500 })
  })

  it('rounds the price per kg half up', () => {
    expect(applyAskedWeight({ ...ask, priceCents: 3 }, 400).pricePerKgCents).toBe(8)
  })

  it('refuses a weight of zero or less', () => {
    expect(() => applyAskedWeight(ask, 0)).toThrow()
    expect(() => applyAskedWeight(ask, -5)).toThrow()
  })
})
