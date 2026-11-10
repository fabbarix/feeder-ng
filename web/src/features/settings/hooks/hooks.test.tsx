import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ADMIN_ME, mockApi, USER_ME, wrapper } from '../test-utils'
import type { HouseholdSettings, Member, MealSlot } from '../types'
import { useAllowlist } from './useAllowlist'
import { useAttendance } from './useAttendance'
import { useHouseholdSettings } from './useHouseholdSettings'
import { useMealSlots } from './useMealSlots'
import { useMembers } from './useMembers'
import { usePreferences } from './usePreferences'
import { usePreferenceTheme } from './usePreferenceTheme'

afterEach(() => vi.unstubAllGlobals())

const settings: HouseholdSettings = {
  timeZone: 'UTC', timeZoneConfigured: false, planningHorizonDays: 7, defaultCooldownDays: 7, defaultLeftoverUseByDays: 3,
  quietHours: { start: '22:00', end: '07:00' }, plannerStyle: 0.5, location: null, currency: 'USD',
}
const sam: Member = { id: 3, name: 'Sam', colour: '#e07a5f', avatar: '', portionFactor: 0.5, userId: null }
const dinner: MealSlot = { id: 1, weekday: 4, name: 'Dinner', time: '19:00', attendance: [{ memberId: 3, portionFactorOverride: null }], portionsNeeded: 0.5 }

describe('useHouseholdSettings', () => {
  it('loads the settings', async () => {
    mockApi({ 'GET /api/household/settings': settings })
    const { result } = renderHook(() => useHouseholdSettings(), { wrapper })
    await waitFor(() => expect(result.current.isPending).toBe(false))
    expect(result.current.settings).toEqual(settings)
  })

  it('save PUTs the body and shows the saved value', async () => {
    let current = settings
    const api = mockApi({
      'GET /api/household/settings': () => current,
      'PUT /api/household/settings': (c: { body: unknown }) => {
        current = { ...(c.body as object), timeZoneConfigured: true } as HouseholdSettings
        return current
      },
    })
    const { result } = renderHook(() => useHouseholdSettings(), { wrapper })
    await waitFor(() => expect(result.current.settings).toBeDefined())
    const { timeZoneConfigured: _ignored, ...input } = settings
    void _ignored
    await act(() => result.current.save({ ...input, planningHorizonDays: 14 }))
    expect(api.callsTo('PUT', '/api/household/settings')[0]!.body).toMatchObject({ planningHorizonDays: 14 })
    await waitFor(() => expect(result.current.settings?.planningHorizonDays).toBe(14))
    expect(result.current.settings?.timeZoneConfigured).toBe(true)
  })

  it('save rejects with the server error', async () => {
    mockApi({
      'GET /api/household/settings': settings,
      'PUT /api/household/settings': { status: 422, json: { error: { code: 'validation_failed', message: 'planningHorizonDays: must be between 1 and 28' } } },
    })
    const { result } = renderHook(() => useHouseholdSettings(), { wrapper })
    await waitFor(() => expect(result.current.settings).toBeDefined())
    const { timeZoneConfigured: _ignored, ...input } = settings
    void _ignored
    await expect(result.current.save({ ...input, planningHorizonDays: 40 })).rejects.toMatchObject({ code: 'validation_failed', status: 422 })
  })
})

describe('useMembers', () => {
  it('lists, creates, updates and links Members', async () => {
    let list: Member[] = [sam]
    const api = mockApi({
      'GET /api/members': () => list,
      'POST /api/members': (c: { body: unknown }) => {
        const m = { ...(c.body as object), id: 4, userId: null } as Member
        list = [...list, m]
        return { status: 201, json: m }
      },
      'PATCH /api/members/3': (c: { body: unknown }) => ({ ...sam, ...(c.body as object) }),
      'PUT /api/members/3/user': { ...sam, userId: 2 },
    })
    const { result } = renderHook(() => useMembers(), { wrapper })
    await waitFor(() => expect(result.current.members).toHaveLength(1))
    await act(() => result.current.create({ name: 'Anna', colour: '#3366cc', avatar: '', portionFactor: 1 }))
    await waitFor(() => expect(result.current.members).toHaveLength(2))
    await act(() => result.current.update(3, { name: 'Samuel', colour: '#e07a5f', avatar: '', portionFactor: 0.75 }))
    expect(api.callsTo('PATCH', '/api/members/3')[0]!.body).toMatchObject({ name: 'Samuel', portionFactor: 0.75 })
    await act(() => result.current.linkUser(3, 2))
    expect(api.callsTo('PUT', '/api/members/3/user')[0]!.body).toEqual({ userId: 2 })
  })

  it('removing a Member refreshes the Meal Slots', async () => {
    const api = mockApi({
      'GET /api/members': [sam],
      'GET /api/meal-slots': [dinner],
      'DELETE /api/members/3': { status: 204 },
    })
    const { result } = renderHook(() => ({ members: useMembers(), slots: useMealSlots() }), { wrapper })
    await waitFor(() => expect(result.current.slots.slots).toHaveLength(1))
    await act(() => result.current.members.remove(3))
    await waitFor(() => expect(api.callsTo('GET', '/api/meal-slots').length).toBeGreaterThanOrEqual(2))
  })
})

