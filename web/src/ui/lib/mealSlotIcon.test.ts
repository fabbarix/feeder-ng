import { describe, expect, it } from 'vitest'
import { mealSlotIcon } from './mealSlotIcon'

describe('mealSlotIcon', () => {
  it.each([
    ['breakfast', 'breakfast'],
    ['Lunch', 'lunch'],
    ['DINNER', 'dinner'],
    ['Snack', 'snack'],
    ['  dinner  ', 'dinner'],
  ])('maps %j to %s case-insensitively, ignoring surrounding spaces', (name, icon) => {
    expect(mealSlotIcon(name)).toBe(icon)
  })

  it.each(['Brunch', 'Second breakfast', 'Late supper', '', '   ', 'dinners'])(
    'maps custom name %j to other (whole-name match only)',
    (name) => {
      expect(mealSlotIcon(name)).toBe('other')
    },
  )
})
