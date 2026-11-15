import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { meal, mockApi, renderWithProviders } from '../../plan/test-utils'
import type { CookPreview } from '../../plan/types'
import type { CookTimer, CookView } from '../types'
import { CookScreen } from './CookScreen'
import { noticeWith } from '../../../test/notices'
import { oneCourseTimeline } from '../timeline-fixtures'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const mealView: CookView = {
  scope: 'meal:2026-11-09/2', recipeId: 7, recipeName: 'Chicken', batches: 1,
  meal: { date: '2026-11-09', mealSlotId: 2 }, today: '2026-11-09', advance: [],
  steps: [{ index: 0, number: 1, of: 1, kind: 'active', text: 'Roast the chicken', durationMinutes: 40, imageUrl: '', uses: [], timer: null }],
  timers: [],
}
const recipeView: CookView = { ...mealView, scope: 'recipe:7', meal: null, today: '2026-11-09' }
const timers = { now: '2026-11-09T12:00:00Z', timers: [] }
const preview: CookPreview = {
  meal: meal({ date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2,
  proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-12', needs: [],
}

const planStub = { today: '2026-11-09', horizonDays: 3, updating: false, slots: [] }
// The timeline is server-driven: once the only Course is Cooked (or skipped) the refetched timeline lists it resolved, with no items.
let resolved = false
const timelineNow = (view: CookView = mealView) => {
  const open = oneCourseTimeline(view)
  return resolved ? { ...open, courses: open.courses.map((c) => ({ ...c, state: 'cooked' as const })), items: [], advance: [] } : open
}
const resolves = <T,>(out: T) => () => {
  resolved = true
  return out
}
const mealRoutes = {
  'GET /api/cook/meals/2026-11-09/2/all': () => timelineNow(),
  'GET /api/plan': planStub,
  'GET /api/cook/timers': timers,
  'GET /api/plan/2026-11-09/2/1/cook': preview,
}

function renderMeal() {
  return renderWithProviders(
    <Routes>
      <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
      <Route path="/" element={<p>Home page</p>} />
    </Routes>,
    '/cook/meal/2026-11-09/2',
  )
}

beforeEach(() => {
  resolved = false
  vi.stubGlobal('matchMedia', undefined)
})

describe('CookScreen: Mark as Cooked', () => {
  it('Not cooked leaves immediately', async () => {
    const api = mockApi({ ...mealRoutes, 'POST /api/plan/2026-11-09/2/1/not-cooked': resolves(meal({ state: 'skipped' })) })
    renderMeal()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Not cooked' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/2026-11-09/2/1/not-cooked')).toHaveLength(1)
  })

  it('B10: a Planned Meal for a later day cannot be marked Cooked', async () => {
    const future = { ...mealView, scope: 'meal:2026-11-10/3', meal: { date: '2026-11-10', mealSlotId: 3 }, today: '2026-11-09' }
    mockApi({ 'GET /api/cook/meals/2026-11-10/3/all': oneCourseTimeline(future), 'GET /api/cook/timers': timers, 'GET /api/plan': planStub })
    renderWithProviders(
      <Routes>
        <Route path="/cook/meal/:date/:slotId" element={<CookScreen />} />
      </Routes>,
      '/cook/meal/2026-11-10/3',
    )
    await screen.findByRole('article', { name: 'Step 1 of 1' })
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
  })
})

