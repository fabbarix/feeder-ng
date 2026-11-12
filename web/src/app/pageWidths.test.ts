// R2-L (L-01): one width per route, declared in one table (app/pageWidths.ts), consumed by the shell and by the layout guard.
import { describe, expect, it } from 'vitest'
import { collectFeatures, discoverFeatures } from './features'
import { explicitPageWidth, pageWidthFor, ROUTE_WIDTHS } from './pageWidths'

const concrete = (p: string) => p.replace(/:[a-zA-Z]+/g, '7')

describe('pageWidthFor: the per-route width table', () => {
  it.each([
    ['/', 'wide'],
    ['/pantry', 'default'],
    ['/recipes/7', 'default'],
    ['/recipes/7/edit', 'default'],
    ['/recipes/new', 'default'],
    ['/plan', 'wide'],
    ['/recipes', 'wide'],
    ['/shop', 'wide'],
    ['/scan', 'narrow'],
    ['/recipes/import', 'narrow'],
    ['/recipes/export', 'narrow'],
    ['/ingredients', 'narrow'],
    ['/ingredients/7', 'narrow'],
    ['/products', 'narrow'],
    ['/products/7', 'narrow'],
    ['/settings', 'narrow'],
    ['/settings/household', 'narrow'],
    ['/settings/members', 'narrow'],
    ['/settings/meal-slots', 'default'],
    ['/settings/courses', 'narrow'], // CRS D2: listed on its own, like the other Settings pages
    ['/settings/planning', 'narrow'],
    ['/settings/tags', 'narrow'], // TG-S: narrow from /settings/*, like the other Settings pages
    ['/settings/shops', 'narrow'],
    ['/settings/shops/7', 'narrow'],
    ['/settings/notifications', 'narrow'],
    ['/settings/allowlist', 'narrow'],
    ['/settings/preferences', 'narrow'],
    ['/settings/access-requests', 'narrow'],
    ['/settings/recipe-assistant', 'narrow'],
    ['/board', 'full'],
    ['/cook/recipe/7', 'full'],
    ['/cook/meal/2026-01-01/3', 'full'],
  ] as const)('%s is %s', (path, width) => {
    expect(pageWidthFor(path)).toBe(width)
    expect(explicitPageWidth(path)).toBe(width)
  })

  it('static segments beat :id, and :id beats the trailing wildcard (/recipes/new is not a Recipe id; /recipes/import is narrow)', () => {
    expect(pageWidthFor('/recipes/import')).toBe('narrow')
    expect(pageWidthFor('/recipes/7')).toBe('default')
  })
  it('ignores a query string, a hash and a trailing slash', () => {
    expect(pageWidthFor('/plan?week=3#x')).toBe('wide')
    expect(pageWidthFor('/plan/')).toBe('wide')
  })
  it('an unlisted route falls back to default, and explicitPageWidth says it was not listed', () => {
    expect(pageWidthFor('/something/new')).toBe('default')
    expect(explicitPageWidth('/something/new')).toBeUndefined()
  })
  it('has no duplicate paths and only valid widths', () => {
    const paths = ROUTE_WIDTHS.map((r) => r.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const r of ROUTE_WIDTHS) expect(['narrow', 'default', 'wide', 'full']).toContain(r.width)
    expect(ROUTE_WIDTHS.length).toBeGreaterThan(20)
  })
})

describe('every route a feature registers has an explicit width (so a new route cannot silently inherit the fallback)', () => {
  const { routes } = collectFeatures(discoverFeatures())
  const paths = routes.map((r) => r.path ?? '').filter((p) => p && p !== '*')
  it('finds the feature routes', () => expect(paths.length).toBeGreaterThan(20))
  it.each(paths)('%s', (path) => {
    expect(explicitPageWidth(concrete(path)), path).toBeDefined()
  })
})

describe('chromeless routes are full and nothing else is', () => {
  it('only /board and /cook/* are full', () => {
    expect(ROUTE_WIDTHS.filter((r) => r.width === 'full').map((r) => r.path).sort()).toEqual(['/board', '/cook/*'])
  })
})

describe('ROUTE_WIDTHS: no redundant entries', () => {
  it('/settings/recipe-assistant is covered by /settings/*', () => {
    expect(ROUTE_WIDTHS.map((r) => r.path)).not.toContain('/settings/recipe-assistant')
    expect(pageWidthFor('/settings/recipe-assistant')).toBe('narrow')
  })
})

describe('/pantry is the canonical Pantry route (PN)', () => {
  it('/pantry is listed; /stock is only a redirect, so it has no row of its own', () => {
    const paths = ROUTE_WIDTHS.map((r) => r.path)
    expect(paths).toContain('/pantry')
    expect(paths).not.toContain('/stock')
    expect(explicitPageWidth('/pantry')).toBe('default')
  })
})
