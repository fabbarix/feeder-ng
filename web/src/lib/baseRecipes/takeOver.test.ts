import { describe, expect, it } from 'vitest'
import { ApiError } from '../http'
import { keptLinesNote, parseTakeOver, takeOverDialog } from './takeOver'
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
    expect(takeOverDialog(ask(), 'Béchamel').title).toBe('Béchamel (Base recipe) has the name of an Ingredient. Take it over?')
  })
  it('names the Recipes and the Stock Lot, then says what Yes and No do', () => {
    const m = takeOverDialog(ask(), 'Béchamel')
    expect(m.body[0]).toBe('Lasagne and Moussaka call for it, and 1 Stock Lot of it is in the Pantry.')
    expect(m.body.join(' ')).toMatch(/Yes/)
    expect(m.body.join(' ')).toMatch(/No/)
    expect(m).toMatchObject({ yesLabel: 'Yes, take it over', noLabel: 'No, keep it apart' })
    expect(m.yesDisabledReason).toBeUndefined()
  })
  it('says the badge tells the two apart if they are kept apart', () => {
    const text = takeOverDialog(ask(), 'Béchamel').body.join(' ')
    expect(text).toMatch(/Base recipe/)
    expect(text).toMatch(/badge/)
    expect(text).toMatch(/tells them apart/)
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

// beta.8 (docs/dev/design/b8-base.md section 1): keptLines. Pinned API in takeOver.ts: keptLinesNote(keptLines: number | undefined, baseName: string): string | null,
// and takeOverDialog(...).note: string | undefined, the same text.

describe('keptLinesNote', () => {
  it('is null for 0 and for an absent count', () => {
    expect(keptLinesNote(0, 'Béchamel')).toBeNull()
    expect(keptLinesNote(undefined, 'Béchamel')).toBeNull()
  })
  it('says what Yes and No do for one line', () => {
    expect(keptLinesNote(1, 'Béchamel')).toBe('1 other line in this import stays an Ingredient. With Yes it uses Béchamel too; with No it keeps the Ingredient.')
  })
  it('says what Yes and No do for several lines', () => {
    expect(keptLinesNote(4, 'Béchamel')).toBe('4 other lines in this import stay an Ingredient. With Yes they use Béchamel too; with No they keep the Ingredient.')
  })
})

describe('keptLines through the 409 and the dialog', () => {
  it('parseTakeOver carries keptLines when the answer has it', () => {
    const err = new ApiError(409, 'base_recipe_take_over', 'ask', { ingredient: { id: 5, name: 'béchamel' }, recipes: [], stockLots: 0, convertible: true, keptLines: 2 })
    expect(parseTakeOver(err)?.keptLines).toBe(2)
  })
  it('parseTakeOver leaves keptLines out of an answer without it (an older server)', () => {
    const err = new ApiError(409, 'base_recipe_take_over', 'ask', { ingredient: { id: 5, name: 'béchamel' }, recipes: [], stockLots: 0, convertible: true })
    expect(parseTakeOver(err)).not.toHaveProperty('keptLines')
  })
  it('takeOverDialog gives the note only above 0', () => {
    expect(takeOverDialog(ask({ keptLines: 2 }), 'Béchamel').note).toBe(keptLinesNote(2, 'Béchamel'))
    expect(takeOverDialog(ask({ keptLines: 0 }), 'Béchamel').note).toBeUndefined()
    expect(takeOverDialog(ask(), 'Béchamel').note).toBeUndefined()
  })
})
