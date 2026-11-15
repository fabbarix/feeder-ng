// The current destination of the bottom bar and the side rail (beta.7 H9 follow-up: /supplies made Scan look current).
import { describe, expect, it } from 'vitest'
import { PRIMARY_NAV } from './nav'
import { isCurrentNav } from './navCurrent'

const current = (path: string) => PRIMARY_NAV.filter((item) => isCurrentNav(item, path)).map((item) => item.id)

describe('isCurrentNav', () => {
  it.each([
    ['/', 'today'],
    ['/plan', 'plan'],
    ['/plan/couldnt-plan/excluded', 'plan'],
    ['/pantry', 'pantry'],
    ['/scan', 'scan'],
    ['/scan/', 'scan'],
    ['/shop', 'shop'],
    ['/recipes', 'recipes'],
    ['/settings', 'settings'],
    ['/settings/members', 'settings'],
  ])('%s is %s', (path, id) => {
    expect(current(path)).toEqual([id])
  })

  it.each(['/supplies', '/supplies/12', '/ingredients', '/ingredients/3', '/products', '/products/9'])('the Catalogue page %s makes Settings current, never Scan', (path) => {
    expect(current(path)).toEqual(['settings'])
  })

  // B9-49 (TB-13): every primary destination except Today owns its sub-paths; Today is current on "/" only.
  it.each([
    ['/recipes/3', 'recipes'],
    ['/recipes/3/edit', 'recipes'],
    ['/recipes/new', 'recipes'],
    ['/recipes/import', 'recipes'],
    ['/recipes/export', 'recipes'],
    ['/pantry/anything', 'pantry'],
    ['/shop/anything', 'shop'],
    ['/scan/anything', 'scan'],
    ['/plan/couldnt-plan/excluded', 'plan'],
    ['/settings/members', 'settings'],
  ])('the sub-page %s makes %s current (the recipe page and the editor used to leave the bar with no current item)', (path, id) => {
    expect(current(path)).toEqual([id])
  })

  it('exactly one destination is current on every sub-page of a destination, never two (and never the accent Scan by mistake)', () => {
    for (const path of ['/recipes/1', '/recipes/1/edit', '/ingredients/3', '/settings/tags', '/plan/couldnt-plan/excluded', '/scan/']) {
      expect(current(path), path).toHaveLength(1)
    }
  })

  it('Today is current on / exactly: not on /recipes, /plan or any other page', () => {
    expect(current('/')).toEqual(['today'])
    expect(current('/?step=meal:2026-11-09:3:5:1')).toEqual(['today']) // a notification landing keeps Today current
    for (const path of ['/recipes', '/plan', '/shop', '/settings/members', '/this-route-does-not-exist']) expect(current(path), path).not.toContain('today')
  })

  it('Scan is not current on /shop (a sibling, not a sub-page), and a path that only starts with a destination\'s name is not under it', () => {
    expect(current('/shop')).toEqual(['shop'])
    expect(current('/scanner')).toEqual([])
    expect(current('/recipes-archive')).toEqual([])
    expect(current('/planning')).toEqual([])
    expect(current('/settingsx')).toEqual([])
  })

  it('no tab is current on an unknown page', () => {
    expect(current('/this-route-does-not-exist')).toEqual([])
  })
})
