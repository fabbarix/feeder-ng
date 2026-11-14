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

  it('matches exactly elsewhere: no tab on an unknown page, Scan not on /scanner, Today only on /', () => {
    expect(current('/this-route-does-not-exist')).toEqual([])
    expect(current('/scanner')).toEqual([])
    expect(current('/recipes/3')).toEqual([])
  })
})
