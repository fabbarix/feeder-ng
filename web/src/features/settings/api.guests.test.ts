// B5-F1 (docs/dev/design/b5-sd.md section 3): PUT .../attendance takes guests; the plan read behind "Dates that differ".
import { afterEach, describe, expect, it, vi } from 'vitest'
import { settingsApi } from './api'
import { mockApi } from './test-utils'

afterEach(() => vi.unstubAllGlobals())
const PATH = '/api/meal-slots/11/attendance?date=2026-11-12'
const att = { slotId: 11, date: '2026-11-12', isOverride: true, attendance: [], portionsNeeded: 2, guests: 2 }

describe('settingsApi guests', () => {
  it('sends guests with the Attendance', async () => {
    const api = mockApi({ [`PUT ${PATH}`]: att })
    await settingsApi.saveAttendance(11, '2026-11-12', [{ memberId: 1, portionFactorOverride: null }], undefined, 2)
    expect(api.callsTo('PUT', PATH)[0]?.body).toEqual({ attendance: [{ memberId: 1, portionFactorOverride: null }], guests: 2 })
  })

  it('guests alone is a valid save, and 0 is sent (taking the Guests off)', async () => {
    const api = mockApi({ [`PUT ${PATH}`]: att })
    await settingsApi.saveAttendance(11, '2026-11-12', undefined, undefined, 0)
    expect(api.callsTo('PUT', PATH)[0]?.body).toEqual({ guests: 0 })
  })

  it('leaves guests out when not given (as before)', async () => {
    const api = mockApi({ [`PUT ${PATH}`]: att })
    await settingsApi.saveAttendance(11, '2026-11-12', [], undefined)
    expect(api.callsTo('PUT', PATH)[0]?.body).toEqual({ attendance: [] })
  })

  it('reads the plan\'s slots', async () => {
    const api = mockApi({ 'GET /api/plan': { slots: [] } })
    await expect(settingsApi.planDates()).resolves.toEqual({ slots: [] })
    expect(api.calls).toHaveLength(1)
  })
})
