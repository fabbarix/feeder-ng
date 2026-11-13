// B5-F1 (ADR 0014, beta5-plan 2.1 and 2.2): the per-date controls on the Plan, for any User: Not served, Time today, Who's eating with Guests, offline.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { anna, marco } from '../../settings/components/fixtures'
import { PlanScreen } from './PlanScreen'
import { courseMeal, courseSlot, mockApi, planCourse, renderWithProviders, slot } from '../test-utils'
import type { PlanSlot, PlanView } from '../types'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const TODAY = '2026-11-10' // a Tuesday
const PATH = '/api/meal-slots/4/dates/2026-11-10'
const planned = (over: Partial<PlanSlot> = {}) =>
  slot({ date: TODAY, mealSlotId: 4, name: 'Dinner', time: '19:30', usualTime: '19:30', at: `${TODAY}T19:30:00Z`, meal: courseMeal(1, 'Main', { mealSlotId: 4, recipeName: 'Roast chicken' }), ...over })
const view = (slots: PlanSlot[]): PlanView => ({ today: TODAY, horizonDays: 3, updating: false, slots })
const info = { date: TODAY, notServed: false, time: null, usualTime: '19:30', guests: 0 }
const nothingGoes = { removes: { plannedMeals: [] } }
const goes = { removes: { plannedMeals: [{ courseId: 1, courseName: 'Main', recipeName: 'Roast chicken', pinned: true, bought: [] }] } }
const openMenu = async (entry: string | RegExp) => {
  await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
  await userEvent.click(screen.getByRole('menuitem', { name: entry }))
}

