// CRS F: /cook/reheat/:date/:slotId/:courseId reheats THAT Course's Planned Meal (its timer scope, its Mark as Cooked), not the slot's main one.
import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { courseMeal, courseSlot, mockApi, planCourse, renderWithProviders } from '../../plan/test-utils'
import type { CookedResult, CookPreview, PlanView } from '../../plan/types'
import { ReheatScreen } from './ReheatScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const source = { leftoverId: 4, date: '2026-11-09', mealSlotId: 4, recipeName: 'Green beans' }
// Main (id 1) is a fresh Roast chicken; Side (id 2) is served from a Leftover and is the one to reheat.
const mainMeal = courseMeal(1, 'Main', { date: '2026-11-10', mealSlotId: 4, recipeName: 'Roast chicken' })
const sideMeal = (over = {}) =>
  courseMeal(2, 'Side', { date: '2026-11-10', mealSlotId: 4, recipeId: 8, recipeName: 'Green beans', portions: 4, reheatMinutes: 5, servedFromLeftover: source, ...over })
const planView = (side = sideMeal()): PlanView => ({
  today: '2026-11-10', horizonDays: 7, updating: false,
  slots: [
    courseSlot([planCourse({ courseId: 1, main: true, name: 'Main', meal: mainMeal }), planCourse({ courseId: 2, main: false, name: 'Side', meal: side })], {
      date: '2026-11-10', mealSlotId: 4, name: 'Dinner',
    }),
  ],
})
const preview: CookPreview = {
  meal: sideMeal(), fresh: false, batches: 0, yield: 0, portionsNeeded: 4, proposedLeftover: 0, maxLeftover: 0, leftoverUseBy: '', needs: [],
}
const cooked: CookedResult = { meal: sideMeal({ state: 'cooked' }), leftover: null, warnings: [], plannedFor: [] }
const timers = () => ({ now: '2026-11-10T18:00:00Z', timers: [] })

function renderReheat() {
  return renderWithProviders(
    <Routes>
      <Route path="/cook/reheat/:date/:slotId/:courseId" element={<ReheatScreen />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    '/cook/reheat/2026-11-10/4/2',
  )
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})

describe('ReheatScreen for a Course', () => {
  it("shows that Course's Planned Meal and its own reheating time, not the main Course's", async () => {
    mockApi({ 'GET /api/plan': planView(), 'GET /api/cook/timers': timers() })
    renderReheat()
    expect(await screen.findByRole('heading', { name: 'Green beans' })).toBeInTheDocument()
    expect(screen.getByText('5:00')).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Roast chicken' })).not.toBeInTheDocument()
    expect(screen.queryByText('This Planned Meal is not served from a Leftover')).not.toBeInTheDocument()
  })

  it("starts the Reheat timer in the Course's three-part scope", async () => {
    const api = mockApi({
      'GET /api/plan': planView(), 'GET /api/cook/timers': timers(),
      'POST /api/cook/timers': { status: 201, json: { id: 9, scope: 'meal:2026-11-10/4/2', step: null, label: 'Reheat', durationSeconds: 300, state: 'running', remainingSeconds: 300, endsAt: '2026-11-10T18:05:00Z', startedAt: '2026-11-10T18:00:00Z' } },
    })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Start timer' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers')).toHaveLength(1))
    expect(api.callsTo('POST', '/api/cook/timers')[0]?.body).toMatchObject({ scope: 'meal:2026-11-10/4/2', label: 'Reheat', durationSeconds: 300 })
  })

  it("Mark as Cooked cooks that Course's Planned Meal (…/4/2/cooked), not the slot's main one", async () => {
    let plan = planView()
    const api = mockApi({
      'GET /api/plan': () => plan, 'GET /api/cook/timers': timers(),
      'GET /api/plan/2026-11-10/4/2/cook': preview,
      'POST /api/plan/2026-11-10/4/2/cooked': () => {
        plan = planView(sideMeal({ state: 'cooked' }))
        return cooked
      },
    })
    renderReheat()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/2026-11-10/4/2/cooked')).toHaveLength(1)
    expect(api.calls.some((c) => c.path === '/api/plan/2026-11-10/4/cooked')).toBe(false)
  })
})
