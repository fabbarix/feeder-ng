import { describe, expect, it } from 'vitest'
import { shopPageBarcodeRows } from './shopBarcodeRows'

const rules = [{ id: 4, prefix: '21' }] as never
const products = [{ id: 1, name: 'Mutti passata' }, { id: 2, name: 'Ham' }]

describe('shopPageBarcodeRows: the Shop page rows (R-E)', () => {
  it('a plain code: the Product, the code, "The Shop\'s own label"', () => {
    expect(shopPageBarcodeRows([{ id: 9, shopId: 1, productId: 1, code: 'PRIVATE-77' }] as never, rules, products)).toEqual([
      expect.objectContaining({ key: 'Mutti passata', state: 'PRIVATE-77', detail: "The Shop's own label", label: 'PRIVATE-77' }),
    ])
  })
  it('a weighed code: the item code as state, the rule as detail', () => {
    const [row] = shopPageBarcodeRows([{ id: 10, shopId: 1, productId: 2, ruleId: 4, itemCode: '00123' }] as never, rules, products)
    expect(row).toEqual(expect.objectContaining({ key: 'Ham', state: '00123', detail: 'Weight Barcode Rule 21' }))
    expect(row?.label).toBe('Weighed · prefix 21 · item 00123')
  })
  it('a Product not in the list reads "Unknown Product"', () => {
    expect(shopPageBarcodeRows([{ id: 9, shopId: 1, productId: 7, code: 'X' }] as never, rules, products)[0]?.key).toBe('Unknown Product')
  })
})
