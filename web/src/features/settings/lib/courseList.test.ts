import { describe, expect, it } from 'vitest'
import { canAddCourse, courseActions, courseMeta, reorderedIds } from './courseList'

describe('courseMeta', () => {
  it.each([
    [{ recipeCount: 12, mealSlotCount: 5 }, '12 Recipes · 5 Meal Slots'],
    [{ recipeCount: 1, mealSlotCount: 1 }, '1 Recipe · 1 Meal Slot'],
    [{ recipeCount: 0, mealSlotCount: 0 }, '0 Recipes · 0 Meal Slots'],
    [{ recipeCount: 3 }, '3 Recipes'],
    [{ mealSlotCount: 2 }, '2 Meal Slots'],
    [{}, ''],
  ])('%j reads %s', (counts, text) => expect(courseMeta(counts)).toBe(text))
})

describe('courseActions', () => {
  it('a Course that is not main can be renamed, made main and deleted', () => {
    const actions = courseActions({ name: 'Side', main: false })
    expect(actions.map((a) => [a.id, a.label])).toEqual([['rename', 'Rename'], ['makeMain', 'Make main'], ['delete', 'Delete']])
    expect(actions.find((a) => a.id === 'delete')).toMatchObject({ tone: 'danger' })
    expect(actions.some((a) => a.disabled)).toBe(false)
  })

  it('the main Course has no Make main, and its Delete says to make another Course main first (disabled)', () => {
    const actions = courseActions({ name: 'Main', main: true })
    expect(actions.map((a) => a.id)).toEqual(['rename', 'delete'])
    expect(actions[1]).toMatchObject({ label: 'Make another Course main first', disabled: true })
    expect(actions[1]!.tone).toBeUndefined()
  })
})

describe('reorderedIds', () => {
  const ids = [1, 2, 3, 4]
  it('moves the dropped item to its new place', () => {
    expect(reorderedIds(ids, 3, 1)).toEqual([1, 4, 2, 3])
    expect(reorderedIds(ids, 0, 2)).toEqual([2, 3, 1, 4])
  })
  it('is the same order for a drop in place or an index out of range, and leaves the input alone', () => {
    expect(reorderedIds(ids, 2, 2)).toEqual(ids)
    expect(reorderedIds(ids, 0, 9)).toEqual(ids)
    expect(reorderedIds(ids, -1, 1)).toEqual(ids)
    expect(ids).toEqual([1, 2, 3, 4])
  })
})

describe('canAddCourse', () => {
  it('allows 19 and refuses 20 (archived Courses are not counted by the caller)', () => {
    expect(canAddCourse(19)).toBe(true)
    expect(canAddCourse(20)).toBe(false)
  })
})
