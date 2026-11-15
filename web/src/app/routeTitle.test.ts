// B9-49 (A11Y-01): the provisional document title the shell sets from the route table before a page's own h1 mounts (loading, error):
// "<section's nav label> · Feeder", or just "Feeder" for an unknown route. Pure (app/routeTitle.ts, no React).
// The page header replaces it as soon as its h1 mounts (ui/PageHeader calls useDocumentTitle); see AppShell.routeTitle.test.tsx.
import { describe, expect, it } from 'vitest'
import { MENU_NAV, PRIMARY_NAV } from './nav'
import { routeTitle } from './routeTitle'

describe('routeTitle', () => {
  it.each(PRIMARY_NAV.map((item) => [item.path, `${item.label} · Feeder`] as const))('the destination %s is "%s"', (path, title) => {
    expect(routeTitle(path)).toBe(title)
  })

  it('every avatar menu entry names its page (Kitchen board)', () => {
    for (const item of MENU_NAV) expect(routeTitle(item.path), item.path).toBe(`${item.label} · Feeder`)
  })

  it.each([
    ['/recipes/3', 'Recipes · Feeder'],
    ['/recipes/3/edit', 'Recipes · Feeder'],
    ['/recipes/new', 'Recipes · Feeder'],
    ['/plan/couldnt-plan/excluded', 'Plan · Feeder'],
    ['/settings/members', 'Settings · Feeder'],
    // The Catalogue pages sit under Settings (their trail starts there), as the nav's current item does (TB-13).
    ['/ingredients/3', 'Settings · Feeder'],
    ['/products', 'Settings · Feeder'],
    ['/supplies', 'Settings · Feeder'],
  ])('a sub-page %s takes its section: %s', (path, title) => {
    expect(routeTitle(path)).toBe(title)
  })

  it('the chromeless screens have a provisional title of their own', () => {
    expect(routeTitle('/cook/meal/2026-11-09/3')).toBe('Cook Mode · Feeder')
    expect(routeTitle('/cook/recipe/4')).toBe('Cook Mode · Feeder')
    expect(routeTitle('/scan/receipt')).toBe('Receipt · Feeder')
    expect(routeTitle('/scan/receipt/review')).toBe('Receipt · Feeder')
  })

  it('an unknown route is just "Feeder" (never a made-up section)', () => {
    expect(routeTitle('/this-route-does-not-exist')).toBe('Feeder')
    expect(routeTitle('/scanner')).toBe('Feeder')
  })

  it('ignores a query, a hash and a trailing slash', () => {
    expect(routeTitle('/plan/?week=2026-11-09#x')).toBe('Plan · Feeder')
    expect(routeTitle('/?step=a:1')).toBe('Today · Feeder')
  })
})
