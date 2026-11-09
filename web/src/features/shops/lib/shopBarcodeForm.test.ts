import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import type { ShopRule } from '../types'
import { ruleSummary, shopBarcodeLabel, toShopBarcodeBody, validateShopBarcodeForm } from './shopBarcodeForm'

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
  it('describes a weighed barcode by its rule prefix', () => {
    expect(shopBarcodeLabel({ ruleId: 4, itemCode: '00123' }, [rule])).toBe('rule 21 · item 00123')
    expect(shopBarcodeLabel({ code: 'X1' }, [])).toBe('X1')
  })
  it('summarises a rule', () => {
    expect(ruleSummary(rule, 'USD')).toBe('21 · item 3-7 · value 8-12 · weight in kg, 3 decimals')
    expect(ruleSummary({ ...rule, valueKind: 'price', valueUnit: undefined }, 'USD')).toBe('21 · item 3-7 · value 8-12 · price in USD minor units')
  })
})
