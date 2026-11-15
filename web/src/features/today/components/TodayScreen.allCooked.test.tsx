// CRS F review (spec 8): Mark all Cooked on Today shows the outcome the single path shows (toast, shortfall notices).
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { allCookedResult, courseMeal, courseSlot, mockApi, planCourse, renderWithProviders, slot } from '../../plan/test-utils'
import type { CookPreview, PlanSlot } from '../../plan/types'

/** B9-45 (PC-02): the ONE shortfall notice (an info status tile with DetailList rows), not one danger alert per warning. */
const findShortfallNotice = () =>
  waitFor(() => {
    const el = document.querySelector<HTMLElement>('.shortfall-notice')
    if (!el) throw new Error('no shortfall notice')
    return el
  })
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ toConfirm: [] as unknown[], nextSlot: null as unknown }))

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: h.nextSlot !== null, toConfirm: h.toConfirm.length, couldntPlan: 0, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: new Date('2026-11-10T17:00:00Z'), nextSlot: h.nextSlot, nextDay: 'today', nextAction: 'cook', toConfirm: h.toConfirm, couldntPlan: [], leftovers: [], planToday: '2026-11-10',
    spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

const routed = (
  <Routes>
    <Route path="/" element={<TodayScreen />} />
  </Routes>
)
const base = { 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } }
const preview = (courseId: number, courseName: string, recipeName: string, date: string): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4, date }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [],
})
const entry = (courseId: number, courseName: string, recipeName: string): PlanSlot =>
  slot({ date: '2026-11-10', mealSlotId: 4, courseId, courseName, meal: courseMeal(courseId, courseName, { mealSlotId: 4, recipeName, date: '2026-11-10' }) })

afterEach(() => {
  h.toConfirm = []
  h.nextSlot = null
  vi.unstubAllGlobals()
})

function routes() {
  return mockApi({
    ...base,
    'GET /api/plan/2026-11-10/4/1/cook': preview(1, 'Main', 'Roast chicken', '2026-11-10'),
    'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans', '2026-11-10'),
    'POST /api/plan/2026-11-10/4/all/cooked': allCookedResult(),
    'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] },
  })
}

async function confirmAll() {
  const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
  await within(sheet).findByRole('spinbutton', { name: 'Main Leftover portions' })
  await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
}

describe.each([
  ['the Tonight tile\'s slot menu', async () => {
    h.nextSlot = courseSlot(
      [
        planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { mealSlotId: 4, recipeName: 'Roast chicken' }) }),
        planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { mealSlotId: 4, recipeName: 'Green beans' }) }),
      ],
      { date: '2026-11-10', mealSlotId: 4, name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z' },
    )
    const api = routes()
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark all Cooked' }))
    return api
  }],
  ['the To confirm tile', async () => {
    h.toConfirm = [entry(1, 'Main', 'Roast chicken'), entry(2, 'Side', 'Green beans')]
    const api = routes()
    renderWithProviders(routed, '/')
    // DS-TODAY (changed on purpose): the To confirm row's "Adjust" opens the Mark all Cooked sheet (the "Mark all Cooked" button is gone).
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust' }))
    return api
  }],
])('Today: Mark all Cooked from %s', (_name, open) => {
  it('cheers and says where each Leftover went (a success toast)', async () => {
    await open()
    await confirmAll()
    const toast = await findToast('Cooked, nice one!')
    expect(toast.querySelector('.toast__body')).toHaveTextContent('Roast chicken: 2 portions planned for Thu Lunch. Green beans: 1 portion kept as a Leftover, good until Fri.')
  })

  // B9-45 (PC-02): the ONE shortfall notice (info rows) and the ONE Correct Stock sheet, as on the Plan (PlanScreen.allCooked.test).
  it('shows the Stock shortfall with Correct Stock and Dismiss', async () => {
    const api = await open()
    await confirmAll()
    const notice = await findShortfallNotice()
    expect(notice).toHaveTextContent('Stock was short for chicken thighs')
    expect(notice).toHaveTextContent('Cooking used 400 g · Stock showed 300 g')
    await userEvent.click(within(notice).getByRole('button', { name: 'Correct Stock' }))
    const correct = await screen.findByRole('dialog', { name: /Correct Stock/ })
    await userEvent.click(within(within(correct).getByRole('group', { name: 'chicken thighs left now' })).getByRole('button', { name: /^Increase/ }))
    await userEvent.click(within(correct).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 10 }))
  })

  it('Dismiss removes the shortfall', async () => {
    const api = await open()
    await confirmAll()
    await userEvent.click(within(await findShortfallNotice()).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(document.querySelector('.shortfall-notice')).toBeNull())
    expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')).toHaveLength(0)
  })
})
