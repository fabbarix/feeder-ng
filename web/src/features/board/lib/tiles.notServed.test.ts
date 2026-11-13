// B5-F1 (ADR 0014): the board says "Dinner · Not served" for tonight and tomorrow.
import { describe, expect, it } from 'vitest'
import type { SlotLike } from '../types'
import { notServedLine, tomorrowLine, tomorrowSlots, tonightMeal, tonightNotServed } from './tiles'

const TODAY = '2026-11-09'
const notServed = (over: Partial<SlotLike> = {}): SlotLike => ({
  date: TODAY, mealSlotId: 2, name: 'Dinner', time: '19:30', at: '2026-11-09T19:30:00Z', notServed: true,
  courses: [{ courseId: 1, name: 'Main', main: true, meal: null, unserved: 'not_served' }], ...over,
})
const served = (over: Partial<SlotLike> = {}): SlotLike => ({
  date: TODAY, mealSlotId: 1, name: 'Lunch', time: '12:30', at: '2026-11-09T12:30:00Z',
  courses: [{ courseId: 1, name: 'Main', main: true, meal: { recipeId: 7, recipeName: 'Soup', batches: 1, portions: 4, state: 'planned' } }], ...over,
})

describe('notServedLine', () => {
  it('is "<Slot> · Not served"', () => {
    expect(notServedLine(notServed())).toBe('Dinner · Not served')
  })
})

describe('tonightNotServed', () => {
  it('is today\'s Not served slots by time; other dates and served slots are left out', () => {
    const lunch = notServed({ mealSlotId: 1, name: 'Lunch', at: '2026-11-09T12:30:00Z' })
    const tomorrow = notServed({ date: '2026-11-10', mealSlotId: 3 })
    expect(tonightNotServed([notServed(), served(), tomorrow, lunch], TODAY).map((s) => s.name)).toEqual(['Lunch', 'Dinner'])
  })

  it('a Not served slot is never Tonight\'s meal', () => {
    expect(tonightMeal([notServed()], TODAY, '2026-11-09T17:00:00Z')).toBeNull()
  })
})

describe('tomorrow', () => {
  const TOMORROW = '2026-11-10'
  it('lists a Not served slot of tomorrow beside the planned ones, in time order', () => {
    const lunch = served({ date: TOMORROW, at: '2026-11-10T12:30:00Z' })
    const dinner = notServed({ date: TOMORROW, at: '2026-11-10T19:30:00Z' })
    expect(tomorrowSlots([dinner, lunch], TODAY).map((s) => s.name)).toEqual(['Lunch', 'Dinner'])
  })

  it('its line says Not served', () => {
    expect(tomorrowLine(notServed({ date: TOMORROW }))).toBe('Dinner · Not served')
  })
})
