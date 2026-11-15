import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findToast } from '../../../test/notices'
import { meal, mockApi, renderWithProviders, slot } from '../../plan/test-utils'
import type { CookedResult, CookPreview } from '../../plan/types'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ now: new Date('2026-11-10T17:00:00Z'), toConfirm: [] as unknown[], leftovers: [] as unknown[] }))

const dinner = () =>
  slot({
    date: '2026-11-10', mealSlotId: 2, name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z',
    meal: meal({ recipeName: 'Chicken & leek pie', cookMinutes: 45, startBy: '18:45', why: [{ code: 'favourite', members: ['Anna'] }] }),
  })

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: true, toConfirm: h.toConfirm.length, couldntPlan: 0, leftovers: h.leftovers.length, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: h.now, nextSlot: dinner(), toConfirm: h.toConfirm, couldntPlan: [], leftovers: h.leftovers, planToday: '2026-11-10',
    spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

const routed = (
  <Routes>
    <Route path="/" element={<TodayScreen />} />
    <Route path="/cook/meal/:date/:slotId" element={<p>Cook Mode screen</p>} />
    <Route path="/plan" element={<p>Plan screen</p>} />
  </Routes>
)

const base = { 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } }

afterEach(() => {
  h.now = new Date('2026-11-10T17:00:00Z')
  h.toConfirm = []
  h.leftovers = []
  vi.unstubAllGlobals()
})

describe('TodayScreen: tonight is the hero', () => {
  it('the hero tile comes first, with the Recipe, the start-by time and Cook · 45 min', async () => {
    mockApi(base)
    renderWithProviders(routed, '/')
    const grid = await screen.findByRole('group', { name: 'Today' })
    const first = grid.firstElementChild as HTMLElement
    expect(first).toHaveAttribute('data-tile', 'nextMeal')
    expect(within(first).getByRole('heading', { name: 'Chicken & leek pie' })).toBeInTheDocument()
    expect(within(first).getByText('start 18:45')).toBeInTheDocument()
    expect(first.querySelector('[data-variant="hero"]')).not.toBeNull()
  })

  it('shows the date under the title', async () => {
    mockApi(base)
    renderWithProviders(routed, '/')
    expect(await screen.findByText('Tue 10 Nov')).toBeInTheDocument()
  })

  it('B2: Cook opens Cook Mode for the Planned Meal', async () => {
    mockApi(base)
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Cook · 45 min' }))
    expect(await screen.findByText('Cook Mode screen')).toBeInTheDocument()
  })
})

// B9-39 (TB-01): the hero no longer asks "cooked?" after the slot time. It moves on at the slot time and the meal that has gone is the first
// row of To confirm, with Cooked and Adjust (they work right on Today, as before).
describe('TodayScreen: a past meal is decided in To confirm, never on the hero', () => {
  const preview: CookPreview = {
    meal: meal(), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [],
  }
  const cooked: CookedResult = {
    meal: meal({ state: 'cooked' }), warnings: [],
    leftover: { id: 3, recipeId: 7, recipeName: 'Chicken & leek pie', portions: 2, cookedOn: '2026-11-10', useBy: '2026-11-13', fromDate: '2026-11-10', fromMealSlotId: 2 },
    plannedFor: [{ date: '2026-11-11', mealSlotId: 3, mealSlotName: 'Lunch', recipeName: 'Chicken & leek pie' }],
  }
  const served = () => [slot({ date: '2026-11-10', mealSlotId: 2, name: 'Lunch', time: '13:00', at: '2026-11-10T13:00:00Z', courseId: 1, courseName: 'Main', meal: meal({ recipeName: 'Chicken & leek pie' }) })]

  it('the hero shows no "cooked?" ask and no Cooked or Adjust button of its own, whatever the clock says', async () => {
    h.now = new Date('2026-11-10T20:00:00Z')
    mockApi(base)
    renderWithProviders(routed, '/')
    const hero = (await screen.findByRole('heading', { name: 'Chicken & leek pie' })).closest('[data-variant="hero"]') as HTMLElement
    expect(hero.querySelector('.plan-hero__ask')).toBeNull()
    expect(within(hero).queryByRole('button', { name: /^(Cooked|Adjust)/ })).toBeNull()
  })

  it('Cooked on the To confirm row is one tap: Cooked with the planned Leftover, then a friendly confirmation', async () => {
    h.toConfirm = served()
    const api = mockApi({ ...base, 'GET /api/plan/2026-11-10/2/1/cook': preview, 'POST /api/plan/2026-11-10/2/1/cooked': cooked })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: /^Cooked / }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/2/1/cooked')[0]?.body).toEqual({ leftoverPortions: 2 }))
    // B9-26: the rich Cooked toast (headline, the meal, where the Leftover went, Undo).
    const toast = await findToast('Cooked, nice one!')
    expect(toast.querySelector('.toast__body')).toHaveTextContent('2 portions planned for Wed Lunch.')
  })

  it('Adjust on the To confirm row opens the Mark as Cooked sheet on Today itself', async () => {
    h.toConfirm = served()
    mockApi({ ...base, 'GET /api/plan/2026-11-10/2/1/cook': preview })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: /^Adjust / }))
    expect(await screen.findByRole('dialog', { name: 'Mark as Cooked' })).toBeInTheDocument()
    expect(screen.queryByText('Plan screen')).not.toBeInTheDocument()
  })
})

describe('TodayScreen: To confirm and Leftovers', () => {
  // DS-TODAY (changed on purpose): the To confirm row's primary is "Cooked", named by its Recipe, day and Meal Slot (B9-39, A11Y-08).
  it('To confirm rows offer Cooked and Adjust right on Today', async () => {
    h.toConfirm = [slot({ date: '2026-11-09', courseId: 1, courseName: 'Main', meal: meal({ date: '2026-11-09', recipeName: 'Stew' }) })]
    const api = mockApi({
      ...base,
      'GET /api/plan/2026-11-09/2/1/cook': { meal: meal(), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 0, maxLeftover: 2, leftoverUseBy: '2026-11-12', needs: [] },
      'POST /api/plan/2026-11-09/2/1/cooked': { meal: meal({ state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] },
    })
    renderWithProviders(routed, '/')
    const tile = (await screen.findByRole('heading', { name: 'To confirm' })).closest('section') as HTMLElement
    await userEvent.click(within(tile).getByRole('button', { name: /^Cooked / }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-09/2/1/cooked')).toHaveLength(1))
  })

  it('the Leftovers tile opens the Plan', async () => {
    h.leftovers = [{ id: 1, recipeId: 1, recipeName: 'Soup', portions: 2, cookedOn: '2026-11-09', useBy: '2026-11-12', fromDate: '2026-11-09', fromMealSlotId: 2 }]
    mockApi(base)
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Leftovers to use' }))
    expect(await screen.findByText('Plan screen')).toBeInTheDocument()
  })
})
