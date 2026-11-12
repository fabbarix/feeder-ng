// CRS E2: the Courses step of the Import Review summary.
import { describe, expect, it } from 'vitest'
import { courseRow, match, plan, prompt, recipe } from '../fixtures.test-helper'
import { canConfirm, openCount, reviewSteps } from './reviewSummary'

describe('reviewSteps with Courses', () => {
  it('has no Courses step when every row is a match', () => {
    const p = plan({ courses: [courseRow({ key: 'main', status: 'exact' })] })
    expect(reviewSteps(p).map((t) => t.id)).toEqual(['ingredients'])
  })
  it('has no Courses step without rows', () => {
    expect(reviewSteps(plan()).map((t) => t.id)).toEqual(['ingredients'])
  })
  it('counts the unknown and archived rows, and the unresolved ones as open', () => {
    const p = plan({
      courses: [
        courseRow({ key: 'main', status: 'exact' }),
        courseRow({ key: 'soup', status: 'unknown', resolved: true }),
        courseRow({ key: 'brunch', status: 'archived', resolved: false }),
      ],
    })
    expect(reviewSteps(p).find((t) => t.id === 'courses')).toEqual({ id: 'courses', total: 2, open: 1 })
  })
  it('sits after the Unit Conversions and before the Recipe conflicts', () => {
    const p = plan({
      problems: [{ path: '$', code: 'x', message: 'x' }],
      ingredients: [match({ key: 'onion' })],
      unitPrompts: [prompt()],
      courses: [courseRow({ key: 'soup' })],
      recipes: [recipe({ status: 'conflict', resolved: false })],
      warnings: [{ path: '$', code: 'image_failed', message: 'x' }],
    })
    expect(reviewSteps(p).map((t) => t.id)).toEqual(['problems', 'ingredients', 'units', 'courses', 'recipes', 'images'])
  })
  it('adds the open Course rows to openCount', () => {
    const p = plan({ courses: [courseRow({ key: 'soup', resolved: false }), courseRow({ key: 'tea', resolved: false })] })
    expect(openCount(p)).toBe(2)
  })
  it('a Course row that is resolved by default (use the main Course) blocks nothing', () => {
    const p = plan({ courses: [courseRow({ key: 'soup' })] })
    expect(openCount(p)).toBe(0)
    expect(canConfirm(p, false)).toBe(true)
  })
})
