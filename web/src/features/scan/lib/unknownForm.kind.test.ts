// SR5 (H7's unknown-form half): the kind of a new Ingredient or Supply, the names the summary offers, the new row's key.
import { describe, expect, it } from 'vitest'
import { choiceKind, choicesOfKind, defaultName, defaultNewBaseUnit, emptyForm, newRowKey, toUnknownOp, validateUnknownForm, type IngredientChoice, type UnknownFormValues } from './unknownForm'

const meta = { clientUuid: 'u-meta', scannedAt: '2026-11-13T10:00:00Z', shopId: 3, rangeTo: '2026-11-15' }
const supply: UnknownFormValues = { ...emptyForm(), ingredient: { name: 'toilet paper', baseUnit: 'piece', kind: 'supply' }, packSize: '9', packUnit: 'piece', productName: 'Toilet paper 9 pieces' }
const food: UnknownFormValues = { ...emptyForm(), ingredient: { name: 'olive oil', baseUnit: 'ml', kind: 'food' }, packSize: '1', packUnit: 'l', productName: 'Olive oil 1000 ml' }

describe('toUnknownOp: kind', () => {
  it('a new Supply carries kind supply and its Base Unit, and no id', () => {
    const op = toUnknownOp(supply, { mode: 'pack', code: '8001234567890' }, meta)
    expect(op.ingredient).toEqual({ name: 'toilet paper', baseUnit: 'piece', kind: 'supply' })
    expect(op).toMatchObject({ kind: 'shop_unknown', packSize: 9, quantity: 9, productName: 'Toilet paper 9 pieces' })
  })

  it('a new Ingredient carries kind food', () => {
    expect(toUnknownOp(food, { mode: 'pack', code: '8001234567890' }, meta).ingredient).toEqual({ name: 'olive oil', baseUnit: 'ml', kind: 'food' })
  })

  it('a new Ingredient with no kind set is food', () => {
    const noKind = { ...food, ingredient: { name: 'olive oil', baseUnit: 'ml' as const } }
    expect(toUnknownOp(noKind, { mode: 'pack', code: '8001234567890' }, meta).ingredient).toMatchObject({ kind: 'food' })
  })

  it('an existing Ingredient or Supply is only its id: the server knows its kind', () => {
    const existing = { ...supply, ingredient: { id: 31, name: 'Toilet paper', baseUnit: 'piece' as const, kind: 'supply' as const } }
    expect(toUnknownOp(existing, { mode: 'pack', code: '8001234567890' }, meta).ingredient).toEqual({ id: 31 })
  })

  it('a weighed code for a new Supply carries the kind too', () => {
    const op = toUnknownOp(supply, { mode: 'weighed', ruleId: 3, itemCode: '00009', weightGrams: 500 }, meta)
    expect(op.ingredient).toMatchObject({ kind: 'supply' })
  })

  it('uses the clientUuid the sheet put in the form, else the one of the caller', () => {
    expect(toUnknownOp({ ...supply, clientUuid: 'u-sheet' }, { mode: 'pack', code: '8001234567890' }, meta).clientUuid).toBe('u-sheet')
    expect(toUnknownOp(supply, { mode: 'pack', code: '8001234567890' }, meta).clientUuid).toBe('u-meta')
  })
})

describe('newRowKey', () => {
  it('is the key the Scanned list gives a Product that is not created yet', () => {
    expect(newRowKey('u-1')).toBe('new:u-1')
  })
})

describe('defaultNewBaseUnit', () => {
  it('a new Ingredient starts on g and a new Supply on piece', () => {
    expect(defaultNewBaseUnit('food')).toBe('g')
    expect(defaultNewBaseUnit('supply')).toBe('piece')
  })
})

describe('choiceKind and choicesOfKind', () => {
  const choices: IngredientChoice[] = [
    { id: 1, name: 'passata', baseUnit: 'g' },
    { id: 2, name: 'rice', baseUnit: 'g', kind: 'food' },
    { id: 3, name: 'Dish soap', baseUnit: 'ml', kind: 'supply' },
  ]
  it('a choice with no kind is food', () => {
    expect(choiceKind(choices[0]!)).toBe('food')
    expect(choiceKind(choices[2]!)).toBe('supply')
    expect(choiceKind(null)).toBe('food')
  })
  it('keeps the choices of one kind, in order', () => {
    expect(choicesOfKind(choices, 'food').map((c) => c.name)).toEqual(['passata', 'rice'])
    expect(choicesOfKind(choices, 'supply').map((c) => c.name)).toEqual(['Dish soap'])
  })
})

describe('defaultName', () => {
  it('a pack is the Ingredient with its size', () => {
    expect(defaultName({ ...emptyForm(), ingredient: { name: 'dish soap', baseUnit: 'ml', kind: 'supply' }, packSize: '500', packUnit: 'ml' }, 'pack')).toBe('Dish soap 500 ml')
    expect(defaultName({ ...emptyForm(), ingredient: { name: 'eggs', baseUnit: 'piece' }, packSize: '6', packUnit: 'piece' }, 'pack')).toBe('Eggs 6 pieces')
  })
  it('is empty until the Ingredient and a valid size are known', () => {
    expect(defaultName(emptyForm(), 'pack')).toBe('')
    expect(defaultName({ ...emptyForm(), ingredient: { name: 'eggs', baseUnit: 'piece' } }, 'pack')).toBe('')
  })
  it('a weighed code has no pack size: the Ingredient\'s name, capitalised', () => {
    expect(defaultName({ ...emptyForm(), ingredient: { name: 'loose carrots', baseUnit: 'g' } }, 'weighed')).toBe('Loose carrots')
    expect(defaultName({ ...emptyForm(), ingredient: { name: 'cheese', baseUnit: 'g' } }, 'weighed_price')).toBe('Cheese')
    expect(defaultName(emptyForm(), 'weighed')).toBe('')
  })
})

describe('validateUnknownForm for the short form', () => {
  it('a new Supply with a blank name is not chosen yet', () => {
    expect(validateUnknownForm({ ...supply, ingredient: { name: '   ', baseUnit: 'piece', kind: 'supply' } }, 'pack')).toHaveProperty('ingredient')
  })
  it('a complete Supply form has no errors', () => {
    expect(validateUnknownForm(supply, 'pack')).toEqual({})
  })
  it('a pack size in the wrong dimension for the Base Unit is refused (kg for a piece Supply)', () => {
    expect(validateUnknownForm({ ...supply, packUnit: 'kg' }, 'pack')).toHaveProperty('packSize')
  })
})
