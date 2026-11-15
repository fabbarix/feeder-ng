// B9-15 (SET-06, "new in stage 2: Recipe options show '360 min' and '0 min'"): the meta is "30 min", "6 h", "1 h 15 min" or "Ready Meal".
import { describe, expect, it } from 'vitest'
import { recipeOptions } from './options'

const meta = (totalMinutes?: number, extra: Record<string, unknown> = {}) =>
  recipeOptions([{ id: 1, name: 'Soup', tags: [], ...(totalMinutes !== undefined ? { totalMinutes } : {}), ...extra }])[0]!.meta

describe('recipeOptions meta', () => {
  it.each([
    [30, '30 min'],
    [59, '59 min'],
    [60, '1 h'],
    [75, '1 h 15 min'],
    [360, '6 h'],
    [390, '6 h 30 min'],
    [1500, '25 h'],
  ])('%i minutes reads "%s"', (minutes, text) => {
    expect(meta(minutes)).toBe(text)
  })
  it('0 minutes and an unknown time have no meta (never "0 min")', () => {
    expect(meta(0)).toBeUndefined()
    expect(meta()).toBeUndefined()
  })
  it('a Ready Meal reads "Ready Meal" whatever its time', () => {
    expect(meta(5, { readyMeal: true })).toBe('Ready Meal')
    expect(meta(undefined, { readyMeal: true })).toBe('Ready Meal')
  })
  it('keeps the tags as search keywords and the thumbnail as leading', () => {
    const [o] = recipeOptions([{ id: 1, name: 'Soup', tags: ['quick'], totalMinutes: 10 }])
    expect(o?.keywords).toEqual(['quick'])
    expect(o?.leading).toBeTruthy()
  })
})
