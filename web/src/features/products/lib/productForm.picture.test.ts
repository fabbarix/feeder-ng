// PP: the Picture in the Product form's pure rules.
import { describe, expect, it } from 'vitest'
import { toNewProduct, validateProductForm } from './productForm'

const values = { name: 'Passata', packSize: '700', barcode: '' }
const pic = 'a'.repeat(32)

describe('toNewProduct: image', () => {
  it('carries the picture id', () => {
    expect(toNewProduct({ ...values, image: pic }, 3)).toEqual({ name: 'Passata', ingredientId: 3, packSize: 700, barcodes: [], image: pic })
  })
  it('leaves the key out when there is none, so the body of a Product without a picture is unchanged', () => {
    expect(toNewProduct(values, 3)).toEqual({ name: 'Passata', ingredientId: 3, packSize: 700, barcodes: [] })
    expect(toNewProduct({ ...values, image: '' }, 3)).not.toHaveProperty('image')
  })
})

describe('validateProductForm: image', () => {
  it('never complains about the picture: the ImagePicker validated it when it uploaded', () => {
    expect(validateProductForm({ ...values, image: pic })).toEqual({})
    expect(validateProductForm({ ...values, image: '' })).toEqual({})
  })
})
