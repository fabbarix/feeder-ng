import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { findNotice } from '../../../test/notices'
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

describe('TodayScreen: after the slot time the hero asks whether it was cooked', () => {
  const preview: CookPreview = {
    meal: meal(), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [],
  }
  const cooked: CookedResult = {
    meal: meal({ state: 'cooked' }), warnings: [],
    leftover: { id: 3, recipeId: 7, recipeName: 'Chicken & leek pie', portions: 2, cookedOn: '2026-11-10', useBy: '2026-11-13', fromDate: '2026-11-10', fromMealSlotId: 2 },
    plannedFor: [{ date: '2026-11-11', mealSlotId: 3, mealSlotName: 'Lunch', recipeName: 'Chicken & leek pie' }],
  }

  it('Yes, Cooked is one tap: Cooked with the planned Leftover, then a friendly confirmation', async () => {
    h.now = new Date('2026-11-10T20:00:00Z')
    const api = mockApi({ ...base, 'GET /api/plan/2026-11-10/2/1/cook': preview, 'POST /api/plan/2026-11-10/2/1/cooked': cooked })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Yes, Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/2/1/cooked')[0]?.body).toEqual({ leftoverPortions: 2 }))
    expect(await findNotice('status', 'Cooked, nice one! 2 portions → Wed Lunch')).toBeDefined()
  })

  it('Adjust opens the Mark as Cooked sheet on Today itself', async () => {
    h.now = new Date('2026-11-10T20:00:00Z')
    mockApi({ ...base, 'GET /api/plan/2026-11-10/2/1/cook': preview })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Adjust' }))
    expect(await screen.findByRole('dialog', { name: 'Mark as Cooked' })).toBeInTheDocument()
    expect(screen.queryByText('Plan screen')).not.toBeInTheDocument()
  })
})

describe('TodayScreen: To confirm and Leftovers', () => {
  it('To confirm rows offer Yes, Cooked and Adjust right on Today', async () => {
    h.toConfirm = [slot({ date: '2026-11-09', courseId: 1, courseName: 'Main', meal: meal({ date: '2026-11-09', recipeName: 'Stew' }) })]
    const api = mockApi({
      ...base,
      'GET /api/plan/2026-11-09/2/1/cook': { meal: meal(), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 0, maxLeftover: 2, leftoverUseBy: '2026-11-12', needs: [] },
      'POST /api/plan/2026-11-09/2/1/cooked': { meal: meal({ state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] },
    })
    renderWithProviders(routed, '/')
    const tile = (await screen.findByRole('heading', { name: 'To confirm' })).closest('section') as HTMLElement
    await userEvent.click(within(tile).getByRole('button', { name: 'Yes, Cooked' }))
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
