// B5-F1 (ADR 0014): Settings > Meal Slots shows the read-only "Dates that differ" tile once per-date changes exist.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { householdSettings } from '../components/fixtures'
import { fabio, mia } from '../components/mealSlotCardFixtures'
import { ADMIN_ME, mockApi, renderWithProviders, USER_ME } from '../test-utils'
import type { MealSlot } from '../types'
import { MealSlotsPage } from './MealSlotsPage'

const both = [mia, fabio].map((m) => ({ memberId: m.id, portionFactorOverride: null }))
const dinner = (weekday: number): MealSlot => ({ id: 500 + weekday, weekday, name: 'Dinner', time: '19:30', portionsNeeded: 2, attendance: both, courses: [] })
const plan = {
  slots: [
    { date: '2026-11-11', mealSlotId: 503, name: 'Dinner', time: '19:30', usualTime: '19:30', notServed: true, guests: 0 },
    { date: '2026-11-12', mealSlotId: 504, name: 'Dinner', time: '20:15', usualTime: '19:30', notServed: false, guests: 2 },
  ],
}

function routes(me: typeof ADMIN_ME) {
  return mockApi({
    'GET /api/me': me,
    'GET /api/household/settings': householdSettings,
    'GET /api/members': [mia, fabio],
    'GET /api/meal-slots': [1, 2, 3, 4, 5, 6, 7].map(dinner),
    'GET /api/plan': plan,
  })
}
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(2026, 10, 9, 12, 0) }) // Monday 9 Nov 2026
  vi.stubGlobal('matchMedia', (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }))
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('MealSlotsPage: Dates that differ', () => {
  it('lists the dates with a Not served slot, their own time or Guests, soonest first', async () => {
    routes(ADMIN_ME)
    renderWithProviders(<MealSlotsPage />)
    const tile = await screen.findByRole('region', { name: 'Dates that differ' })
    const rows = within(tile).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(rows[0]).toHaveTextContent('Wed 11 Nov')
    expect(rows[0]).toHaveTextContent('Not served')
    expect(rows[1]).toHaveTextContent('Thu 12 Nov')
    expect(rows[1]).toHaveTextContent('20:15 · usually 19:30')
    expect(rows[1]).toHaveTextContent('2 Guests')
  })

  it('is read-only for an Admin and for a plain User: no buttons in the tile', async () => {
    for (const me of [ADMIN_ME, USER_ME]) {
      routes(me)
      const { unmount } = renderWithProviders(<MealSlotsPage />)
      const tile = await screen.findByRole('region', { name: 'Dates that differ' })
      expect(within(tile).queryByRole('button')).toBeNull()
      expect(within(tile).getByText('Set from the Plan, for one date. The usual week does not change.')).toBeInTheDocument()
      unmount()
    }
  })

  it('a refused date save (409 slot_started) toasts the Plan sentence in GLOSSARY words and keeps the sheet open', async () => {
    const url = '/api/meal-slots/501/attendance?date=2026-11-09'
    const base = mockApi({
      'GET /api/me': ADMIN_ME,
      'GET /api/household/settings': householdSettings,
      'GET /api/members': [mia, fabio],
      'GET /api/meal-slots': [1, 2, 3, 4, 5, 6, 7].map(dinner),
      'GET /api/plan': plan,
      [`GET ${url}`]: { slotId: 501, date: '2026-11-09', isOverride: false, attendance: both, portionsNeeded: 2, guests: 0, courses: [] },
      [`PUT ${url}`]: { status: 409, json: { error: { code: 'slot_started', message: 'raw server text' } } },
    })
    renderWithProviders(<MealSlotsPage />)
    await userEvent.click(await screen.findByRole('button', { name: 'Change a date for Dinner' }))
    const dialog = await screen.findByRole('dialog', { name: 'Dinner on 2026-11-09' })
    await userEvent.click(within(dialog).getByRole('checkbox', { name: mia.name }))
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save for this date' }))
    await waitFor(() => expect(base.callsTo('PUT', url)).toHaveLength(1))
    expect(await screen.findByText('Part of Dinner is already Cooked or Not cooked, so it cannot be left out.')).toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Dinner on 2026-11-09' })).toBeInTheDocument()
  })
})
