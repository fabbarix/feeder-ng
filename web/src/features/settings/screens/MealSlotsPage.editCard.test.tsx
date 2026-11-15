// SET-14h (decision SET 5): "Edit <name>" on an every-day card starts with all days of that name, so a time change applies to every day.
// A day cell of the week strip still opens that day only (spec r15). Scenario: Editing an every-day Meal Slot from its card changes every day.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { householdSettings } from '../components/fixtures'
import { fabio, mia } from '../components/mealSlotCardFixtures'
import { ADMIN_ME, mockApi, renderWithProviders } from '../test-utils'
import type { MealSlot } from '../types'
import { MealSlotsPage } from './MealSlotsPage'

const both = [mia, fabio].map((m) => ({ memberId: m.id, portionFactorOverride: null }))
const slot = (weekday: number, name: string, time: string): MealSlot => ({ id: 700 + weekday + (name === 'Lunch' ? 10 : 0), weekday, name, time, portionsNeeded: 2, attendance: both })
const everyDay = [1, 2, 3, 4, 5, 6, 7].map((d) => slot(d, 'Dinner', '19:30'))
const lunchOnWeekdays = [1, 2, 3, 4, 5].map((d) => slot(d, 'Lunch', '12:30'))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12, 0) })
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
const pressed = (group: string) =>
  within(screen.getByRole('group', { name: group })).getAllByRole('button').filter((b) => b.getAttribute('aria-pressed') === 'true').map((b) => b.getAttribute('aria-label'))

function routes() {
  return mockApi({
    'GET /api/me': ADMIN_ME,
    'GET /api/household/settings': householdSettings,
    'GET /api/members': [mia, fabio],
    'GET /api/meal-slots': [...everyDay, ...lunchOnWeekdays],
    'GET /api/meal-slots?removed=with-history': [],
    'PATCH /api/meal-slots/batch': (c: { body: { match: string; weekdays: number[] } }) => ({
      match: c.body.match,
      updated: c.body.weekdays.map((weekday) => slot(weekday, c.body.match, '20:00')),
      skipped: [],
    }),
  })
}

describe('Edit from a card (SET-14h)', () => {
  it('"Edit Dinner" opens the sheet with all seven days chosen under "Apply to"', async () => {
    routes()
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Edit Dinner' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    expect(pressed('Apply to')).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'])
    expect(sheet).toBeInTheDocument()
  })
  it('a time change from there is ONE batch for all seven days', async () => {
    const api = routes()
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Edit Dinner' }))
    const sheet = await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    within(sheet).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('2000')
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save Meal Slot' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/meal-slots/batch')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/meal-slots/batch')[0]!.body).toEqual({ match: 'Dinner', weekdays: [1, 2, 3, 4, 5, 6, 7], set: { time: '20:00' } })
    await findToast('Updated Dinner on')
  })
  it('a card for a name on some days starts with exactly those days', async () => {
    routes()
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Lunch' })).getByRole('button', { name: 'Edit Lunch' }))
    await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    expect(pressed('Apply to')).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'])
  })
  it('a day cell of the strip still opens that day only', async () => {
    routes()
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(within(await screen.findByRole('region', { name: 'Dinner' })).getByRole('button', { name: 'Dinner on Wednesday, 19:30' }))
    await screen.findByRole('dialog', { name: 'Edit Meal Slot' })
    expect(pressed('Apply to')).toEqual(['Wednesday'])
  })
})
