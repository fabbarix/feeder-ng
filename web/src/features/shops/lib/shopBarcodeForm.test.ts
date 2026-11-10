import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import { ruleSummary, shopBarcodeLabel, weighedBarcodeLabel, toShopBarcodeBody, validateShopBarcodeForm } from './shopBarcodeForm'

const rule: ShopRule = { id: 4, shopId: 1, prefix: '21', item: { start: 3, length: 5 }, value: { start: 8, length: 5 }, valueKind: 'weight', valueUnit: 'kg', decimalPlaces: 3 }
const plain = { productId: 2, code: 'PRIVATE-77', ruleId: null, itemCode: '' }

describe('validateShopBarcodeForm', () => {
  it('accepts a plain code and a weighed item code', () => {
    expect(validateShopBarcodeForm(plain, [rule])).toEqual({})
    expect(validateShopBarcodeForm({ ...plain, ruleId: 4, itemCode: '00123' }, [rule])).toEqual({})
  })
  it('needs a Product', () => {
    expect(validateShopBarcodeForm({ ...plain, productId: null }, []).productId).toBe(strings.chooseProduct)
  })
  it('rejects an empty code and a wrong-length item code', () => {
    expect(validateShopBarcodeForm({ ...plain, code: ' ' }, []).code).toBe(strings.errBarcode)
    expect(validateShopBarcodeForm({ ...plain, ruleId: 4, itemCode: '123' }, [rule]).itemCode).toBe(strings.errItemCode(5))
  })
})

describe('toShopBarcodeBody', () => {
  it('builds either body', () => {
    expect(toShopBarcodeBody(plain)).toEqual({ productId: 2, code: 'PRIVATE-77' })
    expect(toShopBarcodeBody({ ...plain, ruleId: 4, itemCode: '00123' })).toEqual({ productId: 2, ruleId: 4, itemCode: '00123' })
  })
})

describe('labels', () => {
  it('never shows a rule id: the label names the prefix the barcode starts with (QA "rule 1" vs "rule 21")', () => {
    const label = shopBarcodeLabel({ ruleId: 4, itemCode: '00123' }, [rule])
    expect(label).not.toMatch(/\b4\b/)
    expect(weighedBarcodeLabel('21', '00123')).toBe('Weighed · prefix 21 · item 00123')
  })

  it('leaves the prefix out when the rule is unknown (a deleted rule), never printing its id', () => {
    expect(weighedBarcodeLabel(undefined, '00123')).toBe('Weighed · item 00123')
    expect(shopBarcodeLabel({ ruleId: 99, itemCode: '00123' }, [rule])).toBe('Weighed · item 00123')
  })

  it('describes a weighed barcode by its rule prefix', () => {
    expect(shopBarcodeLabel({ ruleId: 4, itemCode: '00123' }, [rule])).toBe('Weighed · prefix 21 · item 00123')
    expect(shopBarcodeLabel({ code: 'X1' }, [])).toBe('X1')
  })
  it('summarises a rule', () => {
    expect(ruleSummary(rule, 'USD')).toBe('prefix 21 · item digits 3-7 · value digits 8-12 · weight in kg, 3 decimals')
    expect(ruleSummary({ ...rule, valueKind: 'price', valueUnit: undefined }, 'USD')).toBe('prefix 21 · item digits 3-7 · value digits 8-12 · price in USD minor units')
  })
})
