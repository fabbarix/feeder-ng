// B5-F1 (ADR 0014): Today's Tonight tile has the per-date controls for any slot, and shows a Not served slot as its compact row.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { anna, marco } from '../../settings/components/fixtures'
import { courseMeal, courseSlot, mockApi, planCourse, renderWithProviders, slot } from '../../plan/test-utils'
import type { PlanSlot } from '../../plan/types'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ nextSlot: null as unknown, notServedToday: [] as unknown[] }))

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: h.nextSlot !== null || h.notServedToday.length > 0, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: new Date('2026-11-10T17:00:00Z'), nextSlot: h.nextSlot, nextDay: 'today', nextAction: 'cook', notServedToday: h.notServedToday, toConfirm: [], couldntPlan: [], leftovers: [],
    planToday: '2026-11-10', spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

afterEach(() => {
  h.nextSlot = null
  h.notServedToday = []
  vi.unstubAllGlobals()
})

const TODAY = '2026-11-10'
const PATH = '/api/meal-slots/4/dates/2026-11-10'
const base = { 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 }, 'GET /api/plan': { today: TODAY, horizonDays: 3, updating: false, slots: [] } }
const info = { date: TODAY, notServed: false, time: null, usualTime: '19:30', guests: 0 }
const dinner = (over: Partial<PlanSlot> = {}): PlanSlot =>
  slot({ date: TODAY, mealSlotId: 4, name: 'Dinner', time: '19:30', usualTime: '19:30', at: `${TODAY}T19:30:00Z`, meal: courseMeal(1, 'Main', { mealSlotId: 4, recipeName: 'Chicken curry' }), ...over })
const routed = <Routes><Route path="/" element={<TodayScreen />} /></Routes>

describe('Today: the Tonight tile\'s menu', () => {
  it('a one-Course slot has Who\'s eating, Time today and Not served', async () => {
    h.nextSlot = dinner()
    mockApi(base)
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    expect(screen.getAllByRole('menuitem').map((i) => i.textContent)).toEqual(["Who's eating", 'Time today', 'Not served'])
  })

  it('Time today saves the date\'s time', async () => {
    h.nextSlot = dinner()
    const api = mockApi({ ...base, [`PATCH ${PATH}`]: { ...info, time: '20:30' } })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Time today' }))
    const dialog = await screen.findByRole('dialog', { name: 'Time for Tue Dinner' })
    within(dialog).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ time: '20:30' })
  })

  it('Not served asks first when Planned Meals go, then toasts with Undo', async () => {
    h.nextSlot = dinner()
    const api = mockApi({
      ...base,
      [`PATCH ${PATH}?dryRun=1`]: { removes: { plannedMeals: [{ courseId: 1, courseName: 'Main', recipeName: 'Chicken curry', pinned: false, bought: ['chicken'] }] } },
      [`PATCH ${PATH}`]: { ...info, notServed: true },
    })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not served' }))
    const dialog = await screen.findByRole('dialog', { name: 'Not serving Tue Dinner?' })
    expect(dialog).toHaveTextContent('Chicken curry (Bought: chicken). What you bought stays in Stock.')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Not served' }))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(await screen.findByRole('button', { name: 'Undo' })).toBeInTheDocument()
  })

  it('Who\'s eating opens the Date Attendance sheet for tonight', async () => {
    h.nextSlot = dinner()
    const att = { slotId: 4, date: TODAY, isOverride: false, attendance: [{ memberId: 1, portionFactorOverride: null }], portionsNeeded: 1, guests: 0, courses: [] }
    mockApi({
      ...base,
      'GET /api/members': [anna, marco],
      'GET /api/meal-slots': [{ id: 4, weekday: 2, name: 'Dinner', time: '19:30', portionsNeeded: 1, attendance: att.attendance }],
      [`GET /api/meal-slots/4/attendance?date=${TODAY}`]: att,
    })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: "Who's eating" }))
    const sheet = await screen.findByRole('dialog', { name: "Who's eating Dinner on 2026-11-10" })
    expect(await within(sheet).findByRole('spinbutton', { name: 'Guests' })).toBeInTheDocument()
  })
})

describe('Today: a Not served slot', () => {
  it('shows "Dinner · Not served" with Plan Dinner again instead of a hero', async () => {
    h.notServedToday = [courseSlot([planCourse({ courseId: 1, name: 'Main', unserved: 'not_served' })], { date: TODAY, mealSlotId: 4, name: 'Dinner', notServed: true })]
    const api = mockApi({ ...base, [`PATCH ${PATH}`]: info })
    renderWithProviders(routed, '/')
    expect(await screen.findByText('Dinner · Not served')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Plan Dinner again' }))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ notServed: false })
  })

  it('offline Plan Dinner again is unavailable', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    h.notServedToday = [courseSlot([planCourse({ courseId: 1, name: 'Main', unserved: 'not_served' })], { date: TODAY, mealSlotId: 4, name: 'Dinner', notServed: true })]
    mockApi(base)
    renderWithProviders(routed, '/')
    expect(await screen.findByRole('button', { name: /Plan Dinner again/ })).toBeDisabled()
    vi.restoreAllMocks()
  })
})
