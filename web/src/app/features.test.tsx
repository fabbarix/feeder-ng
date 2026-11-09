import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildRoutes, collectFeatures, loadFeatures, type FeatureModule } from './features'

const page = (text: string): RouteObject => ({ path: undefined, element: <p>{text}</p> })
const route = (path: string, text: string): RouteObject => ({ ...page(text), path })

describe('collectFeatures', () => {
  it('merges routes and menu items from all feature modules', () => {
    const mods: Record<string, FeatureModule> = {
      '../features/recipes/index.ts': { routes: [route('/recipes', 'recipes')] },
      '../features/admin/index.ts': {
        routes: [route('/admin', 'admin')],
        navItems: [{ id: 'admin', label: 'Household', path: '/admin', placement: 'menu', order: 20 }],
      },
      '../features/stock/index.ts': {
        routes: [route('/stock', 'stock')],
        navItems: [{ id: 'stock-take', label: 'Stock-take', path: '/stock/take', placement: 'menu', order: 10 }],
      },
    }
    const { routes, navItems } = collectFeatures(mods)
    expect(routes.map((r) => r.path).sort()).toEqual(['/admin', '/recipes', '/stock'])
    expect(navItems.map((n) => n.id)).toEqual(['stock-take', 'admin']) // by order
  })

  it('is independent of object key order', () => {
    const a: Record<string, FeatureModule> = {
      '../features/b/index.ts': { routes: [route('/b', 'b')] },
      '../features/a/index.ts': { routes: [route('/a', 'a')] },
    }
    const b: Record<string, FeatureModule> = {
      '../features/a/index.ts': { routes: [route('/a', 'a')] },
      '../features/b/index.ts': { routes: [route('/b', 'b')] },
    }
    expect(collectFeatures(a).routes.map((r) => r.path)).toEqual(collectFeatures(b).routes.map((r) => r.path))
  })

  it('throws on two features declaring the same path', () => {
    expect(() =>
      collectFeatures({
        '../features/a/index.ts': { routes: [route('/plan', 'a')] },
        '../features/b/index.ts': { routes: [route('/plan', 'b')] },
      }),
    ).toThrow(/duplicate/i)
  })

  it('accepts features without navItems, and an empty set', () => {
    expect(collectFeatures({}).routes).toEqual([])
    expect(collectFeatures({ '../features/a/index.ts': { routes: [] } }).navItems).toEqual([])
  })
})

describe('buildRoutes', () => {
  const renderAt = (mods: Record<string, FeatureModule>, path: string) => {
    const router = createMemoryRouter([{ path: '/', children: buildRoutes(mods) }], { initialEntries: [path] })
    return render(<RouterProvider router={router} />)
  }

  it.each([
    ['/', 'Today'],
    ['/plan', 'Plan'],
    ['/scan', 'Scan'],
    ['/shop', 'Shop'],
    ['/recipes', 'Recipes'],
    ['/stock', 'Stock'],
    ['/settings', 'Settings'],
  ])('shows a "coming soon" placeholder at %s', (path, title) => {
    renderAt({}, path)
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })

  it('a feature route replaces the placeholder', () => {
    renderAt({ '../features/plan/index.ts': { routes: [route('/plan', 'the real plan')] } }, '/plan')
    expect(screen.getByText('the real plan')).toBeInTheDocument()
    expect(screen.queryByText('Coming soon')).toBeNull()
  })

  it('keeps placeholders for destinations no feature provides', () => {
    renderAt({ '../features/plan/index.ts': { routes: [route('/plan', 'the real plan')] } }, '/shop')
    expect(screen.getByText('Coming soon')).toBeInTheDocument()
  })
})

describe('loadFeatures', () => {
  it('discovers src/features/*/index.ts via import.meta.glob without throwing', () => {
    const f = loadFeatures()
    expect(Array.isArray(f.routes)).toBe(true)
    expect(Array.isArray(f.navItems)).toBe(true)
  })
})
