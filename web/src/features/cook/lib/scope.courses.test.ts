// CRS F (crs-plan 2.2, shim 2): cook scopes compare through ONE helper that reads a two-part scope as the main Course,
// so it works before C3 (the main Course two-part) and after (always three-part).
import { describe, expect, it } from 'vitest'
import { cookReheatPath } from './reheat'
import { cookTimelinePath, courseScope, parseMealScope, sameScope, timelineTargetFrom } from './scope'

describe('courseScope and parseMealScope', () => {
  it('writes meal:<date>/<slot>/<course>', () => {
    expect(courseScope('2026-11-10', 4, 2)).toBe('meal:2026-11-10/4/2')
  })

  it('reads the three-part and the two-part form', () => {
    expect(parseMealScope('meal:2026-11-10/4/2')).toEqual({ date: '2026-11-10', mealSlotId: 4, courseId: 2 })
    expect(parseMealScope('meal:2026-11-10/4')).toEqual({ date: '2026-11-10', mealSlotId: 4, courseId: null })
  })

  it.each(['recipe:7', 'meal:2026-11-10', 'meal:x/4', 'meal:2026-11-10/4/2/9', '', null, undefined])('is null for %j', (scope) => {
    expect(parseMealScope(scope)).toBeNull()
  })
})

describe('sameScope', () => {
  const main = 7

  it('a two-part scope is the main Course', () => {
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-10/4/7', main)).toBe(true)
    expect(sameScope('meal:2026-11-10/4/7', 'meal:2026-11-10/4', main)).toBe(true)
  })

  it('works both ways of the transition: two-part against two-part, three-part against three-part', () => {
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-10/4', main)).toBe(true)
    expect(sameScope('meal:2026-11-10/4/7', 'meal:2026-11-10/4/7', main)).toBe(true)
  })

  it('another Course is another scope, in either form', () => {
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-10/4/2', main)).toBe(false)
    expect(sameScope('meal:2026-11-10/4/2', 'meal:2026-11-10/4/7', main)).toBe(false)
  })

  it('another slot or date is another scope', () => {
    expect(sameScope('meal:2026-11-10/4/7', 'meal:2026-11-10/5/7', main)).toBe(false)
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-11/4/7', main)).toBe(false)
  })

  it('while the main Course is not known a two-part scope equals only itself', () => {
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-10/4/7', null)).toBe(false)
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-10/4', null)).toBe(true)
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-10/4/7', undefined)).toBe(false)
  })

  it('Recipe scopes compare as plain strings; a free timer (null) is never a scope', () => {
    expect(sameScope('recipe:7', 'recipe:7', main)).toBe(true)
    expect(sameScope('recipe:7', 'recipe:8', main)).toBe(false)
    expect(sameScope('recipe:7', 'meal:2026-11-10/4', main)).toBe(false)
    expect(sameScope(null, 'meal:2026-11-10/4', main)).toBe(false)
    expect(sameScope(null, null, main)).toBe(false)
  })
})

describe('the routes', () => {
  it('cookTimelinePath opens the slot, or the slot on one Course', () => {
    expect(cookTimelinePath('2026-11-10', 4)).toBe('/cook/meal/2026-11-10/4')
    expect(cookTimelinePath('2026-11-10', 4, 2)).toBe('/cook/meal/2026-11-10/4/2')
  })

  it('timelineTargetFrom reads the route params', () => {
    expect(timelineTargetFrom({ date: '2026-11-10', slotId: '4' })).toEqual({ date: '2026-11-10', mealSlotId: 4 })
    expect(timelineTargetFrom({ date: '2026-11-10', slotId: '4', courseId: '2' })).toEqual({ date: '2026-11-10', mealSlotId: 4, courseId: 2 })
    expect(timelineTargetFrom({ date: '2026-11-10' })).toBeNull()
    expect(timelineTargetFrom({})).toBeNull()
  })

  it('the Reheat screen of a Leftover Course has its Course in the route; without one it is as before', () => {
    expect(cookReheatPath({ date: '2026-11-10', mealSlotId: 4, courseId: 3 })).toBe('/cook/reheat/2026-11-10/4/3')
    expect(cookReheatPath({ date: '2026-11-10', mealSlotId: 4 })).toBe('/cook/reheat/2026-11-10/4')
  })
})
