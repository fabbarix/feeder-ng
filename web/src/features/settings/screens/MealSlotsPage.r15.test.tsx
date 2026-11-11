// R15 on the Meal Slots page: multi-day edit through one API call, attendee pills, desktop grid, deep link.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { anna, householdSettings, marco, mondayLunch, sam, thursdayDinner, tuesdayDinner } from '../components/fixtures'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import { MealSlotsPage } from './MealSlotsPage'

const wednesdayDinner = { ...tuesdayDinner, id: 13, weekday: 3 }
const slots = [mondayLunch, { ...tuesdayDinner, id: 9, weekday: 1 }, tuesdayDinner, wednesdayDinner, thursdayDinner]

function routes(me: typeof ADMIN_ME, extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/me': me,
    'GET /api/household/settings': householdSettings,
    'GET /api/members': [anna, marco, sam],
    'GET /api/meal-slots': slots,
    ...extra,
  })
}
function viewport(desktop: boolean) {
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: desktop && q.includes('1024'), media: q, addEventListener() {}, removeEventListener() {} }))
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12, 0) })
  window.location.hash = ''
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MealSlotsPage: edit on several days', () => {
  it('Dinner on Mon, Tue, Wed is one atomic PATCH /api/meal-slots/batch and a result message', async () => {
    viewport(false)
    const api = routes(ADMIN_ME, {
      'PATCH /api/meal-slots/batch': (c: { body: { weekdays: number[] } }) => ({
        match: 'Dinner',
        updated: c.body.weekdays.map((weekday, i) => ({ ...tuesdayDinner, id: 9 + i, weekday, time: '20:00' })),
        skipped: [],
      }),
    })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('group', { name: 'Tuesday' })).getByRole('button', { name: 'Dinner 19:30' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Monday' }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Wednesday' }))
    expect(within(dialog).getByText('Update Dinner on Mon, Tue, Wed')).toBeInTheDocument()
    within(dialog).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('2000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/meal-slots/batch')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/meal-slots/batch')[0]!.body).toEqual({ match: 'Dinner', weekdays: [1, 2, 3], set: { time: '20:00' } })
    expect(api.calls.filter((c) => c.method === 'PATCH' && /\/meal-slots\/\d+$/.test(c.path))).toHaveLength(0)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit Meal Slot' })).toBeNull())
    expect(await screen.findByText('Updated Dinner on Mon, Tue, Wed.')).toBeInTheDocument()
  })

  it('a chosen day without a Dinner is skipped and the message says so', async () => {
    viewport(false)
    routes(ADMIN_ME, {
      'PATCH /api/meal-slots/batch': { match: 'Dinner', updated: [{ ...tuesdayDinner, time: '20:00' }], skipped: [{ weekday: 5, reason: 'no_slot' }] },
    })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('group', { name: 'Tuesday' })).getByRole('button', { name: 'Dinner 19:30' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'Friday' }))
    expect(within(dialog).getByText('Fri skipped: no Dinner')).toBeInTheDocument()
    within(dialog).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('2000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    expect(await screen.findByText('Updated Dinner on Tue. Fri has no Dinner, so it was skipped.')).toBeInTheDocument()
  })

  it('after a rename the success message uses the new name', async () => {
    viewport(false)
    routes(ADMIN_ME, {
      'PATCH /api/meal-slots/batch': { match: 'Dinner', updated: [{ ...tuesdayDinner, name: 'Supper' }], skipped: [] },
    })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('group', { name: 'Tuesday' })).getByRole('button', { name: 'Dinner 19:30' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    const name = within(dialog).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Supper')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    expect(await screen.findByText('Updated Supper on Tue.')).toBeInTheDocument()
  })

  it('a refused batch keeps the sheet open with the server message (nothing was saved)', async () => {
    viewport(false)
    routes(ADMIN_ME, {
      'PATCH /api/meal-slots/batch': { status: 409, json: { error: { code: 'duplicate_slot', message: 'A Meal Slot with that name already exists on that weekday' } } },
    })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('group', { name: 'Tuesday' })).getByRole('button', { name: 'Dinner 19:30' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    const name = within(dialog).getByLabelText('Name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Lunch')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/)
    expect(screen.getByRole('dialog', { name: 'Edit Meal Slot' })).toBeInTheDocument()
  })
})

describe('MealSlotsPage: overview', () => {
  it('below 1024 px it is the list with attendee pills and "Nobody attending"', async () => {
    viewport(false)
    routes(USER_ME)
    renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByRole('group', { name: 'Tuesday' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(within(screen.getByRole('group', { name: 'Tuesday' })).getByRole('list', { name: 'Attending Dinner on Tuesday' })).toBeInTheDocument()
    expect(within(screen.getByRole('group', { name: 'Monday' })).getByRole('button', { name: /^Nobody attending/ })).toBeInTheDocument()
  })

  it('from 1024 px it is the week grid, days as columns', async () => {
    viewport(true)
    routes(USER_ME)
    renderWithProviders(<MealSlotsPage />)
    const table = await screen.findByRole('table', { name: 'Meal Slots by weekday' })
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent).filter(Boolean)).toContain('Thu')
    expect(screen.queryByRole('group', { name: 'Tuesday' })).toBeNull()
  })

  it('on the grid, the add button of a row opens the sheet with that row\'s name and weekday', async () => {
    viewport(true)
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Dinner on Friday' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Meal Slot' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Dinner')
    expect(within(dialog).getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('an Admin taps "Nobody attending" and gets the slot sheet to choose who attends', async () => {
    viewport(false)
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: /^Nobody attending/ }))
    expect(await screen.findByRole('dialog', { name: 'Edit Meal Slot' })).toBeInTheDocument()
  })

  it('a link to /settings/meal-slots#meal-slot-12 scrolls to that Meal Slot and focuses it', async () => {
    viewport(false)
    const scroll = vi.fn()
    Element.prototype.scrollIntoView = scroll
    window.location.hash = '#meal-slot-12'
    routes(USER_ME)
    renderWithProviders(<MealSlotsPage />, '/settings/meal-slots#meal-slot-12')
    await screen.findByRole('group', { name: 'Monday' })
    await waitFor(() => expect(scroll).toHaveBeenCalled())
    expect(document.getElementById('meal-slot-12')).toHaveFocus()
  })
})

describe('MealSlotsPage: plain User', () => {
  it('taps "Nobody attending" and gets the one-date Attendance for that slot', async () => {
    viewport(false)
    const url = '/api/meal-slots/12/attendance?date=2026-11-09'
    routes(USER_ME, { [`GET ${url}`]: { slotId: 12, date: '2026-11-09', isOverride: false, attendance: [], portionsNeeded: 0 } })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: /^Nobody attending/ }))
    expect(await screen.findByRole('dialog', { name: 'Lunch on 2026-11-09' })).toBeInTheDocument()
  })
})
