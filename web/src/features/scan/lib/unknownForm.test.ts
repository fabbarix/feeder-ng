import { describe, expect, it } from 'vitest'
import { emptyForm, packSizeInBase, suggestedName, toUnknownOp, unitOptions, validateUnknownForm, type UnknownFormValues } from './unknownForm'

const meta = { clientUuid: 'u-1', scannedAt: '2026-11-09T12:00:00Z', shopId: 1, rangeTo: '2026-11-15' }

function form(over: Partial<UnknownFormValues> = {}): UnknownFormValues {
  return {
    ...emptyForm(),
    ingredient: { name: 'tinned tomatoes', baseUnit: 'g' },
    packSize: '400',
    packUnit: 'g',
    productName: 'Tinned tomatoes 400 g',
    scope: 'global',
    ...over,
  }
}

describe('emptyForm', () => {
  it('starts empty and global', () => {
    expect(emptyForm()).toEqual({ ingredient: null, packSize: '', packUnit: '', productName: '', scope: 'global', weightText: '' })
  })
})

describe('unitOptions and packSizeInBase', () => {
  it('offers units of the Ingredient dimension, Base Unit first', () => {
    expect(unitOptions('g')).toEqual(['g', 'kg', 'oz', 'lb'])
    expect(unitOptions('ml')).toEqual(['ml', 'l'])
    expect(unitOptions('piece')).toEqual(['piece'])
  })

  it.each([
    ['700', 'g', 'g', 700],
    ['1,5', 'kg', 'g', 1500],
    ['1.5', 'kg', 'g', 1500],
    ['16', 'oz', 'g', 453.592],
    ['1', 'lb', 'g', 453.592],
    ['1', 'l', 'ml', 1000],
    ['0.5', 'l', 'ml', 500],
    ['6', 'piece', 'piece', 6],
  ] as const)('%s %s is %s in Base Units', (text, unit, base, want) => {
    expect(packSizeInBase(text, unit, base)).toBeCloseTo(want, 3)
  })

  it.each([[''], ['abc'], ['0'], ['-5'], ['1.2.3']])('rejects %j', (text) => {
    expect(packSizeInBase(text, 'g', 'g')).toBeNull()
  })
})

describe('suggestedName', () => {
  it('is the Ingredient with its pack size, as the spec prefills it', () => {
    expect(suggestedName(form())).toBe('Tinned tomatoes 400 g')
    expect(suggestedName(form({ packSize: '1', packUnit: 'kg' }))).toBe('Tinned tomatoes 1000 g')
    expect(suggestedName(form({ ingredient: { id: 3, name: 'milk', baseUnit: 'ml' }, packSize: '1', packUnit: 'l' }))).toBe('Milk 1000 ml')
  })

  it('stays empty until it can be built', () => {
    expect(suggestedName(form({ ingredient: null }))).toBe('')
    expect(suggestedName(form({ packSize: '' }))).toBe('')
  })
})

describe('validateUnknownForm', () => {
  it('accepts a complete pack form', () => {
    expect(validateUnknownForm(form(), 'pack')).toEqual({})
  })

  it('needs an Ingredient, a pack size above 0 and a Product name', () => {
    expect(Object.keys(validateUnknownForm(form({ ingredient: null }), 'pack'))).toEqual(['ingredient'])
    expect(Object.keys(validateUnknownForm(form({ packSize: '0' }), 'pack'))).toEqual(['packSize'])
    expect(Object.keys(validateUnknownForm(form({ productName: '   ' }), 'pack'))).toEqual(['productName'])
    expect(Object.keys(validateUnknownForm(form({ ingredient: null, packSize: '', productName: '' }), 'pack')).sort()).toEqual(['ingredient', 'packSize', 'productName'])
  })

  it('a weighed code asks only for the Ingredient and the Product name', () => {
    expect(validateUnknownForm(form({ packSize: '', packUnit: '' }), 'weighed')).toEqual({})
    expect(Object.keys(validateUnknownForm(form({ ingredient: null, productName: '' }), 'weighed')).sort()).toEqual(['ingredient', 'productName'])
  })

  it('a price-valued weighed code also needs the weight, once', () => {
    expect(validateUnknownForm(form({ weightText: '500' }), 'weighed_price')).toEqual({})
    expect(Object.keys(validateUnknownForm(form({ weightText: '' }), 'weighed_price'))).toEqual(['weight'])
    expect(Object.keys(validateUnknownForm(form({ weightText: '0' }), 'weighed_price'))).toEqual(['weight'])
  })
})

describe('toUnknownOp', () => {
  it('builds the full form as a shop_unknown Op with a new Ingredient', () => {
    expect(toUnknownOp(form(), { mode: 'pack', code: '05012345678900' }, meta)).toEqual({
      clientUuid: 'u-1',
      scannedAt: '2026-11-09T12:00:00Z',
      kind: 'shop_unknown',
      shopId: 1,
      rangeTo: '2026-11-15',
      barcode: '05012345678900',
      quantity: 400,
      packSize: 400,
      scope: 'global',
      // SR5 (H7): a new Ingredient says its kind, food here (it used to be left out).
      ingredient: { name: 'tinned tomatoes', baseUnit: 'g', kind: 'food' },
      productName: 'Tinned tomatoes 400 g',
    })
  })

  it('refers to an existing Ingredient by id and converts the pack size to Base Units', () => {
    const op = toUnknownOp(form({ ingredient: { id: 9, name: 'milk', baseUnit: 'ml' }, packSize: '1', packUnit: 'l', scope: 'shop', productName: ' Milk 1 l ' }), { mode: 'pack', code: '04000000000013' }, meta)
    expect(op).toMatchObject({ ingredient: { id: 9 }, quantity: 1000, packSize: 1000, scope: 'shop', productName: 'Milk 1 l' })
    expect(op.ingredient).not.toHaveProperty('name')
  })

  it('a weighed code carries the rule, the item code and the decoded weight, and no pack size or scope', () => {
    const op = toUnknownOp(form({ ingredient: { id: 4, name: 'carrots', baseUnit: 'g' }, productName: 'Loose carrots' }), { mode: 'weighed', ruleId: 3, itemCode: '00009', weightGrams: 500 }, meta)
    expect(op).toEqual({
      clientUuid: 'u-1',
      scannedAt: '2026-11-09T12:00:00Z',
      kind: 'shop_unknown',
      shopId: 1,
      rangeTo: '2026-11-15',
      ruleId: 3,
      itemCode: '00009',
      quantity: 500,
      ingredient: { id: 4 },
      productName: 'Loose carrots',
    })
  })

  it('a price-valued weighed code uses the weight entered and records the price per kg', () => {
    const op = toUnknownOp(form({ weightText: '500', productName: 'Loose cheese' }), { mode: 'weighed_price', ruleId: 4, itemCode: '00009', priceCents: 300 }, meta)
    expect(op).toMatchObject({ ruleId: 4, itemCode: '00009', quantity: 500, priceCents: 300, pricePerKgCents: 600 })
  })

  it('leaves rangeTo out when the list has none', () => {
    const op = toUnknownOp(form(), { mode: 'pack', code: '05012345678900' }, { clientUuid: 'u-2', scannedAt: 'x', shopId: 1 })
    expect(op).not.toHaveProperty('rangeTo')
  })
})
