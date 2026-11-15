// B9-46 (PC-08): the Away on the Plan. A day tile says who is away and its line opens that Away; the Meal Slot ⋮ and Who's eating both
// reach the Away sheet from that Meal Slot. Tue 10 Nov 2026 is the Household's today.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { anna, marco, sam, thursdayDinner } from '../../settings/components/fixtures'
import { PlanScreen } from './PlanScreen'
import { courseMeal, mockApi, renderWithProviders, slot } from '../test-utils'
import type { Away, PlanSlot, PlanView } from '../types'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
beforeAll(() => {
  if (!Element.prototype.scrollIntoView) Element.prototype.scrollIntoView = () => {}
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const TODAY = '2026-11-10'
const BEN: Away = { id: 9, memberId: 2, memberName: 'Ben', from: '2026-11-11', fromMealSlotId: null, through: '2026-11-12', throughMealSlotId: null, started: false }
const dinner = (date: string, over: Partial<PlanSlot> = {}) =>
  slot({ date, mealSlotId: 4, name: 'Dinner', time: '19:30', usualTime: '19:30', at: `${date}T19:30:00Z`, portions: 1.75, meal: courseMeal(1, 'Main', { mealSlotId: 4, date, recipeName: 'Roast chicken' }), ...over })
const view = (slots: PlanSlot[], away: Away[] = []): PlanView => ({ today: TODAY, horizonDays: 3, updating: false, slots, away })
const SLOTS = [{ id: 4, weekday: 2, name: 'Dinner', time: '19:30', attendance: [], portionsNeeded: 1.75 }, { id: 5, weekday: 3, name: 'Dinner', time: '19:30', attendance: [], portionsNeeded: 1.75 }]
const MEMBERS = [anna, { ...marco, id: 2, name: 'Ben' }, sam]
const PLAN = view([dinner(TODAY), dinner('2026-11-11', { mealSlotId: 5, away: [2] })], [BEN])
const base = { 'GET /api/members': MEMBERS, 'GET /api/meal-slots': SLOTS, 'PATCH /api/away/9?dryRun=1': { slotsWithout: 1, mealsChanged: 1, days: [], beyondHorizon: null }, 'POST /api/members/2/away?dryRun=1': { slotsWithout: 0, mealsChanged: 0, days: [], beyondHorizon: null } }

describe('PlanScreen: Away', () => {
  it('a whole-day Away is a line under the day; it opens that Away in the sheet', async () => {
    mockApi({ 'GET /api/plan': PLAN, ...base })
    renderWithProviders(<PlanScreen />)
    const line = await screen.findByRole('button', { name: 'Ben away all day · 1.75 portions, Wed 11' })
    await userEvent.click(line)
    const dialog = await screen.findByRole('dialog', { name: /Ben is away/ })
    expect(dialog.querySelector('.sheet__context')).toHaveTextContent('Wed 11 – Thu 12 Nov')
  })

  it('a day with nobody away has no line', async () => {
    mockApi({ 'GET /api/plan': PLAN, ...base })
    renderWithProviders(<PlanScreen />)
    await screen.findByRole('button', { name: /Ben away all day/ })
    expect(screen.getAllByRole('button', { name: /away all day/ })).toHaveLength(1)
  })

  it('the Meal Slot ⋮ offers "Someone is away…", which opens the sheet from that Meal Slot', async () => {
    mockApi({ 'GET /api/plan': PLAN, ...base })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'More for Tue 10 Dinner' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Someone is away…' }))
    const dialog = await screen.findByRole('dialog', { name: /Someone is away/ })
    expect(dialog.querySelector('.sheet__context')).toHaveTextContent('From Tue 10 Dinner')
    expect(within(dialog).getByRole('radiogroup', { name: 'Who' })).toBeInTheDocument()
  })

  it('Who\'s eating holds "Add an Away", which swaps it for the Away sheet from the same Meal Slot', async () => {
    mockApi({
      'GET /api/plan': PLAN,
      ...base,
      'GET /api/meal-slots/4/attendance?date=2026-11-10': { slotId: 4, date: TODAY, isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5, guests: 0, away: [] },
    })
    renderWithProviders(<PlanScreen />)
    await userEvent.click(await screen.findByRole('button', { name: 'More for Tue 10 Dinner' }))
    await userEvent.click(screen.getByRole('menuitem', { name: "Who's eating" }))
    await userEvent.click(await screen.findByRole('button', { name: 'Add an Away' }))
    const dialog = await screen.findByRole('dialog', { name: /Someone is away/ })
    expect(dialog.querySelector('.sheet__context')).toHaveTextContent('From Tue 10 Dinner')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Who's eating/ })).toBeNull())
  })
})
