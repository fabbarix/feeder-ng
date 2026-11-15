// B9-45 (PC-02): "Cook Mode returns me to the Plan when I started there." Only known places are origins; everything else is Today.
import { describe, expect, it } from 'vitest'
import { backLabel, originOf, returnTarget, TODAY_ORIGIN } from './origin'

describe('originOf', () => {
  it.each([
    ['/', { path: '/', label: 'Today' }],
    ['/plan', { path: '/plan', label: 'Plan' }],
    ['/plan?week=2026-11-16', { path: '/plan?week=2026-11-16', label: 'Plan' }],
    ['/recipes/12', { path: '/recipes/12', label: 'Recipe' }],
  ])('%s is a known place', (from, origin) => {
    expect(originOf({ from })).toEqual(origin)
  })

  it.each([undefined, null, 'plan', 7, {}, { from: 7 }, { from: '' }, { from: 'plan' }, { from: '//evil.example/plan' }, { from: 'https://evil.example/' }, { from: '/settings' }, { from: '/recipes/12/edit' }, { from: '/cook/meal/2026-11-14/3' }])(
    '%j is no origin (Cook Mode goes to Today)',
    (state) => {
      expect(originOf(state)).toBeNull()
    },
  )
})

describe('returnTarget and backLabel', () => {
  it('returns to the origin, else the fallback, else Today', () => {
    const plan = { path: '/plan', label: 'Plan' }
    expect(returnTarget(plan)).toEqual(plan)
    expect(returnTarget(null)).toEqual(TODAY_ORIGIN)
    const recipe = { path: '/recipes/7', label: 'Recipe' }
    expect(returnTarget(null, recipe)).toEqual(recipe)
    expect(returnTarget(plan, recipe)).toEqual(plan)
  })
  it('names the place on the button: "Back to Plan"', () => {
    expect(backLabel({ path: '/plan', label: 'Plan' })).toBe('Back to Plan')
    expect(backLabel(TODAY_ORIGIN)).toBe('Back to Today')
    expect(backLabel({ path: '/recipes/7', label: 'Recipe' })).toBe('Back to Recipe')
  })
})
