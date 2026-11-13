// B5-F1: /plan?mark=<date>:<slot> opens that slot's Mark as Cooked / Mark all Cooked sheet over the Plan (the Shopping List hint's "Mark it").
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
  meal: courseMeal(courseId, courseName, { recipeName, mealSlotId: 4, date: DAY }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2, proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-13', needs: [],
})
const MARK = `/plan?mark=${DAY}:4`

function renderAt(slots: PlanSlot[], entries: string[] = [MARK], extra: Record<string, unknown> = {}) {
  const api = mockApi({
    'GET /api/plan': view(slots),
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

describe('PlanScreen ?mark=', () => {
  it('several Courses to cook: opens Mark all Cooked', async () => {
    renderAt([dinner()])
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    expect(await within(sheet).findByText('Roast chicken')).toBeInTheDocument()
    expect(within(sheet).getByText('Green beans')).toBeInTheDocument()
  })

  it('one Course to cook: opens that Course\'s Mark as Cooked and cooks only it', async () => {
    const api = renderAt([dinner([course(1, 'Main', 'Roast chicken', 'cooked'), course(2, 'Side', 'Green beans')])], [MARK], {
      [`POST /api/plan/${DAY}/4/2/cooked`]: { meal: courseMeal(2, 'Side', { state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] },
    })
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
    await waitFor(() => expect(api.callsTo('POST', `/api/plan/${DAY}/4/2/cooked`)).toHaveLength(1))
  })

  it('does not open anything before the plan has loaded, and opens once, not again on a refetch', async () => {
    const api = renderAt([dinner()])
    await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    expect(api.callsTo('GET', '/api/plan').length).toBeGreaterThan(0)
    expect(screen.getAllByRole('dialog', { name: 'Mark all Cooked' })).toHaveLength(1)
  })

  it('closing the sheet goes back to where it came from (the Shopping List)', async () => {
    renderAt([dinner()], ['/shop', MARK])
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    expect(await screen.findByText('Shopping List screen')).toBeInTheDocument()
  })

  it('opened directly (no history) closing stays on the Plan without the parameter', async () => {
    renderAt([dinner()])
    const sheet = await screen.findByRole('dialog', { name: 'Mark all Cooked' })
    await userEvent.click(within(sheet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Plan' })).toBeInTheDocument()
    // a refetch after closing must not reopen it
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a slot with nothing left to mark says so and leaves at once', async () => {
    renderAt([dinner([course(1, 'Main', 'Roast chicken', 'cooked')])])
    expect(await screen.findByText('Nothing is left to mark Cooked there.')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('a malformed parameter is ignored: the Plan shows as usual', async () => {
    renderAt([dinner()], ['/plan?mark=nonsense'])
    expect(await screen.findByRole('heading', { name: 'Plan' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
