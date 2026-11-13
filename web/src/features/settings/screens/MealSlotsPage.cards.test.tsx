// MS redesign (beta.5): Settings > Meal Slots as one Bento card per Meal Slot name. The mockups' Household: Mia and Fabio.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { householdSettings } from '../components/fixtures'
import { fabio, mia, sixMembers } from '../components/mealSlotCardFixtures'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import type { MealSlot } from '../types'
import { MealSlotsPage } from './MealSlotsPage'

const both = [mia, fabio].map((m) => ({ memberId: m.id, portionFactorOverride: null }))
const main = { id: 1, name: 'Main', main: true, optional: false, optOutMemberIds: [] }
const side = { id: 2, name: 'Side', main: false, optional: false, optOutMemberIds: [] }
let id = 500
const slot = (weekday: number, name: string, time: string, o: Partial<MealSlot> = {}): MealSlot => ({
  id: id++, weekday, name, time, portionsNeeded: 2, attendance: both, courses: [main, side], ...o,
})
/** Dinner every day (Wed Fabio only, Fri 20:00 and Main only); Breakfast Sat 09:00 and Sun 09:30; Lunch on Sunday. */
const household = (): MealSlot[] => [
  ...[1, 2, 3, 4, 5, 6, 7].map((d) => slot(d, 'Dinner', d === 5 ? '20:00' : '19:30', d === 3 ? { attendance: [both[1]!] } : d === 5 ? { courses: [main] } : {})),
  slot(6, 'Breakfast', '09:00', { courses: [main] }),
  slot(7, 'Breakfast', '09:30', { courses: [main] }),
  slot(7, 'Lunch', '13:00'),
]

function routes(me: typeof ADMIN_ME, slots: MealSlot[] = household(), members = [mia, fabio], extra: Record<string, unknown> = {}) {
  return mockApi({
    'GET /api/me': me,
    'GET /api/household/settings': householdSettings,
    'GET /api/members': members,
    'GET /api/meal-slots': slots,
    ...extra,
  })
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12, 0) }) // Monday 9 Nov 2026
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
  window.location.hash = ''
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MealSlotsPage: the cards', () => {
  it('shows the Household line once, then Breakfast, Lunch and Dinner in time order and no "Dates that differ" tile', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await screen.findByRole('region', { name: 'Dinner' })
    expect(screen.getAllByText('Everyone eats unless a Meal Slot says otherwise')).toHaveLength(1)
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Breakfast', 'Lunch', 'Dinner'])
  })

  it('Dinner shows 19:30 as the usual time, and Breakfast 09:00 (the Saturday value wins the tie)', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    const dinner = await screen.findByRole('region', { name: 'Dinner' })
    expect(within(dinner).getByTestId('usual-time')).toHaveTextContent('19:30')
    expect(within(dinner).getByText('Every day')).toBeInTheDocument()
    const breakfast = screen.getByRole('region', { name: 'Breakfast' })
    expect(within(breakfast).getByText('Weekend')).toBeInTheDocument()
    expect(within(breakfast).getByTestId('usual-time')).toHaveTextContent('09:00')
  })

  it('Dinner lists Wednesday and Friday under "Differs on"', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    const dinner = await screen.findByRole('region', { name: 'Dinner' })
    const rows = within(within(dinner).getByRole('list', { name: 'Differs on' })).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Fabio only')
    expect(rows[1]).toHaveTextContent('20:00')
    expect(rows[1]).toHaveTextContent('Main only')
  })

  it('does not render "Dates that differ" when no upcoming date differs (or the plan cannot be read); MealSlotsPage.dates.test covers the filled tile', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await screen.findByRole('region', { name: 'Dinner' })
    expect(screen.queryByRole('region', { name: 'Dates that differ' })).toBeNull()
    expect(screen.queryByText('Dates that differ')).toBeNull()
    expect(screen.queryByText('No upcoming date differs from the usual.')).toBeNull()
  })

  it('shows the empty state and the header button when there is no Meal Slot yet', async () => {
    routes(ADMIN_ME, [])
    renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByText('No Meal Slots yet')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add Meal Slot' })).toBeEnabled()
    expect(screen.queryByText('Everyone eats unless a Meal Slot says otherwise')).toBeNull()
  })

  it('shows a loading status first', () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    expect(screen.getByText('Loading')).toBeInTheDocument()
  })
})

describe('MealSlotsPage: the header "Add Meal Slot"', () => {
  it('is one primary button in the page header (an Admin), and no other button has that name', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await screen.findByRole('region', { name: 'Dinner' })
    const buttons = screen.getAllByRole('button', { name: 'Add Meal Slot' })
    expect(buttons).toHaveLength(1)
    expect(buttons[0]!.closest('header')).not.toBeNull()
  })

  it('opens the add sheet', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Add Meal Slot' }))
    expect(await screen.findByRole('dialog', { name: 'Add Meal Slot' })).toBeInTheDocument()
  })

  it('is disabled until the Members have loaded (a new slot would start with nobody)', async () => {
    routes(ADMIN_ME, household(), [mia, fabio], { 'GET /api/members': () => new Promise(() => {}) })
    renderWithProviders(<MealSlotsPage />)
    expect(await screen.findByRole('button', { name: 'Add Meal Slot' })).toBeDisabled()
  })

  it('a plain User does not see it', async () => {
    routes(USER_ME)
    renderWithProviders(<MealSlotsPage />)
    await screen.findByRole('region', { name: 'Dinner' })
    expect(screen.queryByRole('button', { name: 'Add Meal Slot' })).toBeNull()
  })
})

