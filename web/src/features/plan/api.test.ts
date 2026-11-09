import { describe, expect, it } from 'vitest'
import { mockApi } from './test-utils'
import { planApi } from './api'

describe('planApi', () => {
  it('asks for a date range only when given one', async () => {
    const api = mockApi({ 'GET /api/plan': { today: '', horizonDays: 7, updating: false, slots: [] }, 'GET /api/plan?from=2026-11-10&to=2026-11-12': { today: '', horizonDays: 7, updating: false, slots: [] } })
    await planApi.view()
    await planApi.view('2026-11-10', '2026-11-12')
    expect(api.calls.map((c) => c.path)).toEqual(['/api/plan', '/api/plan?from=2026-11-10&to=2026-11-12'])
  })

  it('cooked sends the edited portions only when given', async () => {
    const api = mockApi({ 'POST /api/plan/2026-11-09/2/cooked': { meal: {}, leftover: null, warnings: [] } })
    await planApi.cooked({ date: '2026-11-09', mealSlotId: 2 })
    await planApi.cooked({ date: '2026-11-09', mealSlotId: 2 }, 1.5)
    expect(api.calls.map((c) => c.body)).toEqual([{}, { leftoverPortions: 1.5 }])
  })

  it('percent-encodes a Variety Rule Tag', async () => {
    const api = mockApi({ 'PUT /api/variety-rules/quick%20meals': { tag: 'quick meals', maxPerWeek: 1, notConsecutiveDays: false } })
    await planApi.setVarietyRule({ tag: 'quick meals', maxPerWeek: 1, notConsecutiveDays: false })
    expect(api.calls[0]?.path).toBe('/api/variety-rules/quick%20meals')
  })
})
