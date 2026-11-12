// The Settings sub-pages (5.14): each page is one concern with a PageHeader, Settings breadcrumbs and the
// scenarios that used to live on the single long /settings page. All controls are ui primitives.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findNotice } from '../../../test/notices'
import { admin, anna, cook, householdSettings, marco, mondayLunch, sam, thursdayDinner } from '../components/fixtures'
import { ADMIN_ME, mockApi, openOptionNames, renderWithProviders, USER_ME } from '../test-utils'
import { AllowlistPage } from './AllowlistPage'
import { HouseholdPage } from './HouseholdPage'
import { MealSlotsPage } from './MealSlotsPage'
import { MembersPage } from './MembersPage'
import { PreferencesPage } from './PreferencesPage'

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

describe('every Settings sub-page', () => {
  it.each([
    ['Household', HouseholdPage, '/settings/household'],
    ['Members', MembersPage, '/settings/members'],
    ['Meal Slots', MealSlotsPage, '/settings/meal-slots'],
    ['Allowlist', AllowlistPage, '/settings/allowlist'],
    ['Your preferences', PreferencesPage, '/settings/preferences'],
  ] as const)('%s has its own h1 and a Settings breadcrumb to the index', async (title, Page, path) => {
    routes(ADMIN_ME)
    renderWithProviders(<Page />, path)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
    expect(screen.queryByRole('link', { name: /^back to/i })).toBeNull()
    // other concerns are not on this page
    for (const other of ['Household', 'Members', 'Meal Slots', 'Allowlist', 'Your preferences'].filter((t) => t !== title)) {
      expect(screen.queryByRole('heading', { level: 1, name: other })).toBeNull()
    }
  })
})

describe('HouseholdPage', () => {
  it('saves the Household settings and says so', async () => {
    const api = routes(ADMIN_ME, { 'PUT /api/household/settings': (c: { body: object }) => ({ ...c.body, timeZoneConfigured: true }) })
    renderWithProviders(<HouseholdPage />)
    const horizon = await screen.findByLabelText('Planning Horizon (days)')
    await userEvent.clear(horizon)
    await userEvent.type(horizon, '14')
    await userEvent.tab()
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(await findNotice('status', 'Household settings saved')).toBeInTheDocument()
    expect(api.callsTo('PUT', '/api/household/settings')[0]!.body).toMatchObject({ planningHorizonDays: 14, timeZone: 'Europe/Rome' })
  })

  it('on first setup offers the browser time zone', async () => {
    routes(ADMIN_ME, { 'GET /api/household/settings': { ...householdSettings, timeZone: 'UTC', timeZoneConfigured: false } })
    renderWithProviders(<HouseholdPage />)
    expect(await screen.findByText(/from your browser/i)).toBeInTheDocument()
  })

  it("shows the server's reason when saving fails", async () => {
    routes(ADMIN_ME, {
      'PUT /api/household/settings': { status: 422, json: { error: { code: 'validation_failed', message: 'currency: must be a 3-letter code' } } },
    })
    renderWithProviders(<HouseholdPage />)
    await screen.findByLabelText('Currency')
    await userEvent.click(screen.getByRole('button', { name: 'Save Household settings' }))
    expect(await findNotice('alert', 'currency: must be a 3-letter code')).toBeInTheDocument()
  })

  it('is read-only for a plain User', async () => {
    const api = routes(USER_ME)
    renderWithProviders(<HouseholdPage />)
    expect(await screen.findByLabelText('Planning Horizon (days)')).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Save Household settings' })).toBeNull()
    expect(api.callsTo('GET', '/api/allowlist')).toHaveLength(0)
  })

  it('carries the board coordinate hint (moved here from the board, section 6)', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<HouseholdPage />)
    expect(await screen.findByText(/sunset and sunrise/i)).toBeInTheDocument()
  })
})

