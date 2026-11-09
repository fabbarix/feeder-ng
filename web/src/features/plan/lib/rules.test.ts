import { describe, expect, it } from 'vitest'
import { describeSlotRule, describeVarietyRule, mealSlotLabel, normaliseTag, toVarietyRule } from './rules'

describe('normaliseTag', () => {
  it('lower-cases, trims and collapses inner spaces', () => {
    expect(normaliseTag('  Quick   Meals ')).toBe('quick meals')
    expect(normaliseTag('Fish')).toBe('fish')
  })
})

describe('describeSlotRule', () => {
  it('names the Recipe or the Tag', () => {
    expect(describeSlotRule({ id: 1, mealSlotId: 5, recipeId: 3, recipeName: 'Curry' })).toBe('Recipe: Curry')
    expect(describeSlotRule({ id: 2, mealSlotId: 5, tag: 'pizza' })).toBe('Tag: pizza')
  })
})

describe('describeVarietyRule', () => {
  it('words the weekly cap, the consecutive-days ban, or both', () => {
    expect(describeVarietyRule({ tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false })).toBe('At most 2 a week')
    expect(describeVarietyRule({ tag: 'fish', maxPerWeek: 0, notConsecutiveDays: true })).toBe('Not on consecutive days')
    expect(describeVarietyRule({ tag: 'fish', maxPerWeek: 1, notConsecutiveDays: true })).toBe('At most 1 a week, not on consecutive days')
  })
})

describe('toVarietyRule', () => {
  it('builds the rule from the form, normalising the Tag', () => {
    expect(toVarietyRule({ tag: ' Fish ', maxPerWeek: '2', notConsecutiveDays: false })).toEqual({
      rule: { tag: 'fish', maxPerWeek: 2, notConsecutiveDays: false },
    })
    expect(toVarietyRule({ tag: 'pasta', maxPerWeek: '', notConsecutiveDays: true })).toEqual({
      rule: { tag: 'pasta', maxPerWeek: 0, notConsecutiveDays: true },
    })
  })

  it('needs a Tag', () => {
    expect(toVarietyRule({ tag: '  ', maxPerWeek: '2', notConsecutiveDays: false })).toEqual({ error: 'tag_required' })
  })

  it('needs a limit', () => {
    expect(toVarietyRule({ tag: 'fish', maxPerWeek: '', notConsecutiveDays: false })).toEqual({ error: 'nothing_limited' })
  })

  it('keeps the weekly limit between 1 and 21', () => {
    for (const bad of ['0', '22', '-1', 'x', '1.5']) {
      expect(toVarietyRule({ tag: 'fish', maxPerWeek: bad, notConsecutiveDays: false })).toEqual({ error: 'max_range' })
    }
    expect(toVarietyRule({ tag: 'fish', maxPerWeek: '21', notConsecutiveDays: false })).toEqual({ rule: { tag: 'fish', maxPerWeek: 21, notConsecutiveDays: false } })
  })
})

describe('mealSlotLabel', () => {
  it('prefixes the weekday of the Meal Slot', () => {
    expect(mealSlotLabel(5, 'Dinner')).toBe('Friday Dinner')
    expect(mealSlotLabel(1, 'Lunch')).toBe('Monday Lunch')
    expect(mealSlotLabel(7, 'Dinner')).toBe('Sunday Dinner')
  })
})
