import { describe, expect, it } from 'vitest'
import { answerConversion, chooseCreate, chooseExisting, chooseRecipeAction, clearIngredient, emptyDecisions, parseToBase } from './decisions'

describe('decisions', () => {
  it('starts empty', () => {
    expect(emptyDecisions()).toEqual({ ingredients: [], conversions: [], recipes: [] })
  })
  it('answers an Ingredient with an existing one, replacing an earlier answer', () => {
    let d = chooseCreate(emptyDecisions(), 'onion', { name: 'onion (whole)' })
    d = chooseExisting(d, 'onion', 5)
    expect(d.ingredients).toEqual([{ key: 'onion', action: 'use', ingredientId: 5 }])
  })
  it('answers with create, keeping only the options given', () => {
    expect(chooseCreate(emptyDecisions(), 'lemon').ingredients).toEqual([{ key: 'lemon', action: 'create' }])
    expect(chooseCreate(emptyDecisions(), 'lemon', { baseUnit: 'piece' }).ingredients).toEqual([{ key: 'lemon', action: 'create', baseUnit: 'piece' }])
    expect(chooseCreate(emptyDecisions(), 'onion', { name: '  onion (whole) ' }).ingredients).toEqual([{ key: 'onion', action: 'create', name: 'onion (whole)' }])
    expect(chooseCreate(emptyDecisions(), 'onion', { name: '   ' }).ingredients).toEqual([{ key: 'onion', action: 'create' }])
  })
  it('keeps answers for other keys when one changes, and clears one', () => {
    let d = chooseExisting(emptyDecisions(), 'a', 1)
    d = chooseExisting(d, 'b', 2)
    d = chooseExisting(d, 'a', 3)
    expect(d.ingredients).toHaveLength(2)
    expect(d.ingredients).toEqual(expect.arrayContaining([{ key: 'b', action: 'use', ingredientId: 2 }, { key: 'a', action: 'use', ingredientId: 3 }]))
    expect(clearIngredient(d, 'a').ingredients).toEqual([{ key: 'b', action: 'use', ingredientId: 2 }])
  })
  it('answers a unit prompt per (Ingredient, unit), normalising the unit', () => {
    let d = answerConversion(emptyDecisions(), 'spinach', ' Handful ', 30)
    d = answerConversion(d, 'spinach', 'bunch', 80)
    d = answerConversion(d, 'spinach', 'handful', 25)
    expect(d.conversions).toEqual(
      expect.arrayContaining([
        { key: 'spinach', unit: 'handful', toBase: 25 },
        { key: 'spinach', unit: 'bunch', toBase: 80 },
      ]),
    )
    expect(d.conversions).toHaveLength(2)
  })
  it('answers a Recipe conflict per index', () => {
    let d = chooseRecipeAction(emptyDecisions(), 0, 'replace')
    d = chooseRecipeAction(d, 1, 'skip')
    d = chooseRecipeAction(d, 0, 'keep_both')
    expect(d.recipes).toHaveLength(2)
    expect(d.recipes).toEqual(expect.arrayContaining([{ index: 0, action: 'keep_both' }, { index: 1, action: 'skip' }]))
  })
  it('never mutates its input', () => {
    const before = chooseExisting(emptyDecisions(), 'a', 1)
    const snapshot = JSON.stringify(before)
    chooseExisting(before, 'a', 2)
    chooseCreate(before, 'b')
    answerConversion(before, 'a', 'x', 1)
    chooseRecipeAction(before, 0, 'skip')
    clearIngredient(before, 'a')
    expect(JSON.stringify(before)).toBe(snapshot)
  })
})

describe('parseToBase', () => {
  it.each([
    ['30', 30],
    [' 12.5 ', 12.5],
    ['0,5', 0.5],
    ['1e2', 100],
  ])('reads %j as %d', (text, n) => expect(parseToBase(text)).toBe(n))
  it.each(['', '  ', '0', '-3', 'abc', '1,2,3', 'Infinity', 'NaN', '12g'])('refuses %j', (text) => expect(parseToBase(text)).toBeNull())
})
