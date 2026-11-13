import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockApi, refusal } from '../../../lib/baseRecipes/test-utils'
import { ConfirmProvider, ToastProvider } from '../../../ui'
import { garlic, milk, recipe } from '../fixtures.test-helper'
import { household } from '../household.test-helper'
import type { IngredientRef, RecipeLine } from '../types'

// BR-D round 4: the Stock line of a Base recipe (Stock API by baseIngredientId), and the line error that clears on the next success.
const h = vi.hoisted(() => ({
  recipe: {} as Record<string, unknown>,
  household: {} as import('../hooks/useHouseholdPreferences').UseHouseholdPreferences,
  refs: new Map<number, unknown>(),
  system: 'metric' as 'metric' | 'imperial',
}))
vi.mock('../hooks/useRecipe', () => ({ useRecipe: () => h.recipe }))
vi.mock('../hooks/useHouseholdPreferences', () => ({ useHouseholdPreferences: () => h.household }))
vi.mock('../hooks/useIngredientRefs', () => ({ useIngredientRefs: () => ({ byId: h.refs, isLoading: false }) }))
vi.mock('../../ingredients/hooks/useDisplayUnitSystem', () => ({ useDisplayUnitSystem: () => h.system }))
vi.mock('../../import/hooks/useAgentPrompt', () => ({ useAgentPrompt: () => ({ state: 'idle', copy: vi.fn() }) }))

import { RecipeDetailScreen } from './RecipeDetailScreen'

const bechRef: IngredientRef = { id: 30, name: 'Béchamel', baseUnit: 'ml', conversions: [], baseRecipe: { id: 3, name: 'Béchamel', archived: false } }
const plainBech: IngredientRef = { id: 5, name: 'béchamel', baseUnit: 'ml', conversions: [] }
const view = (entry = '/recipes/3') =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ToastProvider>
        <ConfirmProvider>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/recipes/:id" element={<RecipeDetailScreen />} />
            </Routes>
          </MemoryRouter>
        </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>,
  )
const setRecipe = (r: ReturnType<typeof recipe>) => {
  h.recipe = { recipe: r, isLoading: false, error: null, refetch: vi.fn(), setArchived: vi.fn(), remove: vi.fn() }
}
const bech = (over = {}) => recipe({ id: 3, name: 'Béchamel', yield: 1, yieldUnit: 'l', baseRecipe: true, baseIngredientId: 30, courses: [], usedBy: [], lines: [], ...over })
const stockRow = (over = {}) => ({ ingredientId: 30, name: 'Béchamel', baseUnit: 'ml', total: 300, lotCount: 1, nextGoesOff: null, useSoon: false, spoiledCount: 0, ...over })
const stock = (...rows: object[]) => ({ 'GET /api/stock': { ingredients: rows }, 'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [] } })

beforeEach(() => {
  vi.clearAllMocks()
  Element.prototype.scrollIntoView = vi.fn()
  h.household = household()
  h.system = 'metric'
  h.refs = new Map<number, unknown>([[7, garlic], [9, milk], [30, bechRef], [5, plainBech]])
})

describe('detail: the Stock line of a Base recipe', () => {
  it('says what the Pantry holds of its Ingredient: "In the Pantry: 300 ml"', async () => {
    mockApi(stock(stockRow(), stockRow({ ingredientId: 31, name: 'Roux', total: 80 })))
    setRecipe(bech())
    view()
    expect(await screen.findByText('In the Pantry: 300 ml')).toBeInTheDocument()
  })

  it('reads the Stock of baseIngredientId, not of another Ingredient', async () => {
    mockApi(stock(stockRow({ ingredientId: 31, name: 'Roux', total: 80, baseUnit: 'g' })))
    setRecipe(bech({ baseIngredientId: 31 }))
    view()
    expect(await screen.findByText('In the Pantry: 80 g')).toBeInTheDocument()
  })

  it('follows the household\'s unit system', async () => {
    h.system = 'imperial'
    mockApi(stock(stockRow({ total: 1000 })))
    setRecipe(bech())
    view()
    const { formatQuantity } = await import('../../../lib/units')
    expect(await screen.findByText(`In the Pantry: ${formatQuantity(1000, 'ml', 'imperial')}`)).toBeInTheDocument()
  })

  it('says "none" when the Pantry has none of it', async () => {
    mockApi(stock(stockRow({ ingredientId: 99, name: 'Other' })))
    setRecipe(bech())
    view()
    expect(await screen.findByText('In the Pantry: none')).toBeInTheDocument()
  })

  it('shows nothing while the Stock is loading or cannot be loaded (no wrong "none")', async () => {
    const api = mockApi({ 'GET /api/stock': refusal(500, 'internal'), 'GET /api/recipes/3/link-candidates': { baseUnit: 'ml', lines: [] } })
    setRecipe(bech())
    view()
    await waitFor(() => expect(api.callsTo('GET', '/api/stock')).toHaveLength(1))
    expect(screen.queryByText(/In the Pantry/)).toBeNull()
  })

  it('a plannable Recipe has no Stock line and never asks for Stock', async () => {
    const api = mockApi({})
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [] }))
    view('/recipes/7')
    await screen.findByRole('heading', { name: 'Lasagne' })
    expect(screen.queryByText(/In the Pantry/)).toBeNull()
    expect(api.calls.some((c) => c.path.startsWith('/api/stock'))).toBe(false)
  })
})

describe('detail: the line error clears on the next success', () => {
  const baseLine: RecipeLine = {
    id: 71, ingredientId: 30, ingredient: 'Béchamel', quantity: 500, unit: 'ml', optional: false, note: '',
    baseRecipe: { id: 3, name: 'Béchamel', archived: false }, neededAt: 0, linkedFromIngredientId: 5,
  }

  it('a refused Use as a plain Ingredient shows its words; the next one that works removes them', async () => {
    let calls = 0
    mockApi({ 'DELETE /api/recipes/7/lines/71/base': () => (++calls === 1 ? refusal(500, 'internal') : { id: 7 }) })
    setRecipe(recipe({ id: 7, name: 'Lasagne', lines: [baseLine] }))
    view('/recipes/7')
    const act = async () => {
      await userEvent.click(screen.getByRole('button', { name: 'Actions for Béchamel' }))
      await userEvent.click(screen.getByRole('menuitem', { name: 'Use as a plain Ingredient' }))
    }
    await act()
    const words = await screen.findByText(/could not|Could not|wrong|try again/i, { selector: 'p[role="alert"]' })
    expect(words).toBeInTheDocument()
    await act()
    await waitFor(() => expect(calls).toBe(2))
    await waitFor(() => expect(words).not.toBeInTheDocument())
  })
})
