// B5-BOW: the Regenerate dry run (POST /api/plan/regenerate?dryRun=1) names the Bought Planned Meals and writes nothing.
import { describe, expect, it } from 'vitest'
import { planApi } from './api'
import { mockApi } from './test-utils'

const answer = {
  replaces: 3,
  bought: [{ date: '2026-11-10', mealSlotName: 'Dinner', courseName: 'Main', recipeName: 'Roast chicken', ingredients: ['chicken thighs', 'cream'] }],
}

describe('planApi.regenerateDryRun', () => {
  it('POSTs ?dryRun=1 and answers the count and the Bought rows', async () => {
    const api = mockApi({ 'POST /api/plan/regenerate?dryRun=1': answer })
    await expect(planApi.regenerateDryRun()).resolves.toEqual(answer)
    expect(api.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['POST /api/plan/regenerate?dryRun=1'])
  })

  it('the real regenerate still POSTs the plain route', async () => {
    const api = mockApi({ 'POST /api/plan/regenerate': undefined })
    await planApi.regenerate()
    expect(api.calls.map((c) => c.path)).toEqual(['/api/plan/regenerate'])
  })

  it('a failed dry run rejects', async () => {
    mockApi({ 'POST /api/plan/regenerate?dryRun=1': { status: 500, json: { error: { code: 'x', message: 'boom' } } } })
    await expect(planApi.regenerateDryRun()).rejects.toBeTruthy()
  })
})