describe('PlanScreen: Not served', () => {
  it('a one-Course slot has the menu; Not served with nothing planned there applies at once, then the slot shows its compact row', async () => {
    let served = true
    const api = mockApi({
      'GET /api/plan': () => view([served ? planned() : courseSlot([planCourse({ courseId: 1, name: 'Main', unserved: 'not_served' })], { date: TODAY, mealSlotId: 4, name: 'Dinner', notServed: true })]),
      [`PATCH ${PATH}?dryRun=1`]: nothingGoes,
      [`PATCH ${PATH}`]: () => {
        served = false
        return { ...info, notServed: true }
      },
    })
    renderWithProviders(<PlanScreen />)
    await openMenu('Not served')
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(await screen.findByText('Dinner · Not served')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Plan Dinner again' })).toBeInTheDocument()
    expect(screen.getByText('Tue Dinner is not served')).toBeInTheDocument()
  })

  it('lists the Planned Meals that go before removing them', async () => {
    const api = mockApi({ 'GET /api/plan': view([planned()]), [`PATCH ${PATH}?dryRun=1`]: goes, [`PATCH ${PATH}`]: { ...info, notServed: true } })
    renderWithProviders(<PlanScreen />)
    await openMenu('Not served')
    const dialog = await screen.findByRole('dialog', { name: 'Not serving Tue Dinner?' })
    expect(dialog).toHaveTextContent('These go: Roast chicken (Pinned).')
    expect(api.callsTo('PATCH', PATH)).toHaveLength(0)
    await userEvent.click(within(dialog).getByRole('button', { name: 'Not served' }))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
  })

  it('Plan Dinner again serves the date again', async () => {
    const away = courseSlot([planCourse({ courseId: 1, name: 'Main', unserved: 'not_served' })], { date: '2026-11-12', mealSlotId: 4, name: 'Dinner', notServed: true })
    const api = mockApi({ 'GET /api/plan': view([away]), 'PATCH /api/meal-slots/4/dates/2026-11-12': { ...info, date: '2026-11-12' } })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Plan Dinner again' }))
    await waitFor(() => expect(api.callsTo('PATCH', '/api/meal-slots/4/dates/2026-11-12')).toHaveLength(1))
    expect(api.callsTo('PATCH', '/api/meal-slots/4/dates/2026-11-12')[0]?.body).toEqual({ notServed: false })
  })
})

describe('PlanScreen: Time today', () => {
  it('the dialog saves the date\'s time and the slot then shows "20:15 · usually 19:30"', async () => {
    let own = false
    const api = mockApi({
      'GET /api/plan': () => view([own ? planned({ time: '20:15' }) : planned()]),
      [`PATCH ${PATH}`]: () => {
        own = true
        return { ...info, time: '20:15' }
      },
    })
    renderWithProviders(<PlanScreen />)
    await openMenu('Time today')
    const dialog = await screen.findByRole('dialog', { name: 'Time for Tue Dinner' })
    within(dialog).getByRole('spinbutton', { name: 'Hour' }).focus()
    await userEvent.keyboard('{ArrowUp}')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PATCH', PATH)).toHaveLength(1))
    expect(api.callsTo('PATCH', PATH)[0]?.body).toEqual({ time: '20:30' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(await screen.findByText('20:30 · usually 19:30')).toBeInTheDocument()
  })
})

describe('PlanScreen: Who\'s eating', () => {
  const att = { slotId: 4, date: TODAY, isOverride: false, attendance: [{ memberId: 1, portionFactorOverride: null }, { memberId: 2, portionFactorOverride: null }], portionsNeeded: 2, guests: 0, courses: [] }
  const dinnerSlot = { id: 4, weekday: 2, name: 'Dinner', time: '19:30', portionsNeeded: 2, attendance: att.attendance }
  const routes = (extra: Record<string, unknown> = {}) => ({
    'GET /api/plan': view([planned()]),
    'GET /api/members': [anna, marco],
    'GET /api/meal-slots': [dinnerSlot],
    [`GET /api/meal-slots/4/attendance?date=${TODAY}`]: att,
    ...extra,
  })
  const SHEET = "Who's eating Dinner on 2026-11-10"

  it('opens the Date Attendance sheet from the slot menu, with the date read-only', async () => {
    mockApi(routes())
    renderWithProviders(<PlanScreen />)
    await openMenu("Who's eating")
    const sheet = await screen.findByRole('dialog', { name: SHEET })
    expect(await within(sheet).findByRole('checkbox', { name: 'Anna' })).toBeChecked()
    expect(within(sheet).queryByRole('button', { name: /Date/ })).not.toBeInTheDocument()
  })

  it('Guests: the stepper adds portions to the preview and is saved with the date', async () => {
    const api = mockApi(routes({ [`PUT /api/meal-slots/4/attendance?date=${TODAY}`]: { ...att, guests: 2, portionsNeeded: 4 } }))
    renderWithProviders(<PlanScreen />)
    await openMenu("Who's eating")
    const sheet = await screen.findByRole('dialog', { name: SHEET })
    await within(sheet).findByRole('spinbutton', { name: 'Guests' })
    expect(within(sheet).getByText('2 portions of each Course')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Increase Guests' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Increase Guests' }))
    expect(within(sheet).getByText('4 portions of each Course')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save for this date' }))
    await waitFor(() => expect(api.callsTo('PUT', `/api/meal-slots/4/attendance?date=${TODAY}`)).toHaveLength(1))
    expect(api.callsTo('PUT', `/api/meal-slots/4/attendance?date=${TODAY}`)[0]?.body).toMatchObject({ guests: 2 })
  })

  it('U1: emptying Who\'s eating makes the date Not served: the same confirm, the same toast', async () => {
    const api = mockApi(routes({ [`PATCH ${PATH}?dryRun=1`]: goes, [`PUT /api/meal-slots/4/attendance?date=${TODAY}`]: { ...att, attendance: [] } }))
    renderWithProviders(<PlanScreen />)
    await openMenu("Who's eating")
    const sheet = await screen.findByRole('dialog', { name: SHEET })
    await userEvent.click(await within(sheet).findByRole('checkbox', { name: 'Anna' }))
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Marco' }))
    expect(within(sheet).getByText('Nobody is eating, so this date is Not served.')).toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save for this date' }))
    const confirm = await screen.findByRole('dialog', { name: 'Not serving Tue Dinner?' })
    expect(api.callsTo('PUT', `/api/meal-slots/4/attendance?date=${TODAY}`)).toHaveLength(0)
    await userEvent.click(within(confirm).getByRole('button', { name: 'Not served' }))
    await waitFor(() => expect(api.callsTo('PUT', `/api/meal-slots/4/attendance?date=${TODAY}`)).toHaveLength(1))
    expect(api.callsTo('PUT', `/api/meal-slots/4/attendance?date=${TODAY}`)[0]?.body).toMatchObject({ attendance: [] })
    expect(await screen.findByText('Tue Dinner is not served')).toBeInTheDocument()
  })

  it('U1: Guests alone keep the date served (no confirm)', async () => {
    const api = mockApi(routes({ [`PUT /api/meal-slots/4/attendance?date=${TODAY}`]: { ...att, attendance: [], guests: 2 } }))
    renderWithProviders(<PlanScreen />)
    await openMenu("Who's eating")
    const sheet = await screen.findByRole('dialog', { name: SHEET })
    await userEvent.click(await within(sheet).findByRole('checkbox', { name: 'Anna' }))
    await userEvent.click(within(sheet).getByRole('checkbox', { name: 'Marco' }))
    await userEvent.click(within(sheet).getByRole('button', { name: 'Increase Guests' }))
    expect(within(sheet).queryByText('Nobody is eating, so this date is Not served.')).not.toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Save for this date' }))
    await waitFor(() => expect(api.callsTo('PUT', `/api/meal-slots/4/attendance?date=${TODAY}`)).toHaveLength(1))
    expect(api.callsTo('PATCH', `${PATH}?dryRun=1`)).toHaveLength(0)
  })
})

describe('PlanScreen: offline', () => {
  it('the three choices are unavailable and say Needs a connection', async () => {
    vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    mockApi({ 'GET /api/plan': view([planned()]) })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    for (const label of ["Who's eating", 'Time today', 'Not served']) {
      expect(screen.getByRole('menuitem', { name: `${label} · Needs a connection` })).toHaveAttribute('aria-disabled', 'true')
    }
  })
})
