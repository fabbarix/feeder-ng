import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders, ADMIN_ME, USER_ME } from '../test-utils'
import { admin, anna, cook, householdSettings, marco, mondayLunch, sam, thursdayDinner } from './fixtures'
import { SettingsPage } from './SettingsPage'

const prefs = { scheme: 'system', accent: '#3f7d58', units: 'metric' }

function routes(me: typeof ADMIN_ME, extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/me': me,
    'GET /api/household/settings': householdSettings,
    'GET /api/members': [anna, marco, sam],
    'GET /api/meal-slots': [mondayLunch, thursdayDinner],
    'GET /api/allowlist': [admin, cook],
    'GET /api/me/preferences': prefs,
    ...extra,
  })
}

beforeEach(() => vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12, 0) }))
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('SettingsPage sections', () => {
  it('shows an Admin every section', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByRole('heading', { level: 1, name: 'Settings' })).toBeInTheDocument()
    for (const name of ['Household', 'Members', 'Meal Slots', 'Allowlist', 'Your preferences']) {
      expect(await screen.findByRole('heading', { level: 2, name })).toBeInTheDocument()
    }
    expect(await screen.findByRole('button', { name: 'Save household settings' })).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Add Member' })).toBeInTheDocument()
  })

  it('shows a plain User the Household read-only, no Allowlist, and their own preferences', async () => {
    const api = routes(USER_ME)
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByRole('heading', { level: 2, name: 'Your preferences' })).toBeInTheDocument()
    expect(await screen.findByLabelText('Planning Horizon (days)')).toBeDisabled()
    expect(screen.queryByRole('heading', { name: 'Allowlist' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Save household settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Member' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Add Meal Slot' })).toBeNull()
    expect(api.callsTo('GET', '/api/allowlist')).toHaveLength(0)
  })
})

describe('SettingsPage actions', () => {
  it('saves the Household settings and says so', async () => {
    const api = routes(ADMIN_ME, { 'PUT /api/household/settings': (c: { body: object }) => ({ ...c.body, timeZoneConfigured: true }) })
    renderWithProviders(<SettingsPage />)
    const horizon = await screen.findByLabelText('Planning Horizon (days)')
    await userEvent.clear(horizon)
    await userEvent.type(horizon, '14')
    await userEvent.click(screen.getByRole('button', { name: 'Save household settings' }))
    expect(await screen.findByText(/household settings saved/i)).toBeInTheDocument()
    expect(api.callsTo('PUT', '/api/household/settings')[0]!.body).toMatchObject({ planningHorizonDays: 14, timeZone: 'Europe/Rome' })
  })

  it('on first setup offers the browser time zone', async () => {
    routes(ADMIN_ME, { 'GET /api/household/settings': { ...householdSettings, timeZone: 'UTC', timeZoneConfigured: false } })
    renderWithProviders(<SettingsPage />)
    expect(await screen.findByText(/from your browser/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Time zone')).toHaveValue(Intl.DateTimeFormat().resolvedOptions().timeZone)
  })

  it('shows the server\'s reason when saving fails', async () => {
    routes(ADMIN_ME, {
      'PUT /api/household/settings': { status: 422, json: { error: { code: 'validation_failed', message: 'currency: must be a 3-letter code' } } },
    })
    renderWithProviders(<SettingsPage />)
    await screen.findByLabelText('Currency')
    await userEvent.click(screen.getByRole('button', { name: 'Save household settings' }))
    expect(await screen.findByText(/currency: must be a 3-letter code/)).toBeInTheDocument()
  })

  it('adds a Member through the sheet', async () => {
    let members = [anna]
    const api = routes(ADMIN_ME, {
      'GET /api/members': () => members,
      'POST /api/members': (c: { body: object }) => {
        const m = { ...c.body, id: 9, userId: null }
        members = [...members, m as typeof anna]
        return { status: 201, json: m }
      },
    })
    renderWithProviders(<SettingsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nonna')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.callsTo('POST', '/api/members')[0]!.body).toMatchObject({ name: 'Nonna', portionFactor: 1 })
    expect(await screen.findByText('Nonna')).toBeInTheDocument()
  })

  it('records "Sam is away Thursday" for one date', async () => {
    const url = '/api/meal-slots/11/attendance?date=2026-11-12'
    const day = { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5 }
    const api = routes(USER_ME, {
      [`GET ${url}`]: day,
      [`PUT ${url}`]: (c: { body: { attendance: unknown[] } }) => ({ ...day, isOverride: true, attendance: c.body.attendance, portionsNeeded: 2 }),
    })
    renderWithProviders(<SettingsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Change Dinner on a date (Thursday)' }))
    const dialog = await screen.findByRole('dialog', { name: 'Dinner on 2026-11-12' })
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Sam' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save for this date' }))
    await waitFor(() => expect(api.callsTo('PUT', url)).toHaveLength(1))
    expect(api.callsTo('PUT', url)[0]!.body).toEqual({ attendance: thursdayDinner.attendance.slice(0, 2) })
  })

  it('saves own preferences', async () => {
    const api = routes(USER_ME, { 'PUT /api/me/preferences': (c: { body: object }) => c.body })
    renderWithProviders(<SettingsPage />)
    await userEvent.click(await screen.findByRole('radio', { name: 'Dark' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/me/preferences')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/me/preferences')[0]!.body).toEqual({ ...prefs, scheme: 'dark', units: 'imperial' })
  })

  it('tells the Admin why the last Admin cannot be removed', async () => {
    routes(ADMIN_ME, {
      'GET /api/allowlist': [admin, { ...cook, isAdmin: true }],
      'DELETE /api/allowlist/2': { status: 409, json: { error: { code: 'last_admin', message: 'x' } } },
    })
    renderWithProviders(<SettingsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove cook@example.test' }))
    await userEvent.click(screen.getByRole('button', { name: 'Confirm remove cook@example.test' }))
    expect(await screen.findByText(/at least one Admin/i)).toBeInTheDocument()
  })
})

describe('settings feature route', () => {
  it('provides /settings', async () => {
    const { routes: featureRoutes } = await import('../index')
    expect(featureRoutes.map((r) => r.path)).toEqual(['/settings'])
  })
})
