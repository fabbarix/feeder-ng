// What uses a Tag, as the row says it (spec 4.1: "12 Recipes · 1 Slot Rule · Variety Rule"; "No Recipes yet" when none).
import { describe, expect, it } from 'vitest'
import { recipesPhrase, rowLabel, usageLine } from './usage'

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

describe('rowLabel', () => {
  it('is the name, a comma and the line, so a screen reader hears what the row is', () => {
    expect(rowLabel({ name: 'fish', ...use(12, 1, true) })).toBe('fish, 12 Recipes · 1 Slot Rule · Variety Rule')
    expect(rowLabel({ name: 'Roast', ...use(0) })).toBe('Roast, No Recipes yet')
  })
})