describe('MealSlotsPage: Admin actions on a card', () => {
  it('"Edit Dinner" opens the sheet on the usual Dinner, which can apply to all days with Dinner', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Edit Dinner' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Dinner')
    expect(within(dialog).getByRole('button', { name: 'All days with Dinner' })).toBeInTheDocument()
  })

  it('a row of "Differs on" opens that weekday\'s Meal Slot (Friday: 20:00)', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Edit Dinner on Friday: 20:00, Main only' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    expect(within(dialog).getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(dialog).getByRole('spinbutton', { name: 'Hour' })).toHaveValue('20')
  })

  it('a dashed "+" on a free Lunch day opens the add sheet for Lunch on that weekday', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Lunch' })).getByRole('button', { name: 'Add Lunch on Tuesday' }))
    const dialog = await screen.findByRole('dialog', { name: 'Add Meal Slot' })
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Lunch')
    expect(within(dialog).getByRole('button', { name: 'Tuesday' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('"Change a date" on Lunch opens the one-date Attendance for the next Sunday (15 Nov)', async () => {
    const lunch = household().find((s) => s.name === 'Lunch')!
    const url = `/api/meal-slots/${lunch.id}/attendance?date=2026-11-15`
    routes(ADMIN_ME, [lunch], [mia, fabio], { [`GET ${url}`]: { slotId: lunch.id, date: '2026-11-15', isOverride: false, attendance: both, portionsNeeded: 2 } })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Change a date for Lunch' }))
    expect(await screen.findByRole('dialog', { name: 'Lunch on 2026-11-15' })).toBeInTheDocument()
  })

  it('saves a multi-day edit through one batch call, as before', async () => {
    const api = routes(ADMIN_ME, household(), [mia, fabio], { 'PATCH /api/meal-slots/batch': { match: 'Dinner', updated: [], skipped: [] } })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Edit Dinner' }))
    const dialog = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'All days with Dinner' }))
    within(dialog).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('2000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save Meal Slot' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/meal-slots/batch')).toHaveLength(1))
    expect((api.callsTo('PATCH', '/api/meal-slots/batch')[0]!.body as { match: string; weekdays: number[] }).weekdays).toEqual([1, 2, 3, 4, 5, 6, 7])
  })
})

describe('MealSlotsPage: a plain User', () => {
  it('sees the cards read-only: no Edit, no day buttons, no "+", no row buttons', async () => {
    routes(USER_ME)
    renderWithProviders(<MealSlotsPage />)
    const dinner = await screen.findByRole('region', { name: 'Dinner' })
    expect(within(dinner).queryByRole('button', { name: 'Edit Dinner' })).toBeNull()
    expect(within(dinner).queryByRole('button', { name: /^Dinner on / })).toBeNull()
    expect(within(dinner).queryByRole('button', { name: /^Edit Dinner on / })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Lunch' })).queryByRole('button', { name: /^Add / })).toBeNull()
    expect(within(dinner).getByRole('list', { name: 'Differs on' })).toBeInTheDocument()
  })

  it('"Change a date" on Dinner opens the one-date Attendance for Monday 9 Nov (today counts)', async () => {
    const dinner = household().filter((s) => s.name === 'Dinner')
    const monday = dinner[0]!
    const url = `/api/meal-slots/${monday.id}/attendance?date=2026-11-09`
    routes(USER_ME, dinner, [mia, fabio], { [`GET ${url}`]: { slotId: monday.id, date: '2026-11-09', isOverride: false, attendance: both, portionsNeeded: 2 } })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Change a date for Dinner' }))
    expect(await screen.findByRole('dialog', { name: 'Dinner on 2026-11-09' })).toBeInTheDocument()
  })
})

describe('MealSlotsPage: scale', () => {
  it('five names and six Members: five cards, and an Avatar stack stops at four with "+N"', async () => {
    const names: Array<[string, string]> = [['Breakfast', '08:00'], ['Elevenses', '11:00'], ['Lunch', '13:00'], ['Tea', '16:30'], ['Dinner', '19:30']]
    const five = names.flatMap(([n, t]) => [1, 2, 3, 4, 5, 6, 7].map((d) => slot(d, n, t, { attendance: sixMembers.slice(0, 5).map((m) => ({ memberId: m.id, portionFactorOverride: null })) })))
    routes(ADMIN_ME, five, sixMembers)
    renderWithProviders(<MealSlotsPage />)
    await screen.findByRole('region', { name: 'Dinner' })
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))).toEqual(['Breakfast', 'Elevenses', 'Lunch', 'Tea', 'Dinner'])
    const list = within(screen.getByRole('region', { name: 'Dinner' })).getByRole('list', { name: 'Attending Dinner' })
    expect(within(list).getAllByRole('img')).toHaveLength(4)
    expect(within(list).getByText('+1')).toBeInTheDocument()
  })
})
