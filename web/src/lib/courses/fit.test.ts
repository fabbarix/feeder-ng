import { describe, expect, it } from 'vitest'
import { fitsCourse, includesMainCourse, recipesForCourse, removedCourseIds } from './fit'

describe('fitsCourse', () => {
  it('is true only for a Course the Recipe is marked with', () => {
    expect(fitsCourse({ courseIds: [1, 2] }, 2)).toBe(true)
    expect(fitsCourse({ courseIds: [1, 2] }, 3)).toBe(false)
    expect(fitsCourse({ courseIds: [] }, 1)).toBe(false)
  })
})

describe('recipesForCourse', () => {
  const recipes = [
    { id: 1, courseIds: [1] },
    { id: 2, courseIds: [2] },
    { id: 3, courseIds: [1, 2] },
  ]
  it('keeps the Recipes marked with the Course, in order', () => {
    expect(recipesForCourse(recipes, 2).map((r) => r.id)).toEqual([2, 3])
    expect(recipesForCourse(recipes, 9)).toEqual([])
  })
})

describe('includesMainCourse', () => {
  const courses = [
    { id: 1, main: true },
    { id: 2, main: false },
    { id: 3, main: true, archived: true },
  ]
  it('is true when the ids hold the active main Course', () => {
    expect(includesMainCourse([2, 1], courses)).toBe(true)
    expect(includesMainCourse([2], courses)).toBe(false)
    expect(includesMainCourse([], courses)).toBe(false)
  })
  it('does not count an archived main Course', () => expect(includesMainCourse([3], courses)).toBe(false))
})

describe('removedCourseIds', () => {
  it('lists what a save takes off, in the old order', () => {
    expect(removedCourseIds([1, 2, 4], [1])).toEqual([2, 4])
    expect(removedCourseIds([4, 2, 1], [2])).toEqual([4, 1])
  })
  it('is empty when only added or reordered', () => {
    expect(removedCourseIds([1, 2], [2, 1, 4])).toEqual([])
    expect(removedCourseIds([], [1])).toEqual([])
  })
})
