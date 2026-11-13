import { describe, expect, it } from 'vitest'
import { ApiError } from '../http'
import { parseTakeOver, takeOverDialog } from './takeOver'
import type { TakeOverAsk } from './types'

const ask = (over: Partial<TakeOverAsk> = {}): TakeOverAsk => ({
  ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka' }], stockLots: 1, convertible: true, ...over,
})

describe('parseTakeOver (409 base_recipe_take_over, the shape internal/recipe/httpapi/base_test.go pins)', () => {
  it('reads the Ingredient, the Recipes, the Stock Lots and convertible from the error', () => {
    const err = new ApiError(409, 'base_recipe_take_over', 'ask', { ingredient: { id: 5, name: 'béchamel', archived: false }, recipes: [{ id: 1, name: 'Lasagne', archived: false }], stockLots: 2, convertible: false })
    expect(parseTakeOver(err)).toEqual({ ingredient: { id: 5, name: 'béchamel' }, recipes: [{ id: 1, name: 'Lasagne' }], stockLots: 2, convertible: false })
  })
  it('is null for any other error or value', () => {
    expect(parseTakeOver(new ApiError(409, 'in_use', 'x'))).toBeNull()
    expect(parseTakeOver(new Error('x'))).toBeNull()
    expect(parseTakeOver(null)).toBeNull()
  })
})

describe('takeOverDialog: names the Recipes and the Stock affected, offers Yes or No', () => {
  it('titles it with the Ingredient and the Base recipe', () => {
    expect(takeOverDialog(ask(), 'Béchamel').title).toBe('Use the Ingredient béchamel for Béchamel?')
  })
  it('names the Recipes and the Stock Lot, then says what Yes and No do', () => {
    const m = takeOverDialog(ask(), 'Béchamel')
    expect(m.body[0]).toBe('Lasagne and Moussaka call for it, and 1 Stock Lot of it is in the Pantry.')
    expect(m.body.join(' ')).toMatch(/Yes/)
    expect(m.body.join(' ')).toMatch(/No/)
    expect(m).toMatchObject({ yesLabel: 'Yes', noLabel: 'No' })
    expect(m.yesDisabledReason).toBeUndefined()
  })
  it('joins three names with commas and "and"; folds more than three into "N more"', () => {
    const three = takeOverDialog(ask({ recipes: [{ id: 1, name: 'Lasagne' }, { id: 2, name: 'Moussaka' }, { id: 3, name: 'Cannelloni' }] }), 'Béchamel')
    expect(three.body[0]).toContain('Lasagne, Moussaka and Cannelloni call for it')
    const five = takeOverDialog(ask({ recipes: [1, 2, 3, 4, 5].map((id) => ({ id, name: `R${id}` })) }), 'Béchamel')
    expect(five.body[0]).toContain('R1, R2, R3 and 2 more call for it')
  })
  it('words one Recipe, no Recipe, many Stock Lots and no Stock', () => {
    expect(takeOverDialog(ask({ recipes: [{ id: 1, name: 'Lasagne' }] }), 'Béchamel').body[0]).toContain('Lasagne calls for it')
    expect(takeOverDialog(ask({ recipes: [], stockLots: 3 }), 'Béchamel').body[0]).toBe('No Recipe calls for it, and 3 Stock Lots of it are in the Pantry.')
    expect(takeOverDialog(ask({ stockLots: 0 }), 'Béchamel').body[0]).toBe('Lasagne and Moussaka call for it. It has no Stock.')
  })
  it('disables Yes with the reason when the Yield unit does not convert to the Ingredient', () => {
    const m = takeOverDialog(ask({ convertible: false }), 'Béchamel')
    expect(m.yesDisabledReason).toMatch(/cannot be converted/)
  })
})
