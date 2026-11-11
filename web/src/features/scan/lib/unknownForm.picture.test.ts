// PP: the what-is-this form's Picture in the shop_unknown Op.
import { describe, expect, it } from 'vitest'
import { emptyForm, toUnknownOp, validateUnknownForm, type UnknownFormValues } from './unknownForm'

const pic = 'a'.repeat(32)
const meta = { clientUuid: 'u-1', scannedAt: '2026-11-09T12:00:00Z', shopId: 1 }
const pack: UnknownFormValues = { ...emptyForm(), ingredient: { id: 2, name: 'passata', baseUnit: 'g' }, packSize: '700', packUnit: 'g', productName: 'Mutti passata 700 g' }

describe('unknown form: Picture', () => {
  it('starts with no picture', () => {
    expect(emptyForm().image ?? '').toBe('')
  })

  it('puts the picture id in the Op for a pack', () => {
    expect(toUnknownOp({ ...pack, image: pic }, { mode: 'pack', code: '08000500310427' }, meta)).toMatchObject({ kind: 'shop_unknown', productImage: pic })
  })

  it('puts it in the Op for a weighed code too: every unknown code creates a Product', () => {
    const weighed = toUnknownOp({ ...pack, image: pic }, { mode: 'weighed', ruleId: 3, itemCode: '12345', weightGrams: 450 }, meta)
    expect(weighed).toMatchObject({ productImage: pic })
    const priced = toUnknownOp({ ...pack, image: pic, weightText: '450' }, { mode: 'weighed_price', ruleId: 3, itemCode: '12345', priceCents: 250 }, meta)
    expect(priced).toMatchObject({ productImage: pic })
  })

  it('leaves the key out without a picture, so an Op without one is unchanged', () => {
    expect(toUnknownOp(pack, { mode: 'pack', code: '08000500310427' }, meta)).not.toHaveProperty('productImage')
    expect(toUnknownOp({ ...pack, image: '' }, { mode: 'pack', code: '08000500310427' }, meta)).not.toHaveProperty('productImage')
  })

  it('the picture is never required', () => {
    expect(validateUnknownForm({ ...pack, image: '' }, 'pack')).toEqual({})
    expect(validateUnknownForm({ ...pack, image: pic }, 'pack')).toEqual({})
  })
})