describe('CookScreen: timers (B14)', () => {
  const t = (over: Partial<CookTimer>): CookTimer => ({
    id: 1, scope: 'meal:2026-11-09/2', step: 3, label: 'Step 3: Simmer', durationSeconds: 600, state: 'running', remainingSeconds: 600,
    endsAt: '2026-11-09T12:10:00Z', startedAt: '2026-11-09T12:00:00Z', ...over,
  })

  // B9-40 (PC-03): one "Timers" region for every timer (this scope's and the household's others, this scope's first); Pause on the tile or
  // pill, Cancel in the timer's sheet.
  it('shows this scope\'s timers and the household\'s other running timers, with pause and cancel', async () => {
    const api = mockApi({
      ...mealRoutes,
      'GET /api/cook/timers': { now: '2026-11-09T12:00:00Z', timers: [t({}), t({ id: 2, scope: 'recipe:9', step: 1, label: 'Step 1: Boil rice', remainingSeconds: 300, endsAt: '2026-11-09T12:05:00Z' })] },
      'POST /api/cook/timers/2/pause': t({ id: 2, state: 'paused' }),
      'DELETE /api/cook/timers/1': undefined,
    })
    renderMeal()
    const region = await screen.findByRole('region', { name: 'Timers' })
    expect(screen.queryByRole('region', { name: 'Other timers' })).not.toBeInTheDocument()
    expect(within(region).getAllByRole('timer').map((x) => x.getAttribute('aria-label'))).toEqual(['Simmer', 'Boil rice'])
    await userEvent.click(within(within(region).getByRole('timer', { name: 'Boil rice' })).getByRole('button', { name: 'Pause Boil rice' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers/2/pause')).toHaveLength(1))
    await userEvent.click(within(within(region).getByRole('timer', { name: 'Simmer' })).getByRole('button', { name: 'Options for Simmer' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Cancel timer' }))
    await waitFor(() => expect(api.callsTo('DELETE', '/api/cook/timers/1')).toHaveLength(1))
  })
})

describe('CookScreen: a Recipe scope', () => {
  it('finishes with Back to Recipe, never Done', async () => {
    mockApi({ 'GET /api/cook/recipes/7?batches=1': recipeView, 'GET /api/cook/timers': timers })
    renderWithProviders(
      <Routes>
        <Route path="/cook/recipe/:id" element={<CookScreen />} />
        <Route path="/recipes/:id" element={<p>Recipe page</p>} />
      </Routes>,
      '/cook/recipe/7',
    )
    await screen.findByRole('article', { name: 'Step 1 of 1' })
    expect(screen.queryByRole('button', { name: 'Done' })).not.toBeInTheDocument()
    await userEvent.click(await screen.findByRole('button', { name: 'Back to Recipe' }))
    expect(await screen.findByText('Recipe page')).toBeInTheDocument()
  })

  it('finishing with Back to Recipe forgets the resume Step (PC-04, w4a call): the pill reopens it at Step 1 next time', async () => {
    mockApi({ 'GET /api/cook/recipes/7?batches=1': recipeView, 'GET /api/cook/timers': timers })
    renderWithProviders(
      <Routes>
        <Route path="/cook/recipe/:id" element={<CookScreen />} />
        <Route path="/recipes/:id" element={<p>Recipe page</p>} />
      </Routes>,
      '/cook/recipe/7',
    )
    await screen.findByRole('article', { name: 'Step 1 of 1' })
    await waitFor(() => expect(localStorage.getItem('feeder.cook.resume.recipe:7')).not.toBeNull())
    await userEvent.click(await screen.findByRole('button', { name: 'Back to Recipe' }))
    expect(await screen.findByText('Recipe page')).toBeInTheDocument()
    expect(localStorage.getItem('feeder.cook.resume.recipe:7')).toBeNull()
  })
})

const twoSteps = (over: Partial<CookView> = {}): CookView => ({
  ...mealView,
  advance: [{ step: 4, text: 'Marinate the chicken', leadTimeMinutes: 240, done: false, doneAt: null, warning: true }],
  steps: [
    { index: 0, number: 1, of: 2, kind: 'active', text: 'Chop the onion', durationMinutes: 5, imageUrl: '', uses: [{ ingredientId: 1, ingredient: 'onion', quantity: 4, unit: 'piece' }], timer: null },
    { index: 1, number: 2, of: 2, kind: 'passive', text: 'Simmer', durationMinutes: 15, imageUrl: '', uses: [], timer: { label: 'Step 2: Simmer', durationSeconds: 900 } },
  ],
  ...over,
})
const twoStepRoutes = { ...mealRoutes, 'GET /api/cook/meals/2026-11-09/2/all': oneCourseTimeline(twoSteps()) }

describe('CookScreen: layout (2.7, 5.12)', () => {
  it('has the top row: Exit, the Step pill and the voice icon button', async () => {
    mockApi(twoStepRoutes)
    renderMeal()
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(screen.getByRole('button', { name: 'Exit' })).toBeInTheDocument()
    expect(noticeWith('status', 'Step 1 of 2')).toBeTruthy()
    expect(screen.getByRole('button', { name: /^Voice commands/ })).toHaveClass('icon-button')
  })

  it('Exit leaves a Planned Meal for Today and a Recipe for the Recipe', async () => {
    mockApi(twoStepRoutes)
    renderMeal()
    await userEvent.click(await screen.findByRole('button', { name: 'Exit' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })

  it('Exit from a Recipe session goes to /recipes/:id', async () => {
    mockApi({ 'GET /api/cook/recipes/7?batches=2': { ...twoSteps(), scope: 'recipe:7', meal: null, batches: 2 }, 'GET /api/cook/timers': timers })
    renderWithProviders(
      <Routes>
        <Route path="/cook/recipe/:id" element={<CookScreen />} />
        <Route path="/recipes/:id" element={<p>Recipe page</p>} />
      </Routes>,
      '/cook/recipe/7?batches=2',
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Exit' }))
    expect(await screen.findByText('Recipe page')).toBeInTheDocument()
  })

  it('opens a Recipe with its Batch count and shows it (route /cook/recipe/:id?batches=2)', async () => {
    const api = mockApi({ 'GET /api/cook/recipes/7?batches=2': { ...twoSteps(), scope: 'recipe:7', meal: null, batches: 2 }, 'GET /api/cook/timers': timers })
    renderWithProviders(<Routes><Route path="/cook/recipe/:id" element={<CookScreen />} /></Routes>, '/cook/recipe/7?batches=2')
    expect(await screen.findByText('2 Batches')).toBeInTheDocument()
    expect(api.callsTo('GET', '/api/cook/recipes/7?batches=2')).toHaveLength(1)
  })

  it('shows the Step amounts on a Uses line', async () => {
    mockApi(twoStepRoutes)
    renderMeal()
    expect(await screen.findByText(/^Uses/)).toHaveTextContent(/onion/)
  })

  it('shows the pending Advance Step as a status tile before Step 1 only', async () => {
    const api = mockApi({ ...twoStepRoutes, 'PUT /api/cook/marks': { scope: 'meal:2026-11-09/2', step: 4, done: true, doneAt: '2026-11-09T12:00:00Z' } })
    renderMeal()
    expect(await screen.findByText('Marinate the chicken · 4 h ahead')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Done' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/cook/marks')).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Next' }))
    expect(await screen.findByRole('article', { name: 'Step 2 of 2' })).toBeInTheDocument()
    expect(screen.queryByText(/Marinate the chicken/)).not.toBeInTheDocument()
  })

  it('does not show the Advance tile once everything is done', async () => {
    mockApi({ ...mealRoutes, 'GET /api/cook/meals/2026-11-09/2/all': oneCourseTimeline(twoSteps({ advance: [{ step: 4, text: 'Marinate the chicken', leadTimeMinutes: 240, done: true, doneAt: '2026-11-09T08:00:00Z', warning: false }] })) })
    renderMeal()
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(screen.queryByText(/Marinate the chicken/)).not.toBeInTheDocument()
  })

  it('has no Screen-stays-awake chip and no Batches chip for one Batch', async () => {
    mockApi(twoStepRoutes)
    renderMeal()
    await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(screen.queryByText('Screen stays awake')).not.toBeInTheDocument()
    expect(screen.queryByText('1 Batch')).not.toBeInTheDocument()
  })

  it('tablet: shows tap zones and a one-time coach mark', async () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q, addEventListener: () => {}, removeEventListener: () => {} }))
    localStorage.clear()
    mockApi(twoStepRoutes)
    renderMeal()
    const step = await screen.findByRole('article', { name: 'Step 1 of 2' })
    expect(step.querySelectorAll('[data-zone]')).toHaveLength(2)
    await userEvent.click(screen.getByRole('button', { name: 'Got it' }))
    expect(screen.queryByText('Tap the right side for next, the left side for back')).not.toBeInTheDocument()
  })
})
