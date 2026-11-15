// What uses a Tag, as the row says it (spec 4.1: "12 Recipes · 1 Slot Rule · Variety Rule"; "No Recipes yet" when none).
import { describe, expect, it } from 'vitest'
import { recipesPhrase, recipeValue, rowLabel, usageExtras, usageLine } from './usage'

const use = (recipes: number, slotRules = 0, varietyRule = false) => ({ recipes, slotRules, varietyRule })

describe('recipesPhrase', () => {
  it.each([
    [0, 'No Recipes yet'],
    [1, '1 Recipe'],
    [2, '2 Recipes'],
    [12, '12 Recipes'],
  ])('%i is %s', (n, text) => expect(recipesPhrase(n)).toBe(text))
})

describe('usageLine', () => {
  it('Recipes alone', () => expect(usageLine(use(3))).toBe('3 Recipes'))
  it('all three, with the Variety Rule last', () => expect(usageLine(use(12, 1, true))).toBe('12 Recipes · 1 Slot Rule · Variety Rule'))
  it('Slot Rules are counted, singular and plural', () => {
    expect(usageLine(use(1, 1))).toBe('1 Recipe · 1 Slot Rule')
    expect(usageLine(use(1, 2))).toBe('1 Recipe · 2 Slot Rules')
  })
  it('says "No Recipes yet" first, and still names the rules that use the Tag', () => {
    expect(usageLine(use(0))).toBe('No Recipes yet')
    expect(usageLine(use(0, 2, true))).toBe('No Recipes yet · 2 Slot Rules · Variety Rule')
  })
  it('leaves out a count of 0 Slot Rules and a missing Variety Rule', () => expect(usageLine(use(5, 0, false))).toBe('5 Recipes'))
})

// B9-51 (SET-11): the Tag is the row's title, the Recipe count its value ("12 Recipes", "1 Recipe", "None"); recipesPhrase and usageLine stay
// for the confirms (confirmCopy.ts) that already use them.
describe('recipeValue (the value of a Tags row)', () => {
  it.each([
    [0, 'None'],
    [1, '1 Recipe'],
    [2, '2 Recipes'],
    [12, '12 Recipes'],
  ])('%i is %s', (n, text) => expect(recipeValue(n)).toBe(text))
})

describe('usageExtras (the Slot Rules and the Variety Rule, under the title)', () => {
  it('is empty when no rule names the Tag', () => expect(usageExtras(use(5))).toBe(''))
  it('counts Slot Rules, singular and plural, and names the Variety Rule last', () => {
    expect(usageExtras(use(0, 1))).toBe('1 Slot Rule')
    expect(usageExtras(use(0, 2))).toBe('2 Slot Rules')
    expect(usageExtras(use(0, 0, true))).toBe('Variety Rule')
    expect(usageExtras(use(0, 1, true))).toBe('1 Slot Rule · Variety Rule')
  })
})

describe('rowLabel', () => {
  it('is "<Tag>, <count>", then the rules after a dot, so a screen reader hears the row as it reads', () => {
    expect(rowLabel({ name: 'Pasta', ...use(3) })).toBe('Pasta, 3 Recipes')
    expect(rowLabel({ name: 'Roast', ...use(0) })).toBe('Roast, None')
    expect(rowLabel({ name: 'fish', ...use(12, 1, true) })).toBe('fish, 12 Recipes · 1 Slot Rule · Variety Rule')
    expect(rowLabel({ name: 'Seafood', ...use(0, 0, true) })).toBe('Seafood, None · Variety Rule')
  })
})
