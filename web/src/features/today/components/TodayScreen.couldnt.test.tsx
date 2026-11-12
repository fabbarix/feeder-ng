import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PlanEntry } from '../../plan/types'
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

const none = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }
const unplanned = (date: string, name: string, id: number): PlanEntry => ({
  date, mealSlotId: id, name, time: '19:00', at: `${date}T19:00:00Z`, portions: 0, courseId: 1, courseName: 'Main', meal: null, rules: [],
  unfilled: { reason: 'no_attendance', slotRuleClaimed: false, eliminated: none },
})
// The screenshot of the bug: Tue to Mon dinners and the weekend breakfasts, all with nobody attending.
const dinners = ['10', '11', '12', '13', '14', '15', '16'].map((d, i) => unplanned(`2026-11-${d}`, 'Dinner', 10 + i))
const breakfasts = ['14', '15'].map((d, i) => unplanned(`2026-11-${d}`, 'Breakfast', 20 + i))
const established: SetupFacts = { members: 2, mealSlots: 9, mealSlotsWithAttendance: 0, recipes: 5, plannedMeals: 0, unplannedMeals: 9 }

function setup(extra: Record<string, unknown> = {}) {
  mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 }, ...extra })
  return renderWithProviders(
    <Routes>
      <Route path="/" element={createElement(TodayScreen)} />
      <Route path="/settings/meal-slots" element={<p>Meal Slots page</p>} />
      <Route path="/settings/members" element={<p>Members page</p>} />
    </Routes>,
  )
}

describe('Scenario: 23:56, tonight\'s dinner is already past', () => {
  // Given Tuesday's dinner time has gone (no Planned Meal, no reason) and the six dinners after it cannot be planned
  // Then Today still says "Every dinner this week"
  it('the past slot is not counted in "all"', async () => {
    const gone: PlanEntry = { ...unplanned('2026-11-10', 'Dinner', 10), unfilled: null }
    h.couldnt = dinners.slice(1)
    h.all = [gone, ...dinners.slice(1)]
    h.facts = established
    setup()
    expect(await screen.findByText('Every dinner this week')).toBeInTheDocument()
  })
})

describe('Scenario: a plain User cannot reach Admin-only settings', () => {
  it('sees what is wrong but no "Choose who attends" button', async () => {
    h.couldnt = [...dinners, ...breakfasts]
    h.all = h.couldnt
    h.facts = established
    setup({ 'GET /api/me': { id: 2, email: 'u@example.com', displayName: 'U', isAdmin: false } })
    expect(await screen.findByRole('heading', { name: "Couldn't plan 9 Meal Slots. Nobody is set to attend." })).toBeInTheDocument()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Choose who attends' })).not.toBeInTheDocument())
    expect(screen.getByText(/Ask an Admin/)).toBeInTheDocument()
  })
})

describe('Scenario: nobody is set to attend nine meals', () => {
  // Given Members exist and every Meal Slot has no attendee
  // When I open Today
  // Then one tile says "Couldn't plan 9 Meal Slots. Nobody is set to attend." with a summary and "Choose who attends"
  it('shows one grouped tile in the grid, not nine lines', async () => {
    h.couldnt = [...dinners, ...breakfasts]
    h.all = h.couldnt
    h.facts = established
    setup()
    const slotEl = (await screen.findByRole('heading', { name: "Couldn't plan 9 Meal Slots. Nobody is set to attend." })).closest('[data-tile="couldntPlan"]') as HTMLElement
    expect(slotEl).not.toBeNull()
    expect(within(slotEl).getByText('Every dinner this week, plus weekend breakfasts')).toBeInTheDocument()
    expect(screen.queryByText(/Couldn't plan Tuesday dinner/)).not.toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    // a tile in the Bento grid taking the full row (never a 2-wide tile that leaves a hole on three columns), warm info tone, never the pink danger tile
    const tile = slotEl.querySelector('[data-cause="nobody_attending"]') as HTMLElement
    expect(tile).toHaveAttribute('data-span', 'full')
    expect(tile).toHaveAttribute('data-variant', 'status')
    expect(slotEl.querySelector('[data-status="danger"]')).toBeNull()
  })

  it('"Choose who attends" goes to the Meal Slots', async () => {
    h.couldnt = [...dinners, ...breakfasts]
    h.all = h.couldnt
    h.facts = established
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Choose who attends' }))
    expect(await screen.findByText('Meal Slots page')).toBeInTheDocument()
  })

  it('"Show all 9" expands the full list on request', async () => {
    h.couldnt = [...dinners, ...breakfasts]
    h.all = h.couldnt
    h.facts = established
    setup()
    await userEvent.click(await screen.findByRole('button', { name: 'Show all 9' }))
    expect(within(screen.getByRole('list')).getAllByRole('listitem')).toHaveLength(9)
  })
})

describe('Scenario: a new household opens Today', () => {
  // Given no Members, Meal Slots or Recipes
  // Then Today shows the setup checklist Members, Meal Slots and attendance, Recipes, first plan, and no failures
  it('shows the setup checklist instead of Couldn\'t plan or the empty state', async () => {
    h.facts = { members: 0, mealSlots: 0, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 0, unplannedMeals: 0 }
    setup()
    expect(await screen.findByRole('heading', { name: 'Set up your Household' })).toBeInTheDocument()
    expect(screen.queryByText(/couldn't be planned/)).not.toBeInTheDocument()
    expect(screen.queryByText('Nothing on the menu. The kitchen is yours.')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Add Members' }))
    expect(await screen.findByText('Members page')).toBeInTheDocument()
  })

  it('hides Couldn\'t plan while a setup step is missing, whatever the planner says', async () => {
    h.couldnt = dinners
    h.all = dinners
    h.facts = { members: 0, mealSlots: 7, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 0, unplannedMeals: 7 }
    setup()
    await screen.findByRole('heading', { name: 'Set up your Household' })
    await waitFor(() => expect(screen.queryByText(/couldn't be planned/)).not.toBeInTheDocument())
  })
})
