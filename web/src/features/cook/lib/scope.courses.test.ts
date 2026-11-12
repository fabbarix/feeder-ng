// CRS F + C3 (crs-plan 2.2, shim 2 removed): cook scopes compare through ONE helper. Every Planned Meal scope is
// three-part, the main Course's too; a two-part scope names nothing and equals only itself, as a plain string.
import { describe, expect, it } from 'vitest'
import { cookReheatPath } from './reheat'
import { cookTimelinePath, courseScope, parseMealScope, sameScope, timelineTargetFrom } from './scope'

describe('courseScope and parseMealScope', () => {
  it('writes meal:<date>/<slot>/<course>', () => {
    expect(courseScope('2026-11-10', 4, 2)).toBe('meal:2026-11-10/4/2')
  })

  it('reads the three-part form', () => {
    expect(parseMealScope('meal:2026-11-10/4/2')).toEqual({ date: '2026-11-10', mealSlotId: 4, courseId: 2 })
  })

  it('the two-part form is no scope any more', () => {
    expect(parseMealScope('meal:2026-11-10/4')).toBeNull()
    expect(parseMealScope('meal:2026-11-10/4/0')).toBeNull()
  })

  it.each(['recipe:7', 'meal:2026-11-10', 'meal:x/4', 'meal:2026-11-10/4/2/9', '', null, undefined])('is null for %j', (scope) => {
    expect(parseMealScope(scope)).toBeNull()
  })
})

describe('sameScope', () => {
  it('takes two scopes; the main Course is no special case', () => {
    expect(sameScope.length).toBe(2)
  })

  it('a two-part scope is NOT the main Course', () => {
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-10/4/7', 7)).toBe(false)
    expect(sameScope('meal:2026-11-10/4/7', 'meal:2026-11-10/4', 7)).toBe(false)
    expect(sameScope('meal:2026-11-10/4', 'meal:2026-11-10/4/7')).toBe(false)
  })

  it('three-part scopes are equal when date, slot and Course match', () => {
    expect(sameScope('meal:2026-11-10/4/7', 'meal:2026-11-10/4/7')).toBe(true)
  })

  it('another Course, slot or date is another scope', () => {
    expect(sameScope('meal:2026-11-10/4/2', 'meal:2026-11-10/4/7')).toBe(false)
    expect(sameScope('meal:2026-11-10/4/7', 'meal:2026-11-10/5/7')).toBe(false)
    expect(sameScope('meal:2026-11-10/4/7', 'meal:2026-11-11/4/7')).toBe(false)
  })

  it('Recipe scopes compare as plain strings; a free timer (null) is never a scope', () => {
    expect(sameScope('recipe:7', 'recipe:7')).toBe(true)
    expect(sameScope('recipe:7', 'recipe:8')).toBe(false)
    expect(sameScope('recipe:7', 'meal:2026-11-10/4/7')).toBe(false)
    expect(sameScope(null, 'meal:2026-11-10/4/7')).toBe(false)
    expect(sameScope(null, null)).toBe(false)
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

  it('the Reheat screen of a Leftover Course has its Course in the route; a key without one has no route', () => {
    expect(cookReheatPath({ date: '2026-11-10', mealSlotId: 4, courseId: 3 })).toBe('/cook/reheat/2026-11-10/4/3')
    expect(() => cookReheatPath({ date: '2026-11-10', mealSlotId: 4 } as never)).toThrow(/course/i)
  })
})
