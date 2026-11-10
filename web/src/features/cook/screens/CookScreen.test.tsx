import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { meal, mockApi, renderWithProviders } from '../../plan/test-utils'
import type { CookedResult, CookPreview } from '../../plan/types'
import type { CookTimer, CookView } from '../types'
import { CookScreen } from './CookScreen'
import { noticeWith, findNotice } from '../../../test/notices'

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
const shortfall = {
  ingredientId: 11, name: 'chicken thighs', baseUnit: 'g' as const, have: 300, need: 400, shortfall: 100,
  message: 'Stock shows only 300 g chicken thighs, the recipe uses 400 g',
}
const tuesday = { date: '2026-11-10', mealSlotId: 3, mealSlotName: 'Dinner', recipeName: 'Chicken' }
const cooked = (warnings: CookedResult['warnings'], over: Partial<CookedResult> = {}): CookedResult => ({
  meal: meal({ state: 'cooked' }), leftover: null, warnings, plannedFor: [], ...over,
})
const leftover2 = { id: 3, recipeId: 7, recipeName: 'Chicken', portions: 2, cookedOn: '2026-11-09', useBy: '2026-11-12', fromDate: '2026-11-09', fromMealSlotId: 2 }

const mealRoutes = {
  'GET /api/cook/meals/2026-11-09/2': mealView,
  'GET /api/cook/timers': timers,
  'GET /api/plan/2026-11-09/2/cook': preview,
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

async function confirmCooked() {
  await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
  const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
  await userEvent.click(await within(sheet).findByRole('button', { name: 'Mark as Cooked' }))
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', undefined)
})

