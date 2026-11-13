// B5-BOW round 2 (ADR 0013): Today matches Plan. Swapping a Bought meal notes what stays in Stock; the hero warns.
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, mockApi, planCourse, renderWithProviders } from '../../plan/test-utils'
import type { PlanSlot } from '../../plan/types'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ nextSlot: null as unknown }))

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: true, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: new Date('2026-11-10T17:00:00Z'), nextSlot: h.nextSlot, nextDay: 'today', nextAction: 'cook', toConfirm: [], couldntPlan: [], leftovers: [], planToday: '2026-11-10',
    spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

const routed = (
  <Routes>
    <Route path="/" element={<TodayScreen />} />
  </Routes>
)
const bought = { ingredients: [{ id: 40, name: 'green beans' }, { id: 41, name: 'butter' }] }
const dinner = (mainOver = {}, sideOver = {}): PlanSlot =>
  courseSlot(
    [
      planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { mealSlotId: 4, recipeName: 'Roast chicken', ...mainOver }) }),
      planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { mealSlotId: 4, recipeName: 'Green beans', ...sideOver }) }),
    ],
    { date: '2026-11-10', mealSlotId: 4, name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z', cookMinutes: 30, startBy: '19:00', attendance: [{ id: 2, name: 'Sam' }] } as Partial<PlanSlot>,
  )
const api = { 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 }, 'GET /api/plan/2026-11-10/4/2/alternatives': { alternatives: [] } }

afterEach(() => {
  h.nextSlot = null
  vi.unstubAllGlobals()
})

describe('Today: Bought meals match Plan', () => {
  it('Swap on a Bought Course shows the "stays in Stock" note', async () => {
    h.nextSlot = dinner({}, { bought })
    mockApi(api)
    renderWithProviders(routed, '/')
    await userEvent.click(within(await screen.findByRole('listitem', { name: 'Side' })).getByRole('button', { name: 'Swap' }))
    expect(await screen.findByText('You bought green beans, butter for this; it stays in Stock.')).toBeInTheDocument()
  })

  it('Swap on a meal that is not Bought shows no note', async () => {
    h.nextSlot = dinner()
    mockApi(api)
    renderWithProviders(routed, '/')
    await userEvent.click(within(await screen.findByRole('listitem', { name: 'Side' })).getByRole('button', { name: 'Swap' }))
    await screen.findByRole('dialog')
    expect(screen.queryByText(/You bought/)).not.toBeInTheDocument()
  })

  it('the hero shows the Bought chip and the warn line when the Bought main Course breaks a rule', async () => {
    h.nextSlot = dinner({ bought, warning: { code: 'excluded', memberId: 2, ingredientId: 40 } })
    mockApi(api)
    renderWithProviders(routed, '/')
    const hero = (await screen.findByRole('group', { name: 'Today' })).firstElementChild as HTMLElement
    expect(within(hero).getByText('Bought')).toBeInTheDocument()
    expect(within(hero).getByRole('note')).toHaveTextContent('Sam now excludes green beans, which this uses. Swap it to change it.')
  })
})
