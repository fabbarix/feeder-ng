// CRS G2: the Couldn't plan tile on Today per Course (flat entries from GET /api/plan/couldnt-plan, the plan view for "every").
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, NOBODY, dinner, empty, flat, planned, sideWeek } from '../../plan/couldnt-fixtures'
import type { PlanSlot } from '../../plan/types'
import { mockApi, renderWithProviders } from '../../settings/test-utils'
import type { SetupFacts } from '../lib/setup'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ couldnt: [] as unknown[], all: [] as unknown[], facts: null as unknown }))

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: false, toConfirm: 0, couldntPlan: h.couldnt.length, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    nextSlot: null, toConfirm: [], couldntPlan: h.couldnt, planSlots: h.all, leftovers: [], planToday: '2026-11-10', spoiled: [], stockToday: '2026-11-10',
    system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))
vi.mock('../setupSeam', () => ({ useSetupFacts: () => ({ facts: h.facts, loading: false }) }))

afterEach(() => {
  h.couldnt = []
  h.all = []
  h.facts = null
  vi.unstubAllGlobals()
})

const established: SetupFacts = { members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 5, plannedMeals: 4, unplannedMeals: 2 }
const Where = () => {
  const l = useLocation()
  return <p>at {l.pathname + l.search}</p>
}
function setup(extra: Record<string, unknown> = {}) {
  mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 }, ...extra })
  return renderWithProviders(
    <Routes>
      <Route path="/" element={createElement(TodayScreen)} />
      <Route path="*" element={<Where />} />
    </Routes>,
  )
}
const load = (cells: PlanSlot[], all: PlanSlot[]) => {
  h.couldnt = cells
  h.all = all
  h.facts = established
}

describe('Today: Couldn\'t plan per Course', () => {
  const week = sideWeek(['2026-11-10', '2026-11-11'])
  const cells = [flat('2026-11-10', 2, 'Side', EXCLUDED), flat('2026-11-11', 2, 'Side', EXCLUDED)]

  it('one compact tile in the grid, a row naming the count and the Course, with the cause as its meta (B9-32, PC-07)', async () => {
    load(cells, week)
    setup()
    const row = await screen.findByRole('group', { name: '2 Sides' })
    const tile = row.closest('[data-tile="couldntPlan"]') as HTMLElement
    expect(within(row).getByText('Every Recipe is excluded for someone who eats it.')).toBeInTheDocument()
    expect(tile.querySelector('.plan-couldnt')).toHaveAttribute('data-span', 'full')
  })

  it('Review Exclusions opens the page; a plain User gets the button too and no "Ask an Admin"', async () => {
    load(cells, week)
    setup({ 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    await userEvent.click(await screen.findByRole('button', { name: 'Review Exclusions' }))
    expect(await screen.findByText('at /plan/couldnt-plan/excluded')).toBeInTheDocument()
  })

  it('Today has no "Show which meals" (its sheet is the Plan\'s) and no list of lines', async () => {
    load(cells, week)
    setup()
    await screen.findByRole('group', { name: '2 Sides' })
    expect(screen.queryByRole('button', { name: 'Show which meals' })).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('No Recipes for this Course: "Mark Recipes as Dessert" opens the Recipes list of Recipes not marked as Dessert', async () => {
    const dessertWeek = ['2026-11-10', '2026-11-11'].map((d) => dinner(d, [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)]))
    load([flat('2026-11-10', 3, 'Dessert', NO_COURSE_RECIPES), flat('2026-11-11', 3, 'Dessert', NO_COURSE_RECIPES)], dessertWeek)
    setup({ 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    expect(await screen.findByRole('group', { name: '2 Desserts' })).toHaveTextContent('No Recipes are marked as Dessert.')
    await userEvent.click(screen.getByRole('button', { name: 'Mark Recipes as Dessert' }))
    expect(await screen.findByText('at /recipes?notCourse=3')).toBeInTheDocument()
  })

  it('Nobody attends is still counted in Meal Slots, once per slot, and still needs an Admin', async () => {
    const slots = ['2026-11-10', '2026-11-11'].map((d) => dinner(d, [empty(1, 'Main', NOBODY), empty(2, 'Side', NOBODY)]))
    load([flat('2026-11-10', 1, 'Main', NOBODY), flat('2026-11-10', 2, 'Side', NOBODY), flat('2026-11-11', 1, 'Main', NOBODY), flat('2026-11-11', 2, 'Side', NOBODY)], slots)
    setup({ 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    expect(await screen.findByRole('group', { name: '2 Meal Slots' })).toHaveTextContent('Nobody is set to attend.')
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Choose who attends' })).not.toBeInTheDocument())
    expect(screen.getByText(/Ask an Admin/)).toBeInTheDocument()
  })

  it('no Cool-down or Variety Rule tile, whatever an old stored reason says', async () => {
    const old = { reason: 'no_candidates' as const, slotRuleClaimed: false, eliminated: { considered: 3, exclusion: 0, coolDown: 3, varietyRule: 0, advanceStep: 0 } }
    load([flat('2026-11-10', 2, 'Side', old)], [dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', old)])])
    setup()
    expect(await screen.findByRole('group', { name: '1 Side' })).toHaveTextContent('No Recipe fits.')
    expect(screen.queryByText(/Cool-down/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Review Cool-down' })).not.toBeInTheDocument()
  })
})
