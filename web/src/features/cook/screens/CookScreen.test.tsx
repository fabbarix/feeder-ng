import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { meal, mockApi, renderWithProviders } from '../../plan/test-utils'
import type { CookedResult, CookPreview } from '../../plan/types'
import type { CookView } from '../types'
import { CookScreen } from './CookScreen'

vi.mock('../../../lib/sse', () => ({
  connectEvents: () => ({ subscribe: () => () => {}, onReconnect: () => () => {}, close: () => {} }),
}))

const mealView: CookView = {
  scope: 'meal:2026-11-09/2', recipeId: 7, recipeName: 'Chicken', batches: 1,
  meal: { date: '2026-11-09', mealSlotId: 2 }, advance: [],
  steps: [{ index: 0, number: 1, of: 1, kind: 'active', text: 'Roast the chicken', durationMinutes: 40, imageUrl: '', uses: [], timer: null }],
  timers: [],
}
const recipeView: CookView = { ...mealView, scope: 'recipe:7', meal: null }
const timers = { now: '2026-11-09T12:00:00Z', timers: [] }
const preview: CookPreview = {
  meal: meal({ date: '2026-11-09', mealSlotId: 2, recipeName: 'Chicken' }), fresh: true, batches: 1, yield: 4, portionsNeeded: 2,
  proposedLeftover: 2, maxLeftover: 4, leftoverUseBy: '2026-11-12', needs: [],
}
const shortfall = {
  ingredientId: 11, name: 'chicken thighs', baseUnit: 'g' as const, have: 300, need: 400, shortfall: 100,
  message: 'Stock shows only 300 g chicken thighs, the recipe uses 400 g',
}
const cooked = (warnings: CookedResult['warnings']): CookedResult => ({ meal: meal({ state: 'cooked' }), leftover: null, warnings })

const mealRoutes = {
  'GET /api/cook/meals/2026-11-09/2': mealView,
  'GET /api/cook/timers?scope=meal%3A2026-11-09%2F2': timers,
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
  it('leaves at once when nothing is short in Stock', async () => {
    const api = mockApi({ ...mealRoutes, 'POST /api/plan/2026-11-09/2/cooked': cooked([]) })
    renderMeal()
    await confirmCooked()
    expect(await screen.findByText('Home page')).toBeInTheDocument()
    expect(api.callsTo('POST', '/api/plan/2026-11-09/2/cooked')).toHaveLength(1)
  })

  it('stays with the Stock warning, and leaves only once Correct Stock has fixed it', async () => {
    const api = mockApi({
      ...mealRoutes,
      'POST /api/plan/2026-11-09/2/cooked': cooked([shortfall]),
      'PUT /api/stock/ingredients/11/total': { ingredient: {}, lots: [] },
    })
    renderMeal()
    await confirmCooked()

    const notice = await screen.findByRole('alert')
    expect(notice).toHaveTextContent('Stock shows only 300 g chicken thighs, the recipe uses 400 g')
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()

    await userEvent.click(within(notice).getByRole('button', { name: 'Correct Stock' }))
    const correct = await screen.findByRole('dialog', { name: 'How much chicken thighs do you have?' })
    const input = within(correct).getByLabelText('Total in Stock')
    await userEvent.clear(input)
    await userEvent.type(input, '250')
    await userEvent.click(within(correct).getByRole('button', { name: 'Set total' }))
    await waitFor(() => expect(api.callsTo('PUT', '/api/stock/ingredients/11/total')[0]?.body).toEqual({ total: 250 }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })

  it('leaves once the last warning is dismissed, leaving Stock alone', async () => {
    const api = mockApi({ ...mealRoutes, 'POST /api/plan/2026-11-09/2/cooked': cooked([shortfall]) })
    renderMeal()
    await confirmCooked()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('Home page')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
    expect(await screen.findByText('Home page')).toBeInTheDocument()
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
})

describe('CookScreen: a Recipe scope', () => {
  it('finishes with Back to Recipe, never Done', async () => {
    mockApi({ 'GET /api/cook/recipes/7?batches=1': recipeView, 'GET /api/cook/timers?scope=recipe%3A7': timers })
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
