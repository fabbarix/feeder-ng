import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, type RouteObject } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { buildRoutes, collectFeatures, discoverFeatures, loadFeatures, type FeatureModule } from './features'

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
    ['/pantry', 'Pantry'],
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

describe('collectFeatures useShellStatus', () => {
  it('gathers the hooks of features that export one, in module key order, and skips the rest', () => {
    const useB = () => ({ pendingScans: 2 })
    const useA = () => ({ pendingScans: 1 })
    const { statusHooks } = collectFeatures({
      '../features/scan/index.ts': { routes: [route('/scan', 's')], useShellStatus: useB },
      '../features/plan/index.ts': { routes: [route('/plan', 'p')] },
      '../features/alpha/index.ts': { routes: [route('/alpha', 'a')], useShellStatus: useA },
    })
    expect(statusHooks).toEqual([useA, useB])
  })

  it('has no hooks when no feature exports one', () => {
    expect(collectFeatures({ '../features/a/index.ts': { routes: [route('/a', 'a')] } }).statusHooks).toEqual([])
  })
})

describe('loadFeatures', () => {
  it('discovers src/features/*/index.ts via import.meta.glob without throwing', () => {
    const f = loadFeatures()
    expect(Array.isArray(f.routes)).toBe(true)
    expect(Array.isArray(f.navItems)).toBe(true)
  })
})

describe('/stock is an alias of /pantry (PN)', () => {
  it('the shell redirects /stock to /pantry (replace, so Back does not bounce) with no feature loaded', async () => {
    const router = createMemoryRouter([{ path: '/', children: buildRoutes({}) }], { initialEntries: ['/shop', '/stock'], initialIndex: 1 })
    render(<RouterProvider router={router} />)
    expect(router.state.location.pathname).toBe('/pantry')
    expect(router.state.historyAction).toBe('REPLACE')
  })
  it('with a feature that owns /pantry, /stock still lands on that feature', async () => {
    const mods = { '../features/stock/index.ts': { routes: [route('/pantry', 'the real pantry')] } }
    const router = createMemoryRouter([{ path: '/', children: buildRoutes(mods) }], { initialEntries: ['/stock'] })
    render(<RouterProvider router={router} />)
    expect(screen.getByText('the real pantry')).toBeInTheDocument()
  })
  it('the stock feature declares /pantry and no /stock route of its own (the shell owns the alias, so it cannot be a duplicate)', async () => {
    const { routes } = await import('../features/stock')
    const paths = routes.map((r) => r.path)
    expect(paths).toContain('/pantry')
    expect(paths).not.toContain('/stock')
  })
  it('the discovered features still build without a duplicate-route error', () => {
    expect(() => buildRoutes(discoverFeatures())).not.toThrow()
  })
})
