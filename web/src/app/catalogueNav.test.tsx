// beta.5 team G (spec decision 43): Ingredients, Products and Shops leave the avatar menu for Settings > Catalogue.
// What the real feature modules register as menu items, and the breadcrumbs of the two pages that gain "Settings >".
import { screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadFeatures } from './features'
import { MENU_NAV, sortByOrder } from './nav'
import { crumbsFor } from './breadcrumbs'
import { routes as ingredientRoutes } from '../features/ingredients'
import { routes as productRoutes } from '../features/products'
import { mockApi, renderWithProviders } from '../features/settings/test-utils'

afterEach(() => vi.unstubAllGlobals())

describe('the avatar menu as the real features build it', () => {
  it('no feature registers Ingredients, Products or Shops (the stale Shops item goes too)', () => {
    const ids = loadFeatures().navItems.map((n) => n.id)
    for (const gone of ['ingredients', 'products', 'shops']) expect(ids, gone).not.toContain(gone)
    expect(loadFeatures().navItems.map((n) => n.path)).not.toEqual(expect.arrayContaining(['/settings/shops']))
  })

  it('the menu items are Kitchen board alone (Sign out and Sign-in requests are drawn by the menu itself)', () => {
    expect(sortByOrder([...MENU_NAV, ...loadFeatures().navItems]).map((n) => n.label)).toEqual(['Kitchen board'])
  })
})

describe('crumbsFor: Ingredients and Products sit under Settings', () => {
  const S = { label: 'Settings', to: '/settings' }
  it('the lists are Settings > Ingredients and Settings > Products', () => {
    expect(crumbsFor('/ingredients')).toEqual([S, { label: 'Ingredients' }])
    expect(crumbsFor('/products')).toEqual([S, { label: 'Products' }])
  })
  it('the detail pages are Settings > Ingredients > name and Settings > Products > name', () => {
    expect(crumbsFor('/ingredients/3', 'Garlic')).toEqual([S, { label: 'Ingredients', to: '/ingredients' }, { label: 'Garlic' }])
    expect(crumbsFor('/products/9', 'Whole milk 1 L')).toEqual([S, { label: 'Products', to: '/products' }, { label: 'Whole milk 1 L' }])
    expect(crumbsFor('/ingredients/3').at(-1)).toEqual({ label: 'Ingredient' })
    expect(crumbsFor('/products/9').at(-1)).toEqual({ label: 'Product' })
  })
})

// The screens render the trail above their h1 (a list page has the title in the header, whatever the data).
describe.each([
  ['/ingredients', 'Ingredients', ingredientRoutes],
  ['/products', 'Products', productRoutes],
])('%s page shows Settings > %s above its h1', (path, title, routes) => {
  it('has a Breadcrumb nav with one link to /settings and the page title as the current crumb', async () => {
    mockApi({})
    const route = routes.find((r) => r.path === path)!
    renderWithProviders(route.element as React.ReactElement, path)
    const h1 = await screen.findByRole('heading', { level: 1, name: title })
    const nav = screen.getByRole('navigation', { name: 'Breadcrumb' })
    expect(nav.querySelector('a[href="/settings"]')).toHaveTextContent('Settings')
    expect(nav.querySelectorAll('a')).toHaveLength(1)
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent(title)
    expect(nav.compareDocumentPosition(h1) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
