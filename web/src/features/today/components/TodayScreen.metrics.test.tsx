// DS-TODAY: the metric strip on the real screen: streak (success), Leftovers to use (teal), Lines to get, one row, from the real hooks.
import { screen, within } from '@testing-library/react'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { mockApi, renderWithProviders } from '../../plan/test-utils'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ leftovers: [] as unknown[], lines: 0 }))

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: false, toConfirm: 0, couldntPlan: 0, leftovers: h.leftovers.length, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: new Date('2026-11-10T17:00:00Z'), nextSlot: null, nextDay: 'today', nextAction: 'cook', toConfirm: [], couldntPlan: [], leftovers: h.leftovers, planToday: '2026-11-10',
    spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))
vi.mock('../shopSeam', () => ({ useLinesToGet: () => ({ count: h.lines, loading: false }) }))

afterEach(() => {
  h.leftovers = []
  h.lines = 0
  vi.unstubAllGlobals()
})

const leftover = (id: number) => ({ id, recipeId: id, recipeName: `Soup ${id}`, portions: 2, cookedOn: '2026-11-09', useBy: '2026-11-12', fromDate: '2026-11-09', fromMealSlotId: 2 })
const routed = (
  <Routes>
    <Route path="/" element={<TodayScreen />} />
  </Routes>
)

describe('TodayScreen: the metric strip', () => {
  it('shows the streak, the Leftovers count and the Lines to get in one strip, each with its colour role', async () => {
    h.leftovers = [leftover(1), leftover(2), leftover(3)]
    h.lines = 16
    mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 2 } })
    const { container } = renderWithProviders(routed, '/')
    const strip = await screen.findByRole('group', { name: 'At a glance' })
    expect(strip).toHaveAttribute('data-min', 'metric')
    expect(within(strip).getByText('2 d')).toBeInTheDocument()
    expect(within(strip).getByText('16')).toBeInTheDocument()
    expect(strip.querySelector('[data-metric="leftovers"]')).toHaveTextContent('3')
    expect(container.querySelector('[data-metric="streak"]')).toHaveAttribute('data-status', 'success')
    expect(container.querySelector('[data-metric="leftovers"]')).toHaveAttribute('data-status', 'leftover')
  })

  it('has no strip when there is nothing to count (no streak, no Leftovers, no Lines)', async () => {
    mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } })
    renderWithProviders(routed, '/')
    expect(await screen.findByRole('heading', { name: 'Nothing on the menu. The kitchen is yours.' })).toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'At a glance' })).not.toBeInTheDocument()
  })

  it('the Leftovers tile below still opens the Plan: the metric is a count, not a second button', async () => {
    h.leftovers = [leftover(1)]
    mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } })
    renderWithProviders(routed, '/')
    await screen.findByRole('group', { name: 'At a glance' })
    expect(screen.getAllByRole('button', { name: 'Leftovers to use' })).toHaveLength(1)
  })
})