describe('CookScreen: Mark as Cooked', () => {
  it('B13: confirms where the Leftover went, then leaves on Back to Today', async () => {
    const api = mockApi({
      ...mealRoutes,
      'POST /api/plan/2026-11-09/2/cooked': cooked([], { leftover: leftover2, plannedFor: [tuesday] }),
    })
    renderMeal()
    await confirmCooked()
    expect(await screen.findByRole('heading', { name: 'Marked as Cooked' })).toBeInTheDocument()
    expect(await findNotice('status', '2 portions planned for Tue Dinner')).toHaveTextContent('2 portions planned for Tue Dinner')
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/2026-11-09/2/cooked')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: 'Back to Today' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })

  it('B13: says a Leftover nothing is planned for is kept, and when there is none', async () => {
    mockApi({ ...mealRoutes, 'POST /api/plan/2026-11-09/2/cooked': cooked([], { leftover: { ...leftover2, portions: 1 } }) })
    renderMeal()
    await confirmCooked()
    expect(await findNotice('status', '1 portion kept, good until Thu')).toHaveTextContent('1 portion kept, good until Thu')
  })

  it('B13: reports no Leftovers when none were recorded', async () => {
    mockApi({ ...mealRoutes, 'POST /api/plan/2026-11-09/2/cooked': cooked([]) })
    renderMeal()
    await confirmCooked()
    expect(await findNotice('status', 'No Leftovers')).toHaveTextContent('No Leftovers')
  })

  it('B13: Mark as Cooked is not offered again, even when the Step view is refreshed as no longer cookable', async () => {
    let viewCalls = 0
    mockApi({
      ...mealRoutes,
      'GET /api/cook/meals/2026-11-09/2': () => (++viewCalls === 1 ? mealView : { status: 409, json: { error: { code: 'not_cookable', message: 'x' } } }),
      'POST /api/plan/2026-11-09/2/cooked': cooked([]),
    })
    renderMeal()
    await confirmCooked()
    expect(await screen.findByRole('heading', { name: 'Marked as Cooked' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mark as Cooked' })).not.toBeInTheDocument()
    expect(screen.queryByText('This meal has already been cooked or skipped')).not.toBeInTheDocument()
  })

  it('stays with the Stock warning next to the confirmation, and shows Back to Today as well', async () => {
    const api = mockApi({
      ...mealRoutes,
      'POST /api/plan/2026-11-09/2/cooked': cooked([shortfall]),
      'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] },
    })
    renderMeal()
    await confirmCooked()

    expect(await screen.findByRole('heading', { name: 'Marked as Cooked' })).toBeInTheDocument()
    const notice = await findNotice('alert', 'Stock shows only 300 g chicken thighs')
    expect(notice).toHaveTextContent('Stock shows only 300 g chicken thighs, the recipe uses 400 g')

    await userEvent.click(within(notice).getByRole('button', { name: 'Correct Stock' }))
    const correct = await screen.findByRole('dialog', { name: 'How much chicken thighs do you have?' })
    const input = within(correct).getByLabelText('Total in Stock')
    await userEvent.clear(input)
    await userEvent.type(input, '250')
    await userEvent.click(within(correct).getByRole('button', { name: 'Set total' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 250 }))
    // The confirmation stays until the User leaves.
    expect(screen.getByRole('heading', { name: 'Marked as Cooked' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back to Today' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })

  it('dismissing a warning leaves Stock alone and keeps the confirmation', async () => {
    const api = mockApi({ ...mealRoutes, 'POST /api/plan/2026-11-09/2/cooked': cooked([shortfall]) })
    renderMeal()
    await confirmCooked()
    expect(await findNotice('alert', 'Stock shows only 300 g chicken thighs')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    await waitFor(() => expect(noticeWith('alert', 'Stock shows only 300 g chicken thighs')).toBeUndefined())
    expect(screen.getByRole('heading', { name: 'Marked as Cooked' })).toBeInTheDocument()
    expect(api.calls.some((c) => c.path.startsWith('/api/stock'))).toBe(false)
  })

  it('Not cooked leaves immediately', async () => {
    const api = mockApi({ ...mealRoutes, 'POST /api/plan/2026-11-09/2/not-cooked': meal({ state: 'skipped' }) })
    renderMeal()
    await userEvent.click(await screen.findByRole('button', { name: 'Mark as Cooked' }))
    const sheet = await screen.findByRole('dialog', { name: 'Mark as Cooked' })
    await userEvent.click(await within(sheet).findByRole('button', { name: 'Not cooked' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/2026-11-09/2/not-cooked')).toHaveLength(1)
  })

  it('B10: a Planned Meal for a later day cannot be marked Cooked', async () => {
    const future = { ...mealView, scope: 'meal:2026-11-10/3', meal: { date: '2026-11-10', mealSlotId: 3 }, today: '2026-11-09' }
    mockApi({ 'GET /api/cook/meals/2026-11-10/3': future, 'GET /api/cook/timers': timers })
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

  it('shows this scope\'s timers and the household\'s other running timers, with pause and cancel', async () => {
    const api = mockApi({
      ...mealRoutes,
      'GET /api/cook/timers': { now: '2026-11-09T12:00:00Z', timers: [t({}), t({ id: 2, scope: 'recipe:9', step: 1, label: 'Step 1: Boil rice', remainingSeconds: 300, endsAt: '2026-11-09T12:05:00Z' })] },
      'POST /api/cook/timers/2/pause': t({ id: 2, state: 'paused' }),
      'DELETE /api/cook/timers/1': undefined,
    })
    renderMeal()
    expect(await screen.findByRole('region', { name: 'Timers' })).toBeInTheDocument()
    const other = await screen.findByRole('region', { name: 'Other timers' })
    expect(within(other).getByRole('timer', { name: 'Step 1: Boil rice' })).toBeInTheDocument()
    await userEvent.click(within(within(other).getByRole('timer', { name: 'Step 1: Boil rice' })).getByRole('button', { name: 'Pause Step 1: Boil rice' }))
    await waitFor(() => expect(api.callsTo('POST', '/api/cook/timers/2/pause')).toHaveLength(1))
    await userEvent.click(within(screen.getByRole('timer', { name: 'Step 3: Simmer' })).getByRole('button', { name: 'Cancel Step 3: Simmer' }))
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
const twoStepRoutes = { ...mealRoutes, 'GET /api/cook/meals/2026-11-09/2': twoSteps() }

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
    mockApi({ ...mealRoutes, 'GET /api/cook/meals/2026-11-09/2': twoSteps({ advance: [{ step: 4, text: 'Marinate the chicken', leadTimeMinutes: 240, done: true, doneAt: '2026-11-09T08:00:00Z', warning: false }] }) })
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