describe('useMealSlots', () => {
  it('creates, updates and removes Meal Slots', async () => {
    const api = mockApi({
      'GET /api/meal-slots': [dinner],
      'POST /api/meal-slots': { status: 201, json: { ...dinner, id: 2 } },
      'PATCH /api/meal-slots/1': dinner,
      'DELETE /api/meal-slots/1': { status: 204 },
    })
    const { result } = renderHook(() => useMealSlots(), { wrapper })
    await waitFor(() => expect(result.current.slots).toHaveLength(1))
    const input = { weekday: 4, name: 'Dinner', time: '19:00', attendance: [] }
    await act(() => result.current.create(input))
    await act(() => result.current.update(1, input))
    await act(() => result.current.remove(1))
    expect(api.callsTo('POST', '/api/meal-slots')[0]!.body).toEqual(input)
    expect(api.callsTo('PATCH', '/api/meal-slots/1')).toHaveLength(1)
    expect(api.callsTo('DELETE', '/api/meal-slots/1')).toHaveLength(1)
  })
})

describe('useAttendance', () => {
  const url = '/api/meal-slots/1/attendance?date=2026-11-12'
  const day = { slotId: 1, date: '2026-11-12', isOverride: false, attendance: dinner.attendance, portionsNeeded: 0.5 }

  it('makes no request without a slot and date', () => {
    const api = mockApi({})
    renderHook(() => useAttendance(null, null), { wrapper })
    expect(api.calls).toHaveLength(0)
  })

  it('loads a date, saves an override and resets it', async () => {
    const api = mockApi({
      'GET /api/meal-slots/1/attendance?date=2026-11-12': day,
      'GET /api/meal-slots': [dinner],
      [`PUT ${url}`]: { ...day, isOverride: true, attendance: [], portionsNeeded: 0 },
      [`DELETE ${url}`]: { status: 204 },
    })
    const { result } = renderHook(() => useAttendance(1, '2026-11-12'), { wrapper })
    await waitFor(() => expect(result.current.attendance).toEqual(day))
    await act(() => result.current.save([]))
    expect(api.callsTo('PUT', url)[0]!.body).toEqual({ attendance: [] })
    await act(() => result.current.reset())
    expect(api.callsTo('DELETE', url)).toHaveLength(1)
  })
})

describe('useAllowlist', () => {
  it('does not fetch for a plain User', () => {
    const api = mockApi({})
    renderHook(() => useAllowlist(false), { wrapper })
    expect(api.calls).toHaveLength(0)
  })

  it('lists, adds, promotes and removes', async () => {
    const api = mockApi({
      'GET /api/allowlist': [ADMIN_ME, USER_ME],
      'POST /api/allowlist': { status: 201, json: { id: 3, email: 'nonna@example.test', displayName: 'nonna', isAdmin: false } },
      'PATCH /api/allowlist/2': { ...USER_ME, isAdmin: true },
      'DELETE /api/allowlist/2': { status: 204 },
    })
    const { result } = renderHook(() => useAllowlist(true), { wrapper })
    await waitFor(() => expect(result.current.users).toHaveLength(2))
    await act(() => result.current.add('nonna@example.test'))
    expect(api.callsTo('POST', '/api/allowlist')[0]!.body).toEqual({ email: 'nonna@example.test' })
    await act(() => result.current.setAdmin(2, true))
    expect(api.callsTo('PATCH', '/api/allowlist/2')[0]!.body).toEqual({ isAdmin: true })
    await act(() => result.current.remove(2))
    expect(api.callsTo('DELETE', '/api/allowlist/2')).toHaveLength(1)
  })

  it('surfaces last_admin as a rejection', async () => {
    mockApi({
      'GET /api/allowlist': [ADMIN_ME],
      'DELETE /api/allowlist/1': { status: 409, json: { error: { code: 'last_admin', message: 'no' } } },
    })
    const { result } = renderHook(() => useAllowlist(true), { wrapper })
    await waitFor(() => expect(result.current.users).toHaveLength(1))
    await expect(result.current.remove(1)).rejects.toMatchObject({ code: 'last_admin' })
  })
})

describe('usePreferences', () => {
  it('starts from the defaults, then shows the saved value', async () => {
    const saved = { scheme: 'dark', accent: '#3366cc', units: 'imperial' }
    const api = mockApi({ 'GET /api/me/preferences': saved, 'PUT /api/me/preferences': (c: { body: unknown }) => c.body })
    const { result } = renderHook(() => usePreferences(), { wrapper })
    expect(result.current.preferences).toEqual({ scheme: 'system', accent: '#3f7d58', units: 'metric' })
    await waitFor(() => expect(result.current.preferences).toEqual(saved))
    await act(() => result.current.save({ ...result.current.preferences, units: 'metric' }))
    expect(api.callsTo('PUT', '/api/me/preferences')[0]!.body).toMatchObject({ units: 'metric' })
  })
})

describe('usePreferenceTheme', () => {
  it('uses the defaults and does not fetch preferences while signed out', async () => {
    const api = mockApi({ 'GET /api/me': { status: 401, json: { error: { code: 'unauthenticated', message: 'x' } } } })
    const { result } = renderHook(() => usePreferenceTheme(), { wrapper })
    await waitFor(() => expect(api.callsTo('GET', '/api/me')).toHaveLength(1))
    expect(result.current).toEqual({ accent: '#3f7d58', scheme: 'system' })
    expect(api.callsTo('GET', '/api/me/preferences')).toHaveLength(0)
  })

  it('follows the signed-in User preferences', async () => {
    mockApi({
      'GET /api/me': USER_ME,
      'GET /api/me/preferences': { scheme: 'dark', accent: '#3366cc', secondary: '#ffb4a2', units: 'metric' },
    })
    const { result } = renderHook(() => usePreferenceTheme(), { wrapper })
    await waitFor(() => expect(result.current.accent).toBe('#3366cc'))
    // An old server may still send "secondary": it is dropped, not passed to the theme.
    expect(result.current).toStrictEqual({ accent: '#3366cc', scheme: 'dark' })
  })
})
