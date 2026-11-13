// b5-ufw round 3: Today's Mark all Cooked against a server whose cook preview needs carry no baseUnit or lots yet.
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createElement } from 'react'
import { Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { allCookedResult, courseMeal, courseSlot, mockApi, planCourse, renderWithProviders } from '../../plan/test-utils'
import type { CookPreview } from '../../plan/types'
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
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4, date }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [{ ingredientId: 11, ingredient: 'Chicken thighs', quantity: 800 }],
})

afterEach(() => {
  h.toConfirm = []
  h.nextSlot = null
  vi.unstubAllGlobals()
})


describe('Today: Mark all Cooked with cook previews from an older server', () => {
  it('opens without throwing, shows no Used from row, and still marks everything Cooked', async () => {
    h.nextSlot = courseSlot(
      [
        planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { mealSlotId: 4, recipeName: 'Roast chicken' }) }),
        planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { mealSlotId: 4, recipeName: 'Green beans' }) }),
      ],
      { date: '2026-11-10', mealSlotId: 4, name: 'Dinner', time: '19:30', at: '2026-11-10T19:30:00Z' },
    )
    const api = mockApi({
      ...base,
      'GET /api/plan/2026-11-10/4/1/cook': preview(1, 'Main', 'Roast chicken', '2026-11-10'),
      'GET /api/plan/2026-11-10/4/2/cook': preview(2, 'Side', 'Green beans', '2026-11-10'),
      'POST /api/plan/2026-11-10/4/all/cooked': allCookedResult(),
    })
    renderWithProviders(routed, '/')
    await userEvent.click(await screen.findByRole('button', { name: 'Dinner actions' }))
    await userEvent.click(screen.getByRole('menuitem', { name: 'Mark all Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Main Leftover portions' })
    expect(within(sheet).queryByRole('button', { name: /Used from/ })).not.toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/plan/2026-11-10/4/all/cooked')).toHaveLength(1))
  })
})
