// CRS F: the board reads the payload's `slots` (with Courses), and its big Cook button opens tonight's cooking timeline.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { BoardData, SlotLike } from '../types'

const h = vi.hoisted(() => ({ data: undefined as unknown, planSlots: [] as unknown[] }))
vi.mock('../hooks/useBoard', () => ({
  useBoard: () => ({ data: h.data, isLoading: false, error: null, refetch: vi.fn() }),
  useBoardScheme: () => ({ dark: false }),
  useAdvanceDone: () => vi.fn(),
  useNow: () => new Date('2026-11-09T17:00:00Z'),
}))
vi.mock('../hooks/useBoardPalette', () => ({ useBoardPalette: () => undefined }))
vi.mock('../../plan', () => ({ usePlan: () => ({ slots: h.planSlots }), useLeftovers: () => ({ leftovers: [] }) }))
vi.mock('../../stock/hooks/useStock', () => ({ useStockTotals: () => ({ data: [] }) }))
vi.mock('../../cook/hooks/useTimers', () => ({ useTimers: () => ({ items: [] }) }))
vi.mock('../../settings/hooks/useHouseholdSettings', () => ({ useHouseholdSettings: () => ({ settings: { timeZone: 'UTC' } }) }))

import { BoardScreen } from './BoardScreen'

const meal = (recipeName: string) => ({ recipeId: 1, recipeName, batches: 1, portions: 4, state: 'planned' as const })
const dinner = (date: string): SlotLike => ({
  date, mealSlotId: 2, name: 'Dinner', time: '19:00', at: `${date}T19:00:00Z`, meal: meal('Roast chicken'),
  courses: [
    { courseId: 1, name: 'Main', main: true, meal: meal('Roast chicken') },
    { courseId: 2, name: 'Side', main: false, meal: meal('Green beans') },
  ],
})
const data = (slots?: SlotLike[]): BoardData => ({
  now: '2026-11-09T17:00:00Z', today: '2026-11-09', theme: { dark: false, nextChangeAt: '2026-11-10T06:00:00Z', source: 'sun', reason: '' }, streak: { days: 3 }, nextAdvance: null, slots,
})
const view = () =>
  render(
    <MemoryRouter initialEntries={['/board']}>
      <Routes>
        <Route path="/board" element={<BoardScreen />} />
        <Route path="/cook/meal/:date/:slotId" element={<p>Cook timeline</p>} />
      </Routes>
    </MemoryRouter>,
  )

afterEach(() => {
  h.planSlots = []
})

describe('BoardScreen with Courses', () => {
  it('tonight lists the Courses of the payload\'s slot, tomorrow writes the slot on one line', () => {
    h.data = data([dinner('2026-11-09'), dinner('2026-11-10')])
    view()
    expect(screen.getAllByText('Roast chicken').length).toBeGreaterThan(0)
    expect(screen.getByText('Green beans')).toBeInTheDocument()
    expect(screen.getByText('Dinner: Roast chicken + Green beans')).toBeInTheDocument()
  })

  it('reads the plan\'s slots when the payload has none (an older server): nothing changes', () => {
    h.data = data(undefined)
    h.planSlots = [{ ...dinner('2026-11-09'), courses: undefined, meal: meal('Chicken stew') }]
    view()
    expect(screen.getByText('Chicken stew')).toBeInTheDocument()
  })

  it('the big Cook button opens tonight\'s slot timeline, with no Course in the route', async () => {
    h.data = data([dinner('2026-11-09')])
    view()
    await userEvent.click(screen.getByRole('button', { name: 'Cook' }))
    expect(await screen.findByText('Cook timeline')).toBeInTheDocument()
  })
})
