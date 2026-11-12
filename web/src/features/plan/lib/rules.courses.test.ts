// CRS F (spec 7.5): a Slot Rule picks a Meal Slot and then a Course of that slot.
import { describe, expect, it } from 'vitest'
import { slotRuleTitle, toSlotRuleBody } from './rules'

describe('toSlotRuleBody with a Course', () => {
  it('carries the chosen Course as a number', () => {
    expect(toSlotRuleBody({ mealSlotId: '3', kind: 'recipe', recipeId: '9', tag: '', courseId: '2' })).toEqual({ body: { mealSlotId: 3, courseId: 2, recipeId: 9 } })
    expect(toSlotRuleBody({ mealSlotId: '3', kind: 'tag', recipeId: '', tag: 'pizza', courseId: '2' })).toEqual({ body: { mealSlotId: 3, courseId: 2, tag: 'pizza' } })
  })

  it('leaves the key out when no Course was chosen (a one-Course slot; the server takes the main Course)', () => {
    const out = toSlotRuleBody({ mealSlotId: '3', kind: 'recipe', recipeId: '9', tag: '' }) as { body: object }
    expect(out.body).toEqual({ mealSlotId: 3, recipeId: 9 })
    expect(out.body).not.toHaveProperty('courseId')
    const empty = toSlotRuleBody({ mealSlotId: '3', kind: 'recipe', recipeId: '9', tag: '', courseId: '' }) as { body: object }
    expect(empty.body).not.toHaveProperty('courseId')
  })
})

describe('slotRuleTitle', () => {
  it('"Friday Dinner · Main" when the Course is shown', () => {
    expect(slotRuleTitle('Friday Dinner', 'Main')).toBe('Friday Dinner · Main')
  })

  it('a rule on a one-Course slot reads as before', () => {
    expect(slotRuleTitle('Friday Dinner', null)).toBe('Friday Dinner')
  })
})
