import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { meal, mockApi, renderWithProviders, slot } from '../../plan/test-utils'
import { TodayScreen } from './TodayScreen'

const h = vi.hoisted(() => ({ now: new Date('2026-11-10T17:00:00Z') }))

const leftoverDinner = () =>
  slot({
    date: '2026-11-10', mealSlotId: 2, name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z',
    meal: meal({ recipeName: 'Chicken curry', servedFromLeftover: { leftoverId: 4, date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken curry' } }),
  })

vi.mock('../seams', () => ({
  useScanSessionActive: () => false,
  useTodayPlan: () => ({ today: '2026-11-10', hasNextMeal: true, toConfirm: 0, couldntPlan: 0, leftovers: 0, loading: false }),
  useTodayStock: () => ({ spoiled: 0, useSoon: [], loading: false }),
  useTodayTileData: () => ({
    now: h.now, nextSlot: leftoverDinner(), nextDay: 'today', nextAction: 'reheat', toConfirm: [], couldntPlan: [], leftovers: [], planToday: '2026-11-10',
    spoiled: [], stockToday: '2026-11-10', system: 'metric', useSoon: [], throwOut: vi.fn(), keep: vi.fn(), planLoading: false, stockLoading: false,
  }),
  ShoppingListSeam: () => createElement('p', null, 'The Shopping List'),
}))

afterEach(() => vi.unstubAllGlobals())

describe('TodayScreen: Reheat (R12)', () => {
  it('Reheat on the hero opens the Reheat screen of the Planned Meal, not Cook Mode', async () => {
    mockApi({ 'GET /api/today/advance-steps': { steps: [] }, 'GET /api/today/streak': { days: 0 } })
    renderWithProviders(
      <Routes>
        <Route path="/" element={<TodayScreen />} />
        <Route path="/cook/reheat/:date/:slotId" element={<p>Reheat screen</p>} />
        <Route path="/cook/meal/:date/:slotId" element={<p>Cook Mode screen</p>} />
      </Routes>,
      '/',
    )
    expect(screen.queryByRole('button', { name: /^Cook/ })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Reheat' }))
    expect(await screen.findByText('Reheat screen')).toBeInTheDocument()
  })
})
