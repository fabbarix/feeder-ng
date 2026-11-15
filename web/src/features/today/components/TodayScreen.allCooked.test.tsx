// CRS F review (spec 8): Mark all Cooked on Today shows the outcome the single path shows (toast, shortfall notices).
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { allCookedResult, courseMeal, courseSlot, mockApi, planCourse, renderWithProviders, slot } from '../../plan/test-utils'
import type { CookPreview, PlanSlot } from '../../plan/types'

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
    await userEvent.click(await screen.findByRole('button', { name: /^Adjust / }))
    return api
  }],
])('Today: Mark all Cooked from %s', (_name, open) => {
  it('cheers and says where each Leftover went (a success toast)', async () => {
    await open()
    await confirmAll()
    const toast = await findToast('Cooked, nice one!')
    expect(toast.querySelector('.toast__body')).toHaveTextContent('Roast chicken: 2 portions planned for Thu Lunch. Green beans: 1 portion kept as a Leftover, good until Fri.')
  })

  // B9-45 (PC-02, waits for it; B9-44 wires it on Today): ONE info notice for every short Ingredient, with DetailList rows, no alert; Correct
  // Stock is ONE sheet with a Stepper per Ingredient (every row starts at 0, g by 10) and one Save.
  const shortNotice = async () => (await screen.findByText('Stock was short for chicken thighs')).closest('.shortfall-notice') as HTMLElement

  it('shows ONE shortfall notice (placement list) with a row per Ingredient, not an alert, and no duplicate in the sheets', async () => {
    await open()
    await confirmAll()
    const notice = await shortNotice()
    expect(notice).toHaveAttribute('data-status', 'info')
    expect(notice).toHaveAttribute('role', 'status')
    expect(within(notice).getByText('chicken thighs')).toBeInTheDocument()
    expect(within(notice).getByText('Cooking used 400 g · Stock showed 300 g')).toBeInTheDocument()
    expect(notice.querySelector('.shortfall-notice__subline')).toHaveTextContent(/Stock stays where it is/)
    expect(document.querySelectorAll('.shortfall-notice')).toHaveLength(1)
    expect(document.querySelector('[role="alert"]:not(.toast-live)')).toBeNull()
  })

  it('Correct Stock opens the one sheet; Save writes the typed total and settles the notice', async () => {
    const api = await open()
    await confirmAll()
    await userEvent.click(within(await shortNotice()).getByRole('button', { name: 'Correct Stock' }))
    const correct = await screen.findByRole('dialog', { name: /Correct Stock/ })
    const stepper = within(correct).getByRole('group', { name: 'chicken thighs left now' })
    for (let n = 0; n < 25; n++) await userEvent.click(within(stepper).getByRole('button', { name: /^Increase/ }))
    await userEvent.click(within(correct).getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 250 }))
    await waitFor(() => expect(document.querySelector('.shortfall-notice')).toBeNull())
  })

  it('Dismiss removes the shortfall and writes nothing', async () => {
    const api = await open()
    await confirmAll()
    await userEvent.click(within(await shortNotice()).getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(document.querySelector('.shortfall-notice')).toBeNull())
    expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')).toHaveLength(0)
  })
})
