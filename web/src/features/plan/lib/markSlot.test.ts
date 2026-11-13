// B5-F1: the Plan address that opens one slot's Mark as Cooked / Mark all Cooked sheet (the Shopping List hint's "Mark it").
import { describe, expect, it } from 'vitest'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import { markSlotPath, markSlotTarget, parseMarkSlotParam } from './markSlot'

const main = (state: 'planned' | 'cooked' | 'skipped' = 'planned') => planCourse({ courseId: 1, name: 'Main', meal: courseMeal(1, 'Main', { state }) })
const side = (state: 'planned' | 'cooked' | 'skipped' = 'planned') => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { state }) })

describe('markSlotPath and parseMarkSlotParam', () => {
  it('the address is a parameter of the Plan page: /plan?mark=<date>:<mealSlotId>', () => {
    expect(markSlotPath({ date: '2026-11-09', mealSlotId: 4 })).toBe('/plan?mark=2026-11-09:4')
  })

  it('reads the parameter back; anything malformed is null', () => {
    expect(parseMarkSlotParam('2026-11-09:4')).toEqual({ date: '2026-11-09', mealSlotId: 4 })
    expect(parseMarkSlotParam('2026-13-45:4')).toBeNull()
    expect(parseMarkSlotParam('2026-11-09:x')).toBeNull()
    expect(parseMarkSlotParam('2026-11-09:1.5')).toBeNull()
    expect(parseMarkSlotParam('2026-11-09')).toBeNull()
    expect(parseMarkSlotParam('')).toBeNull()
    expect(parseMarkSlotParam(null)).toBeNull()
  })
})

describe('markSlotTarget', () => {
  it('one Course still to cook: its own Mark as Cooked sheet', () => {
    const s = courseSlot([main('cooked'), side('planned')], { date: '2026-11-09', mealSlotId: 4 })
    expect(markSlotTarget(s)).toEqual({ kind: 'one', key: { date: '2026-11-09', mealSlotId: 4, courseId: 2 } })
  })

  it('a one-Course slot is the same', () => {
    expect(markSlotTarget(courseSlot([main()], { date: '2026-11-09', mealSlotId: 4 }))).toEqual({ kind: 'one', key: { date: '2026-11-09', mealSlotId: 4, courseId: 1 } })
  })

  it('several Courses still to cook: Mark all Cooked for those Courses', () => {
    const s = courseSlot([main(), side()], { date: '2026-11-09', mealSlotId: 4 })
    expect(markSlotTarget(s)).toEqual({ kind: 'all', slot: { date: '2026-11-09', mealSlotId: 4 }, courseIds: [1, 2] })
  })

  it('nothing left to mark, or no such slot: none', () => {
    expect(markSlotTarget(courseSlot([main('cooked'), side('skipped')], { date: '2026-11-09' }))).toEqual({ kind: 'none' })
    expect(markSlotTarget(undefined)).toEqual({ kind: 'none' })
  })
})
