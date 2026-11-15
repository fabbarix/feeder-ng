// B9-59 (RES-04): what a route shows while its code loads: the page's own loading state (title, trail, skeleton).
import { describe, expect, it } from 'vitest'
import { routeLoadingFor } from './routeLoading'

describe('routeLoadingFor', () => {
  it.each([
    ['/plan', 'Plan', 'plan'],
    ['/recipes', 'Recipes', 'recipes'],
    ['/recipes/12', 'Recipe', 'recipe'],
    ['/pantry', 'Pantry', 'list'],
    ['/shop', 'Shop', 'tiles'],
    ['/settings', 'Settings', 'list'],
    ['/settings/household', 'Household', 'list'],
    ['/recipes/new', 'New Recipe', 'list'],
    ['/recipes/import', 'Import Recipes', 'list'],
  ])('%s: title %s, %s skeleton', (path, title, body) => {
    const view = routeLoadingFor(path)
    expect(view.frame).toBe('shell')
    if (view.frame !== 'shell') return
    expect(view.title).toBe(title)
    expect(view.body).toBe(body)
  })

  it('a child page carries its trail; a top-level page none', () => {
    const detail = routeLoadingFor('/recipes/12')
    expect(detail.frame === 'shell' && detail.crumbs.map((c) => c.label)).toEqual(['Recipes', 'Recipe'])
    const top = routeLoadingFor('/plan')
    expect(top.frame === 'shell' && top.crumbs).toEqual([])
  })

  it('Plan keeps its subtitle row from the first frame', () => {
    const view = routeLoadingFor('/plan')
    expect(view.frame === 'shell' && view.subtitle).toBe(' ')
  })

  // int1 (main-session call): Scan gets its header and document title while its code loads, like every other route; the
  // screen's own Shops-loading view shows the same header, so nothing jumps when the chunk arrives.
  it('Scan shows its "Scan" header and tiles, as it does while its Shops load', () => {
    const view = routeLoadingFor('/scan')
    expect(view).toEqual({ frame: 'shell', title: 'Scan', crumbs: [], subtitle: undefined, body: 'tiles' })
  })

  it.each(['/cook/recipe/3', '/board', '/scan/receipt', '/scan/receipt/review'])('%s is chromeless: its own minimal frame', (path) => {
    expect(routeLoadingFor(path)).toEqual({ frame: 'chromeless' })
  })

  it('ignores the query and a trailing slash', () => {
    expect(routeLoadingFor('/plan/?week=2')).toEqual(routeLoadingFor('/plan'))
  })
})
