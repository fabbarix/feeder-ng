import { describe, expect, it } from 'vitest'
import { routeQueryKeys } from './routeQueryKeys'

// B9-20 (RES-09): the query roots a crashed page resets on Try again: cached bad data must not crash it again.
describe('routeQueryKeys', () => {
  it.each([
    ['/', [['today'], ['plan']]],
    ['/plan', [['plan']]],
    ['/recipes', [['recipes']]],
    ['/recipes/12', [['recipes']]],
    ['/pantry', [['stock']]],
    ['/shop', [['shopping']]],
    ['/shops', [['shops']]],
    ['/products', [['products']]],
    ['/ingredients', [['ingredients']]],
  ])('%s resets %j', (path, keys) => {
    const got = routeQueryKeys(path as string)
    for (const key of keys as unknown[][]) expect(got).toContainEqual(key)
  })

  it('a route with no feature data resets nothing', () => {
    expect(routeQueryKeys('/no-such-page')).toEqual([])
  })

  it('never resets the signed-in User or the Preferences: a crashed page must not sign anyone out', () => {
    for (const path of ['/', '/plan', '/recipes/1', '/settings/preferences']) {
      const keys = routeQueryKeys(path)
      expect(keys).not.toContainEqual(['me'])
      expect(keys.some((k) => k[0] === 'me')).toBe(false)
    }
  })
})