describe('MembersPage', () => {
  it('lists Members with their Member colour on the avatar and Portion Factor trailing', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MembersPage />)
    const ring = (await screen.findByRole('img', { name: 'Anna' })).closest('[data-member-colour]')
    expect(ring).toHaveAttribute('data-member-colour', '#3366cc')
    expect(screen.getByText('×0.5')).toBeInTheDocument()
  })

  it('adds a Member through the sheet with a colour swatch', async () => {
    let members = [anna]
    const api = routes(ADMIN_ME, {
      'GET /api/members': () => members,
      'POST /api/members': (c: { body: object }) => {
        const m = { ...c.body, id: 9, userId: null }
        members = [...members, m as typeof anna]
        return { status: 201, json: m }
      },
    })
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Member' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Member' })
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Nonna')
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Terracotta' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Member' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(api.callsTo('POST', '/api/members')[0]!.body).toMatchObject({ name: 'Nonna', portionFactor: 1, colour: '#e07a5f' })
    expect(await screen.findByText('Nonna')).toBeInTheDocument()
  })

  it('does not offer a User who is already linked to another Member (QA)', async () => {
    routes(ADMIN_ME) // anna is linked to User 2 (Cook)
    renderWithProviders(<MembersPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Sam' }))
    await userEvent.click(within(screen.getByRole('dialog', { name: 'Edit Member' })).getByRole('combobox', { name: /Linked User/ }))
    const names = openOptionNames()
    expect(names).not.toContain('Cook')
    expect(names).toContain('Admin (you)') // ADMIN_ME is the signed-in User
  })

  it('is read-only for a plain User: no add, rows are not buttons', async () => {
    routes(USER_ME)
    renderWithProviders(<MembersPage />)
    await screen.findByText('Anna')
    expect(screen.queryByRole('button', { name: 'Add Member' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Anna' })).toBeNull()
  })
})

describe('MealSlotsPage', () => {
  // One card per Meal Slot name at every width (the cards are covered in MealSlotsPage.cards.test.tsx).
  beforeEach(() => vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })))

  it('shows a card per name, and a plain User cannot add', async () => {
    routes(USER_ME)
    renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByRole('region', { name: 'Lunch' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Dinner' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Add / })).toBeNull()
  })

  it('adds one Meal Slot on several weekdays at once (QA)', async () => {
    let slots = [mondayLunch]
    let nextId = 50
    const api = routes(ADMIN_ME, {
      'GET /api/meal-slots': () => slots,
      'POST /api/meal-slots': (c: { body: { weekday: number } }) => {
        const created = { ...c.body, id: nextId++, portionsNeeded: 0 } as typeof mondayLunch
        slots = [...slots, created]
        return { status: 201, json: created }
      },
    })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Meal Slot' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Meal Slot' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Friday' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Saturday' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sunday' }))
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Brunch')
    within(dialog).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('1100')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/meal-slots')).toHaveLength(3))
    expect(api.callsTo('POST', '/api/meal-slots').map((c) => (c.body as { weekday: number }).weekday)).toEqual([5, 6, 7])
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(within(await screen.findByRole('region', { name: 'Brunch' })).getByRole('button', { name: 'Brunch on Sunday' })).toBeInTheDocument()
  })

  it('when one weekday fails, keeps the sheet open and says which weekday and how many were saved', async () => {
    let calls = 0
    routes(ADMIN_ME, {
      'POST /api/meal-slots': (c: { body: { weekday: number } }) =>
        ++calls === 2
          ? { status: 409, json: { error: { code: 'conflict', message: 'That weekday already has a Meal Slot with this name.' } } }
          : { status: 201, json: { ...c.body, id: 60 + calls, portionsNeeded: 0 } },
    })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Meal Slot' }))
    const dialog = screen.getByRole('dialog', { name: 'Add Meal Slot' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Monday' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Tuesday' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Wednesday' }))
    await userEvent.type(within(dialog).getByLabelText('Name'), 'Dinner')
    within(dialog).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('1930')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    const alert = await within(dialog).findByRole('alert')
    expect(alert).toHaveTextContent(/Tuesday/)
    expect(alert).toHaveTextContent(/already has a Meal Slot/)
    expect(alert).toHaveTextContent(/1 of 3/)
    expect(screen.getByRole('dialog', { name: 'Add Meal Slot' })).toBeInTheDocument()
  })

  it('records "Sam is away Thursday" for one date; a plain User taps "Change a date" on the Dinner card', async () => {
    const url = '/api/meal-slots/11/attendance?date=2026-11-12'
    const day = { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5 }
    const api = routes(USER_ME, {
      [`GET ${url}`]: day,
      [`PUT ${url}`]: (c: { body: { attendance: unknown[] } }) => ({ ...day, isOverride: true, attendance: c.body.attendance, portionsNeeded: 2 }),
    })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Change a date for Dinner' }))
    const dialog = await screen.findByRole('dialog', { name: 'Dinner on 2026-11-12' })
    await userEvent.click(await within(dialog).findByRole('checkbox', { name: 'Sam' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save for this date' }))
    await waitFor(() => expect(api.callsTo('PUT', url)).toHaveLength(1))
    expect(api.callsTo('PUT', url)[0]!.body).toEqual({ attendance: thursdayDinner.attendance.slice(0, 2) })
  })

  it('an Admin tapping a day gets the MealSlot sheet, which leads to "Change a date"', async () => {
    const url = '/api/meal-slots/11/attendance?date=2026-11-12'
    routes(ADMIN_ME, { [`GET ${url}`]: { slotId: 11, date: '2026-11-12', isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5 } })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner on Thursday' }))
    expect(await screen.findByRole('dialog', { name: 'Edit Meal Slot' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Change a date' }))
    expect(await screen.findByRole('dialog', { name: 'Dinner on 2026-11-12' })).toBeInTheDocument()
  })

  it('edits an existing slot through one batch call that cannot move it to another weekday', async () => {
    const api = routes(ADMIN_ME, { 'PATCH /api/meal-slots/batch': () => ({ match: 'Lunch', updated: [{ ...mondayLunch, time: '13:00' }], skipped: [] }) })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Lunch on Monday' }))
    expect(screen.queryByRole('combobox', { name: /Weekday/ })).toBeNull()
    screen.getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('1300')
    await userEvent.click(screen.getByRole('button', { name: 'Save Meal Slot' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/meal-slots/batch')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/meal-slots/batch')[0]!.body).toEqual({ match: 'Lunch', weekdays: [1], set: { time: '13:00' } })
    expect(api.callsTo('PATCH', '/api/meal-slots/12')).toHaveLength(0)
  })
})

describe('AllowlistPage', () => {
  it('tells a plain User it is for Admins and never fetches the list', async () => {
    const api = routes(USER_ME)
    renderWithProviders(<AllowlistPage />)
    expect(await screen.findByText('Only an Admin can see the Allowlist.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Email to allow')).toBeNull()
    expect(api.callsTo('GET', '/api/allowlist')).toHaveLength(0)
  })

  it('tells the Admin why the last Admin cannot be removed, after a ConfirmDialog', async () => {
    routes(ADMIN_ME, {
      'GET /api/allowlist': [admin, { ...cook, isAdmin: true }],
      'DELETE /api/allowlist/2': { status: 409, json: { error: { code: 'last_admin', message: 'x' } } },
    })
    renderWithProviders(<AllowlistPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Remove cook@example.test' }))
    await userEvent.click(within(await screen.findByRole('dialog', { name: 'Remove cook@example.test?' })).getByRole('button', { name: 'Remove' }))
    expect(await screen.findByText(/at least one Admin/i)).toBeInTheDocument()
  })
})

describe('PreferencesPage', () => {
  it('saves own preferences with Segmented controls', async () => {
    const api = routes(USER_ME, { 'PUT /api/me/preferences': (c: { body: object }) => c.body })
    renderWithProviders(<PreferencesPage />)
    await userEvent.click(await screen.findByRole('radio', { name: 'Dark' }))
    await userEvent.click(screen.getByRole('radio', { name: 'Imperial' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save preferences' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/me/preferences')).toHaveLength(1))
    expect(api.callsTo('PUT', '/api/me/preferences')[0]!.body).toEqual({ ...prefs, scheme: 'dark', units: 'imperial' })
    expect(await findNotice('status', 'Preferences saved')).toBeInTheDocument()
  })
})
