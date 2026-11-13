// B5-F1: the Meal Slot on one date routes (docs/dev/design/b5-sd.md section 3).
import { afterEach, describe, expect, it, vi } from 'vitest'
import { planApi } from './api'
import { mockApi } from './test-utils'

afterEach(() => vi.unstubAllGlobals())

const info = { date: '2026-11-12', notServed: false, time: null, usualTime: '19:30', guests: 0 }

describe('planApi slot dates', () => {
  it('reads one date of a Meal Slot', async () => {
    const api = mockApi({ 'GET /api/meal-slots/4/dates/2026-11-12': info })
    await expect(planApi.slotDate(4, '2026-11-12')).resolves.toEqual(info)
    expect(api.calls).toHaveLength(1)
  })

  it('PATCHes only the keys it is given', async () => {
    const api = mockApi({ 'PATCH /api/meal-slots/4/dates/2026-11-12': { ...info, time: '20:15' } })
    await planApi.patchSlotDate(4, '2026-11-12', { time: '20:15' })
    expect(api.callsTo('PATCH', '/api/meal-slots/4/dates/2026-11-12')[0]?.body).toEqual({ time: '20:15' })
  })

  it('time null is sent as null (back to the usual time); notServed false serves the date again', async () => {
    const api = mockApi({ 'PATCH /api/meal-slots/4/dates/2026-11-12': info })
    await planApi.patchSlotDate(4, '2026-11-12', { time: null })
    await planApi.patchSlotDate(4, '2026-11-12', { notServed: false })
    expect(api.calls.map((c) => c.body)).toEqual([{ time: null }, { notServed: false }])
  })

  it('the dry run is a PATCH with ?dryRun=1 and notServed true', async () => {
    const answer = { removes: { plannedMeals: [{ courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', pinned: true, bought: [] }] } }
    const api = mockApi({ 'PATCH /api/meal-slots/4/dates/2026-11-12?dryRun=1': answer })
    await expect(planApi.notServedPreview(4, '2026-11-12')).resolves.toEqual(answer)
    expect(api.calls[0]?.body).toEqual({ notServed: true })
  })
})
