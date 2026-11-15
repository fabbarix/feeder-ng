// B9-45 (PC-02): the Leftover tile of the Cooked confirmation and the entry link that carries the origin. 2026-11-17 is a Tuesday.
import { describe, expect, it } from 'vitest'
import { cookLinkFor, cookPath, leftoverTile } from './cook'

describe('leftoverTile', () => {
  it('has no tile when no Leftover was recorded', () => {
    expect(leftoverTile({ kind: 'none' })).toBeNull()
  })
  it('a kept Leftover: "1.25 portions kept" and its Use-by', () => {
    expect(leftoverTile({ kind: 'kept', portions: 1.25, useBy: '2026-11-17' })).toEqual({ title: '1.25 portions kept', meta: 'Use by Tue' })
  })
  it('one portion is singular', () => {
    expect(leftoverTile({ kind: 'kept', portions: 1, useBy: '2026-11-17' })?.title).toBe('1 portion kept')
  })
  it('a planned Leftover says where it went: "Planned for Mon Dinner · Use by Tue"', () => {
    const outcome = { kind: 'planned' as const, portions: 1.25, useBy: '2026-11-17', meals: [{ date: '2026-11-16', mealSlotName: 'Dinner', recipeName: 'Cauliflower' }] }
    expect(leftoverTile(outcome)).toEqual({ title: '1.25 portions kept', meta: 'Planned for Mon Dinner · Use by Tue' })
  })
  it('several meals are joined with "and"', () => {
    const meals = [
      { date: '2026-11-16', mealSlotName: 'Dinner', recipeName: 'Cauliflower' },
      { date: '2026-11-17', mealSlotName: 'Lunch', recipeName: 'Cauliflower' },
    ]
    expect(leftoverTile({ kind: 'planned', portions: 3, useBy: '2026-11-18', meals })).toEqual({ title: '3 portions kept', meta: 'Planned for Mon Dinner and Tue Lunch · Use by Wed' })
  })
})

describe('cookLinkFor', () => {
  it('opens the Planned Meal\'s Cook Mode and passes where it was opened from', () => {
    const key = { date: '2026-11-14', mealSlotId: 3 }
    expect(cookLinkFor(key, '/plan')).toEqual({ to: cookPath(key), state: { from: '/plan' } })
    expect(cookLinkFor(key, '/')).toEqual({ to: '/cook/meal/2026-11-14/3', state: { from: '/' } })
  })
})
