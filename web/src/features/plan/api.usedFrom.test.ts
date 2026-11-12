import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '../../lib/http'
import { isUsedFromInvalid, usedFromApi } from './api.usedFrom'
import { mockApi } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

const key = { date: '2026-11-10', mealSlotId: 2, courseId: 3 }
const picks = [{ ingredientId: 11, lots: [{ lotId: 1, quantity: 500 }] }]

describe('usedFromApi.cooked', () => {
  it('posts usedFrom with the Leftover portions to the Course route', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-10/2/3/cooked': { warnings: [] } })
    await usedFromApi.cooked(key, { leftoverPortions: 1, usedFrom: picks })
    expect(api.calls).toEqual([{ method: 'POST', path: '/api/plan/2026-11-10/2/3/cooked', body: { leftoverPortions: 1, usedFrom: picks } }])
  })
  it('sends no usedFrom key when nothing is picked', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-10/2/3/cooked': { warnings: [] } })
    await usedFromApi.cooked(key, { leftoverPortions: 1, usedFrom: [] })
    expect(api.calls[0]!.body).toEqual({ leftoverPortions: 1 })
  })
  it('sends an empty body with nothing at all', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-10/2/3/cooked': { warnings: [] } })
    await usedFromApi.cooked(key, {})
    expect(api.calls[0]!.body).toEqual({})
  })
})

describe('usedFromApi.cookedAll', () => {
  it('posts each Course entry with its usedFrom only where picked', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-10/2/all/cooked': { meals: [] } })
    await usedFromApi.cookedAll({ date: '2026-11-10', mealSlotId: 2 }, [
      { courseId: 1, leftoverPortions: 2, usedFrom: picks },
      { courseId: 2, leftoverPortions: 1, usedFrom: [] },
      { courseId: 3 },
    ])
    expect(api.calls[0]!.body).toEqual({ courses: [{ courseId: 1, leftoverPortions: 2, usedFrom: picks }, { courseId: 2, leftoverPortions: 1 }, { courseId: 3 }] })
  })
})

describe('isUsedFromInvalid', () => {
  it('is true for a 422 used_from_invalid only', () => {
    expect(isUsedFromInvalid(new ApiError(422, 'used_from_invalid', 'no'))).toBe(true)
    expect(isUsedFromInvalid(new ApiError(422, 'validation_failed', 'no'))).toBe(false)
    expect(isUsedFromInvalid(new ApiError(500, 'used_from_invalid', 'no'))).toBe(false)
    expect(isUsedFromInvalid(new Error('x'))).toBe(false)
  })
})
