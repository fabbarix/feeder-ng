import { screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { advance, goOffline, mountScreen } from '../test/offlineHarness'
import { RecipesScreen } from './recipes/screens/RecipesScreen'
import { RecipeDetailScreen } from './recipes/screens/RecipeDetailScreen'
import { StockScreen } from './stock/screens/StockScreen'
import { PlanScreen } from './plan/screens/PlanScreen'
import { IngredientsScreen } from './ingredients/screens/IngredientsScreen'
import { IngredientScreen } from './ingredients/screens/IngredientScreen'
import { ProductsScreen } from './products/screens/ProductsScreen'
import { ProductScreen } from './products/screens/ProductScreen'
import { ShopsScreen } from './shops/screens/ShopsScreen'
import { ShopScreen } from './shops/screens/ShopScreen'
import { MembersPage } from './settings/screens/MembersPage'
import { ShoppingScreen } from './shop/screens/ShoppingScreen'

// B9-20 (RES-02), the `offline-unknown` scenario in vitest: a phone with no signal that never loaded a list opens it.
// The screen says it is not on this phone yet. It never says there is nothing, nothing matches, or that something broke.
// (Page-layout scenario `offline-unknown` covers the real layout; this covers the wiring of every screen RES-02 names.)
beforeEach(() => {
  vi.useFakeTimers()
  goOffline()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

const CASES: Array<[string, React.ReactElement, string, string, string]> = [
  ['Recipes', <RecipesScreen />, '/recipes', '/recipes', 'Your Recipes aren’t on this phone yet'],
  ['Recipe detail', <RecipeDetailScreen />, '/recipes/3', '/recipes/:id', 'This Recipe isn’t on this phone yet'],
  ['Pantry', <StockScreen />, '/pantry', '/pantry', 'Your Stock isn’t on this phone yet'],
  ['Plan', <PlanScreen />, '/plan', '/plan', 'The plan isn’t on this phone yet'],
  ['Ingredients', <IngredientsScreen />, '/ingredients', '/ingredients', 'Your Ingredients aren’t on this phone yet'],
  ['Ingredient detail', <IngredientScreen />, '/ingredients/5', '/ingredients/:id', 'This Ingredient isn’t on this phone yet'],
  ['Products', <ProductsScreen />, '/products', '/products', 'Your Products aren’t on this phone yet'],
  ['Product detail', <ProductScreen />, '/products/5', '/products/:id', 'This Product isn’t on this phone yet'],
  ['Shops', <ShopsScreen />, '/settings/shops', '/settings/shops', 'Your Shops aren’t on this phone yet'],
  ['Shop detail', <ShopScreen />, '/settings/shops/2', '/settings/shops/:id', 'This Shop isn’t on this phone yet'],
  ['Members (a Settings list)', <MembersPage />, '/settings/members', '/settings/members', 'Your settings aren’t on this phone yet'],
  ['Shopping List', <ShoppingScreen />, '/shop', '/shop', 'Your Shopping List isn’t on this phone yet'],
]

describe.each(CASES)('%s offline, never loaded', (_name, element, path, route, title) => {
  it(`shows one LoadState "${title}", never an empty state`, async () => {
    const { container } = mountScreen(element, path, route)
    await advance(500)
    const states = container.querySelectorAll('.load-state')
    expect(states).toHaveLength(1)
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(container.querySelector('.empty-state')).toBeNull()
    expect(container.textContent).not.toMatch(/\bmatch(es)?\b|Nothing in|No (Recipe|Ingredient|Supply|Product|Shop)s? (yet|matches)/i)
  })

  it('shows no error and no Try again (a retry cannot work offline)', async () => {
    const { container } = mountScreen(element, path, route)
    await advance(500)
    expect(container.querySelector('.error-state')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
    expect(container.textContent).not.toMatch(/could not be loaded/i)
  })

  it('stays so after the one offlineFirst run and its failed retry window (no flip to an error after seconds)', async () => {
    const { container } = mountScreen(element, path, route)
    await advance(12_000)
    expect(container.querySelectorAll('.load-state')).toHaveLength(1)
    expect(container.querySelector('.error-state')).toBeNull()
  })
})

describe('copy', () => {
  it('Recipes: the text says when the Recipes will appear, and the status says it is waiting', async () => {
    mountScreen(<RecipesScreen />, '/recipes')
    await advance(500)
    expect(screen.getByText('Feeder loads them the first time this phone is online. They’ll appear here as soon as the connection is back.')).toBeInTheDocument()
    expect(screen.getByText('Waiting for a connection')).toBeInTheDocument()
  })
  it('Recipe detail: Feeder needs a connection to load it the first time', async () => {
    mountScreen(<RecipeDetailScreen />, '/recipes/3', '/recipes/:id')
    await advance(500)
    expect(screen.getByText('Feeder needs a connection to load it the first time. It will appear here as soon as the connection is back.')).toBeInTheDocument()
  })
})
