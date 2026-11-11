import { describe, expect, it } from 'vitest'
import {
  activeCourses,
  courseListLabel,
  defaultCourseIds,
  dropUnknownCourses,
  inHouseholdOrder,
  mainCourse,
  moveCourse,
  toggleOrdered,
  toggleUnordered,
  validateCourseIds,
} from './order'
import type { Course } from './types'

const c = (id: number, name: string, position: number, over: Partial<Course> = {}): Course => ({ id, name, position, main: false, archived: false, ...over })
// Household order: Main(1), Side(2), Starter(3), Dessert(4); Cheese(5) is archived.
const courses: Course[] = [c(3, 'Starter', 3), c(1, 'Main', 1, { main: true }), c(4, 'Dessert', 4), c(2, 'Side', 2), c(5, 'Cheese', 5, { archived: true })]

describe('activeCourses', () => {
  it('sorts by position and leaves archived Courses out, without changing the input', () => {
    const copy = [...courses]
    expect(activeCourses(courses).map((x) => x.name)).toEqual(['Main', 'Side', 'Starter', 'Dessert'])
    expect(courses).toEqual(copy)
  })
})

describe('mainCourse', () => {
  it('finds the active Course flagged main', () => {
    expect(mainCourse(courses)?.id).toBe(1)
  })
  it('ignores an archived Course and answers undefined when none is main', () => {
    expect(mainCourse([c(1, 'Main', 1, { main: true, archived: true })])).toBeUndefined()
    expect(mainCourse([c(2, 'Side', 2)])).toBeUndefined()
    expect(mainCourse([])).toBeUndefined()
  })
})

describe('defaultCourseIds', () => {
  it('is the main Course alone', () => expect(defaultCourseIds(courses)).toEqual([1]))
  it('is empty when no Course is main', () => expect(defaultCourseIds([c(2, 'Side', 2)])).toEqual([]))
})

describe('inHouseholdOrder', () => {
  const household = courses.filter((x) => !x.archived).sort((a, b) => a.position - b.position)
  it('sorts into household order', () => expect(inHouseholdOrder([4, 1, 2], household)).toEqual([1, 2, 4]))
  it('drops unknown ids (archived included) and duplicates', () => expect(inHouseholdOrder([2, 5, 2, 99, 1], household)).toEqual([1, 2]))
})

describe('dropUnknownCourses', () => {
  const household = courses.filter((x) => !x.archived).sort((a, b) => a.position - b.position)
  it('keeps the given order', () => expect(dropUnknownCourses([4, 1, 2], household)).toEqual([4, 1, 2]))
  it('drops unknown ids and duplicates, first occurrence wins', () => expect(dropUnknownCourses([4, 5, 4, 1], household)).toEqual([4, 1]))
})

describe('toggleOrdered', () => {
  it('adds a new Course last', () => expect(toggleOrdered([2, 1], 4)).toEqual([2, 1, 4]))
  it('takes a chosen Course off and keeps the others in order', () => expect(toggleOrdered([2, 1, 4], 1)).toEqual([2, 4]))
  it('may answer an empty list: the picker then shows the error', () => expect(toggleOrdered([1], 1)).toEqual([]))
  it('does not change its input', () => {
    const ids = [1, 2]
    toggleOrdered(ids, 4)
    expect(ids).toEqual([1, 2])
  })
})

describe('toggleUnordered', () => {
  const household = courses.filter((x) => !x.archived).sort((a, b) => a.position - b.position)
  it('adds in household order, not last', () => expect(toggleUnordered([1, 4], 2, household)).toEqual([1, 2, 4]))
  it('takes a Course off', () => expect(toggleUnordered([1, 2, 4], 2, household)).toEqual([1, 4]))
})

describe('moveCourse', () => {
  it('moves up and down by one', () => {
    expect(moveCourse([1, 2, 3], 1, -1)).toEqual([2, 1, 3])
    expect(moveCourse([1, 2, 3], 1, 1)).toEqual([1, 3, 2])
  })
  it('answers the same array at an edge', () => {
    const ids = [1, 2, 3]
    expect(moveCourse(ids, 0, -1)).toBe(ids)
    expect(moveCourse(ids, 2, 1)).toBe(ids)
  })
  it('does not change its input', () => {
    const ids = [1, 2, 3]
    moveCourse(ids, 1, 1)
    expect(ids).toEqual([1, 2, 3])
  })
})

describe('validateCourseIds', () => {
  it('requires at least one Course', () => {
    expect(validateCourseIds([])).toBe('Choose at least one Course')
    expect(validateCourseIds([2])).toBeNull()
  })
})

describe('courseListLabel', () => {
  it('joins names with a middle dot, in the order given', () => {
    expect(courseListLabel(['Main', 'Side'])).toBe('Main · Side')
    expect(courseListLabel(['Dessert'])).toBe('Dessert')
    expect(courseListLabel([])).toBe('')
  })
})
