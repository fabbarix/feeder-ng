import { describe, expect, it } from 'vitest'
import type { OfflineData, OfflineProduct } from '../types'
import { parse } from './barcode'
import { applyAskedWeight, planScan } from './resolveScan'

const product = (id: number, name: string, size: number, last: number | null, ingredientName = name): OfflineProduct => ({
  id,
  name,
  ingredientId: id + 100,
  ingredientName,
  baseUnit: 'g',
  packSize: size,
  lastPriceCents: last,
})

function offline(over: Partial<OfflineData['catalog']> = {}): OfflineData {
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
    const plan = planScan(ean('8000500310427'), offline())
    expect(plan).toMatchObject({ kind: 'known', quantity: 700, priceCents: 159 })
    expect(plan.kind === 'known' && plan.product.id).toBe(7)
  })

  it('a Product never bought has no price to prefill', () => {
    expect(planScan(ean('4000000000013'), offline())).toMatchObject({ kind: 'known', quantity: 1000, priceCents: null })
  })

  it('a weight-valued Weight Barcode Rule gives the decoded weight and a price from the price per kg', () => {
    expect(planScan(ean('2100005007504'), offline())).toMatchObject({ kind: 'known', quantity: 750, priceCents: 300, pricePerKgCents: 400 })
  })

  it('a weighed Product without a price per kg has no price', () => {
    expect(planScan(ean('2100005007504'), offline({ pricePerKgCents: {} }))).toMatchObject({ kind: 'known', quantity: 750, priceCents: null })
  })

  it('a price-valued rule without a price per kg asks for the weight once', () => {
    expect(planScan(ean('2200007002504'), offline())).toMatchObject({ kind: 'ask_weight', priceCents: 250 })
  })

  it('a price-valued rule with a price per kg decodes the weight', () => {
    // 200 cents at 500 cents/kg is 400 g
    expect(planScan(ean('2200007002009'), offline({ pricePerKgCents: { '21': 500 } }))).toMatchObject({
      kind: 'known',
      quantity: 400,
      priceCents: 200,
      pricePerKgCents: 500,
    })
  })

  it('a rule that matches an unknown item code asks only for the Ingredient and the Product name', () => {
    expect(planScan(ean('2100009005001'), offline())).toEqual({ kind: 'unknown_weighed', ruleId: 3, itemCode: '00009', weightGrams: 500, needsWeight: false })
  })

  it('an unknown item code on a price-valued rule also needs the weight', () => {
    expect(planScan(ean('2200009003004'), offline())).toEqual({ kind: 'unknown_weighed', ruleId: 4, itemCode: '00009', priceCents: 300, needsWeight: true })
  })

  it('a barcode nobody knows asks the full form for its canonical code', () => {
    expect(planScan(ean('5012345678900'), offline())).toEqual({ kind: 'unknown', code: '05012345678900' })
  })

  it('a resolved Product missing from the cached Products is treated as unknown', () => {
    expect(planScan(ean('8000500310427'), { ...offline(), products: [] })).toEqual({ kind: 'unknown', code: '08000500310427' })
  })

  it('QR content that is not a GS1 Digital Link is not a product code', () => {
    expect(planScan(parse('https://example.com/menu', 'qr_code'), offline())).toEqual({ kind: 'not_product' })
  })

  it('a GS1 Digital Link QR resolves like the EAN', () => {
    expect(planScan(parse('https://id.gs1.org/01/08000500310427', 'qr_code'), offline())).toMatchObject({ kind: 'known', quantity: 700 })
  })

  it('a bad check digit is invalid, never silently unknown', () => {
    expect(planScan(ean('8000500310428'), offline())).toEqual({ kind: 'invalid', reason: 'check_digit' })
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

// r3-scan-fixes B5: weight-valued barcodes are priced by weight; the pack Price is only the basis for a price per kg.
describe('planScan: a weighed barcode costs weight x price per kg', () => {
  // Rule 21 Product: 1 kg pack last sold at 8.99, no explicit price per kg
  const rule21Product = (over: Partial<OfflineProduct> = {}) => ({ ...product(22, 'Rule 21 Product', 1000, 899, 'carrots'), ...over })
  const data = (products: OfflineProduct[], catalog: Partial<OfflineData['catalog']> = {}) => {
    const o = offline({ weightProducts: { '3:12345': 22 }, pricePerKgCents: {}, ...catalog })
    return { ...o, products: [...o.products, ...products] }
  }

  it('850 g of a 1 kg Product at 8.99 is 7.64, with 8.99 per kg derived and the weighed flag', () => {
    const plan = planScan(ean('2112345008509'), data([rule21Product()]))
    expect(plan).toMatchObject({ kind: 'known', quantity: 850, priceCents: 764, pricePerKgCents: 899, weighed: true })
  })

  it('450 g is 4.05 (404.55 rounds half up)', () => {
    const plan = planScan(ean('2112345004501'), data([rule21Product()]))
    expect(plan).toMatchObject({ kind: 'known', quantity: 450, priceCents: 405 })
  })

  it('derives the price per kg from a pack that is not 1 kg: 500 g at 3.00, 450 g is 2.70', () => {
    const plan = planScan(ean('2112345004501'), data([rule21Product({ packSize: 500, lastPriceCents: 300 })]))
    expect(plan).toMatchObject({ priceCents: 270, pricePerKgCents: 600 })
  })

  it('an explicit price per kg in the catalog wins over the pack price', () => {
    const plan = planScan(ean('2112345008509'), data([rule21Product()], { pricePerKgCents: { '22': 1000 } }))
    expect(plan).toMatchObject({ priceCents: 850, pricePerKgCents: 1000 })
  })

  it('no price known: no price and no price per kg (the server then records nothing)', () => {
    const plan = planScan(ean('2112345008509'), data([rule21Product({ lastPriceCents: null })]))
    expect(plan).toMatchObject({ kind: 'known', quantity: 850, priceCents: null, weighed: true })
    expect(plan).not.toHaveProperty('pricePerKgCents')
  })

  it('a pack price on a millilitre Product is no basis for a weight price', () => {
    const plan = planScan(ean('2112345008509'), data([rule21Product({ baseUnit: 'ml' })]))
    expect(plan).toMatchObject({ priceCents: null })
  })

  it('a price-valued barcode keeps the price it carries and is flagged weighed', () => {
    const plan = planScan(ean('2200007002009'), offline({ pricePerKgCents: { '21': 500 } }))
    expect(plan).toMatchObject({ kind: 'known', quantity: 400, priceCents: 200, pricePerKgCents: 500, weighed: true })
  })

  it('a pack barcode is not weighed', () => {
    const plan = planScan(ean('8000500310427'), offline())
    expect(plan).toMatchObject({ kind: 'known', quantity: 700, priceCents: 159 })
    expect(plan).not.toHaveProperty('weighed')
  })
})
