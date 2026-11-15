import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { advance, mountScreen, serverDown } from '../test/offlineHarness'
import { RecipesScreen } from './recipes/screens/RecipesScreen'
import { RecipeDetailScreen } from './recipes/screens/RecipeDetailScreen'
import { StockScreen } from './stock/screens/StockScreen'
import { PlanScreen } from './plan/screens/PlanScreen'

// B9-20 (RES-06) BDD: "A server error on Recipes shows Try again within two seconds",
// "A Recipe that does not exist says so at once", and the page-layout/check-ui probe "a 500 shows the error state within 2.5 s".
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('a 500 shows the error state with Try again within 2 s (one retry after 1 s), never a skeleton for 7 s', () => {
  it.each([
    ['Recipes', <RecipesScreen />, '/recipes', '/recipes', 'The Recipes could not be loaded.'],
    ['Pantry', <StockScreen />, '/pantry', '/pantry', 'Stock could not be loaded.'],
    ['Plan', <PlanScreen />, '/plan', '/plan', 'The plan could not be loaded.'],
  ] as const)('%s', async (_n, element, path, route, message) => {
    serverDown(500)
    const { container } = mountScreen(element, path, route)
    await advance(1900)
    expect(container.querySelector('.error-state')).not.toBeNull()
    expect(screen.getByText(message)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
    expect(container.querySelector('.load-state, .empty-state')).toBeNull()
  })

  it('but not before the single retry: at 0.5 s it is still loading (a second try can fix a blip)', async () => {
    const fetch = serverDown(500)
    const { container } = mountScreen(<RecipesScreen />, '/recipes')
    await advance(500)
    expect(container.querySelector('.error-state')).toBeNull()
    expect(fetch.mock.calls.filter((c) => String(c[0]).startsWith('/api/recipes')).length).toBeGreaterThanOrEqual(1)
  })

  it('Try again fetches again and shows the list when the server is back', async () => {
    serverDown(500)
    mountScreen(<RecipesScreen />, '/recipes')
    await advance(1900)
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response('[]', { status: 200 }))))
    await userEvent.setup({ advanceTimers: vi.advanceTimersByTime }).click(screen.getByRole('button', { name: 'Try again' }))
    await advance(200)
    expect(screen.queryByText('The Recipes could not be loaded.')).toBeNull()
    expect(screen.getByRole('heading', { name: 'No Recipes yet' })).toBeInTheDocument()
  })
})

describe('a Recipe that does not exist says so at once', () => {
  it('a 404 is the failed state with one request, not four, and not after 7 s', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ error: { code: 'not_found', message: 'no such recipe' } }), { status: 404 })))
    vi.stubGlobal('fetch', fetch)
    const { container } = mountScreen(<RecipeDetailScreen />, '/recipes/99999', '/recipes/:id')
    await advance(100)
    expect(container.querySelector('.error-state')).not.toBeNull()
    expect(screen.getByText('The Recipe could not be loaded.')).toBeInTheDocument()
    expect(fetch.mock.calls.filter((c) => String(c[0]) === '/api/recipes/99999')).toHaveLength(1)
  })
})
