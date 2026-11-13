// b5-ufw round 3: against a server whose cook preview needs carry no baseUnit or lots yet, the Plan's sheets do not throw and show no Used from.
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { PlanScreen } from './PlanScreen'
import { courseMeal, courseSlot, mockApi, newQueryClient, planCourse } from '../test-utils'
import type { CookPreview, PlanSlot, PlanView } from '../types'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))
afterEach(() => vi.unstubAllGlobals())

const TODAY = '2026-11-10'
const DAY = '2026-11-09' // yesterday: its Planned Meals are still to confirm
const course = (id: number, name: string, recipeName: string, state: 'planned' | 'cooked' = 'planned') =>
  planCourse({ courseId: id, name, main: id === 1, meal: courseMeal(id, name, { date: DAY, mealSlotId: 4, recipeName, state }) })
const dinner = (courses = [course(1, 'Main', 'Roast chicken'), course(2, 'Side', 'Green beans')]): PlanSlot =>
  courseSlot(courses, { date: DAY, mealSlotId: 4, name: 'Dinner', time: '19:00', at: `${DAY}T19:00:00Z` })
const view = (slots: PlanSlot[]): PlanView => ({ today: TODAY, horizonDays: 3, updating: false, slots })
const preview = (courseId: number, courseName: string, recipeName: string): CookPreview => ({
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4, date: DAY }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [{ ingredientId: 11, ingredient: 'Chicken thighs', quantity: 800 }],
})
const MARK = `/plan?mark=${DAY}:4`

function renderAt(slots: PlanSlot[], entries: string[] = [MARK], extra: Record<string, unknown> = {}) {
  const api = mockApi({
    // The server's plain GET /api/plan starts at today and never returns an earlier day; only the dated query returns the marked date.
    'GET /api/plan': view([]),
    [`GET /api/plan?from=${DAY}&to=${DAY}`]: view(slots),
    [`GET /api/plan/${DAY}/4/1/cook`]: preview(1, 'Main', 'Roast chicken'),
    [`GET /api/plan/${DAY}/4/2/cook`]: preview(2, 'Side', 'Green beans'),
    ...extra,
  })
  render(
    <QueryClientProvider client={newQueryClient()}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
            <Routes>
              <Route path="/shop" element={<p>Shopping List screen</p>} />
              <Route path="/plan" element={<PlanScreen />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
  return api
}

describe('Plan: cook previews from an older server (needs without baseUnit or lots)', () => {
  it('Mark all Cooked opens without throwing, has no Used from row, and marks both Courses Cooked', async () => {
    const api = renderAt([dinner()], [MARK], { [`POST /api/plan/${DAY}/4/all/cooked`]: { meals: [], leftovers: [], warnings: [], plannedFor: [] } })
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Main Leftover portions' })
    expect(within(sheet).queryByRole('button', { name: /Used from/ })).not.toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark all Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', `/api/plan/${DAY}/4/all/cooked`)).toHaveLength(1))
    const body = api.callsTo('POST', `/api/plan/${DAY}/4/all/cooked`)[0]!.body as { courses: Array<{ usedFrom?: unknown }> }
    expect(body.courses.every((c) => c.usedFrom === undefined)).toBe(true)
  })

  it('Mark as Cooked opens without throwing, has no Used from row, and marks the Course Cooked', async () => {
    const api = renderAt([dinner([course(1, 'Main', 'Roast chicken', 'cooked'), course(2, 'Side', 'Green beans')])], [MARK], {
      [`POST /api/plan/${DAY}/4/2/cooked`]: { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] },
    })
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await within(sheet).findByRole('spinbutton', { name: 'Leftover portions' })
    expect(within(sheet).queryByRole('button', { name: /Used from/ })).not.toBeInTheDocument()
    await userEvent.click(within(sheet).getByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', `/api/plan/${DAY}/4/2/cooked`)).toHaveLength(1))
    expect(api.callsTo('POST', `/api/plan/${DAY}/4/2/cooked`)[0]!.body).toEqual({ leftoverPortions: 2 })
  })
})
