import { describe, expect, it } from 'vitest'
import { strings } from '../strings'
import { toNewProduct, validateProductForm } from './productForm'

const ok = { name: 'Mutti passata 700 g', packSize: '700', barcode: '' }

describe('validateProductForm', () => {
  it('accepts a good form, with or without a barcode', () => {
    expect(validateProductForm(ok)).toEqual({})
    expect(validateProductForm({ ...ok, barcode: '8001234567897' })).toEqual({})
  })
  it('needs a name of at most 100 characters', () => {
    expect(validateProductForm({ ...ok, name: '   ' }).name).toBe(strings.errNameRequired)
    expect(validateProductForm({ ...ok, name: 'x'.repeat(101) }).name).toBe(strings.errNameTooLong)
    expect(validateProductForm({ ...ok, name: 'x'.repeat(100) }).name).toBeUndefined()
  })
  it.each(['', '0', '-5', 'abc', '1e', '7 00'])('rejects pack size %j', (packSize) => {
    expect(validateProductForm({ ...ok, packSize }).packSize).toBe(strings.errPackSize)
  })
  it.each(['0.5', '12,5', ' 700 '])('accepts pack size %j', (packSize) => {
    expect(validateProductForm({ ...ok, packSize }).packSize).toBeUndefined()
  })
  it('rejects an unreadable barcode (bad check digit)', () => {
    expect(validateProductForm({ ...ok, barcode: '8001234567890' }).barcode).toBe(strings.errBarcode)
  })
})

describe('toNewProduct', () => {
  it('builds the request body', () => {
    expect(toNewProduct({ name: '  Mutti   passata ', packSize: '700', barcode: ' 8001234567897 ' }, 3)).toEqual({
      name: 'Mutti passata',
      ingredientId: 3,
      packSize: 700,
      barcodes: ['8001234567897'],
    })
  })
  it('has no barcodes when none was typed, and reads a decimal comma', () => {
    expect(toNewProduct({ name: 'Eggs', packSize: '12,5', barcode: '' }, 9)).toEqual({
      name: 'Eggs',
      ingredientId: 9,
      packSize: 12.5,
      barcodes: [],
    })
  })
})
