// CRS F: the Courses of a slot (spec 7.5). Pure rules behind the rows, captions, the slot menu and the hero split.
import { describe, expect, it } from 'vitest'
import {
  addableCourses, compactRows, courseKey, courseOf, courseRows, heroRow, plannedMeals, slotCourses, slotMenu, unresolvedCourseIds, withoutCaption, wholeMealChip,
} from './courses'
import { courseMeal, courseSlot, meal, planCourse, slot } from '../test-utils'
import { serverSlot } from '../test-utils.c3'

const main = (over = {}) => planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { recipeName: 'Roast chicken' }), ...over })
const side = (over = {}) => planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { recipeName: 'Green beans', recipeId: 8 }), ...over })
const dessert = (over = {}) => planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional', ...over })
const sam = { id: 1, name: 'Sam' }
const ada = { id: 2, name: 'Ada' }
const bo = { id: 3, name: 'Bo' }
const names = (slotArg: Parameters<typeof courseRows>[0]) => courseRows(slotArg).map((r) => r.course.name)

describe('slotCourses', () => {
  // C3: GET /api/plan always sends `courses`; there is no main Course made up from meal and unfilled, and no courseId 0.
  it('a slot without `courses` has no Courses (nothing is made up from meal, nothing is courseId 0)', () => {
    expect(slotCourses(slot({ meal: meal({ courseId: 7, courseName: 'Main' }) }))).toEqual([])
    expect(slotCourses(slot({ meal: null }))).toEqual([])
  })

  it('a slot with `courses` returns them as sent', () => {
    const courses = [main(), side()]
    expect(slotCourses(courseSlot(courses))).toEqual(courses)
  })

  it('reads the Course rows, never the slot\'s own meal and unfilled', () => {
    const s = serverSlot([main(), side()])
    expect(s).not.toHaveProperty('meal')
    expect(slotCourses(s).map((c) => c.courseId)).toEqual([1, 2])
    expect(plannedMeals(s).map((m) => m.recipeName)).toEqual(['Roast chicken', 'Green beans'])
    expect(courseRows(s).map((r) => r.key.courseId)).toEqual([1, 2])
  })
})

describe('courseKey', () => {
  it('always carries the Course id (the course-less alias routes are gone)', () => {
    const s = serverSlot([main(), side()])
    expect(courseKey(s, s.courses![0]!)).toEqual({ date: '2026-11-10', mealSlotId: 2, courseId: 1 })
    expect(courseKey(s, s.courses![1]!)).toEqual({ date: '2026-11-10', mealSlotId: 2, courseId: 2 })
  })

  it('carries it for a slot that has `courses` and for a bare one', () => {
    const bare = slot()
    expect(courseKey(bare, main())).toEqual({ date: '2026-11-10', mealSlotId: 2, courseId: 1 })
  })
})

describe('courseOf', () => {
  it('finds a Course by its id; no id means no Course (there is no "main by default")', () => {
    const s = serverSlot([main(), side()])
    expect(courseOf(s, 2)?.name).toBe('Side')
    expect(courseOf(s, 9)).toBeUndefined()
    expect(courseOf(s, undefined as never)).toBeUndefined()
    expect(courseOf(slot(), 1)).toBeUndefined()
  })
})

describe('courseRows: which Courses show a row', () => {
  it('shows one row per Course in the slot order, the Course name as a caption on each', () => {
    const rows = courseRows(courseSlot([main(), side()]))
    expect(rows.map((r) => r.caption)).toEqual(['Main', 'Side'])
    expect(rows.map((r) => r.key.courseId)).toEqual([1, 2])
  })

  it('a slot that shows ONE row has no caption (it looks exactly as before)', () => {
    expect(courseRows(courseSlot([main()])).map((r) => r.caption)).toEqual([null])
    expect(courseRows(slot()).map((r) => r.caption)).toEqual([null])
  })

  it('a covered Course shows no row; the lone main row then has no caption', () => {
    const covered = side({ meal: null, coveredBy: { courseId: 1, recipeId: 7, recipeName: 'Lasagne' } })
    const rows = courseRows(courseSlot([main({ meal: courseMeal(1, 'Main', { recipeName: 'Lasagne', wholeMeal: true }) }), covered]))
    expect(rows.map((r) => r.course.name)).toEqual(['Main'])
    expect(rows[0]!.caption).toBeNull()
  })

  it('an optional Course left empty and a Course nobody eats show no row', () => {
    const nobody = side({ meal: null, unserved: 'no_course_attendance' })
    expect(names(courseSlot([main(), dessert(), nobody]))).toEqual(['Main'])
  })

  it('a Course that holds a Planned Meal beside a Whole meal (kept, Pinned) is an ordinary row', () => {
    const whole = main({ meal: courseMeal(1, 'Main', { recipeName: 'Lasagne', wholeMeal: true }) })
    expect(names(courseSlot([whole, side({ meal: courseMeal(2, 'Side', { pinned: true }) })]))).toEqual(['Main', 'Side'])
  })

  it('an optional Course that holds a Planned Meal shows its row', () => {
    expect(names(courseSlot([main(), dessert({ unserved: null, meal: courseMeal(3, 'Dessert', { recipeName: 'Tiramisu' }) })]))).toEqual(['Main', 'Dessert'])
  })

  it("a Course the planner could not fill shows its row (the Couldn't plan block); so does one not planned yet", () => {
    const unfilled = { reason: 'no_candidates' as const, slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } }
    expect(names(courseSlot([main(), side({ meal: null, unfilled })]))).toEqual(['Main', 'Side'])
    expect(names(courseSlot([main(), side({ meal: null })]))).toEqual(['Main', 'Side'])
  })

  it('a history row (a Course the slot no longer serves, Cooked) comes after the slot Courses', () => {
    const history = planCourse({ courseId: 9, name: 'Starter', main: false, meal: courseMeal(9, 'Starter', { state: 'cooked' }) })
    expect(names(courseSlot([main(), side(), history]))).toEqual(['Main', 'Side', 'Starter'])
  })
})

describe('Course Attendance caption', () => {
  const attendance = [sam, ada, bo]

  it('"Dessert · without Sam"', () => {
    const rows = courseRows(courseSlot([main(), side({ name: 'Dessert', courseId: 3, optOutMemberIds: [1] })], { attendance }))
    expect(rows[1]!.caption).toBe('Dessert · without Sam')
    expect(rows[0]!.caption).toBe('Main')
  })

  it.each([
    [[1], 'without Sam'],
    [[1, 2], 'without Sam and Ada'],
    [[1, 2, 3], 'without 3'],
    [[], null],
  ])('withoutCaption(%j) is %j', (ids, expected) => {
    expect(withoutCaption(ids as number[], attendance)).toBe(expected)
  })

  it('an id with no known name counts toward the number and forces the "without N" form', () => {
    expect(withoutCaption([1, 99], attendance)).toBe('without 2')
    expect(withoutCaption([99], undefined)).toBe('without 1')
  })
})

describe('the slot menu', () => {
  const two = courseSlot([main(), side()])

  it('addableCourses: covered, optional-and-empty and nobody-eats Courses, not the ones that hold a meal or a reason', () => {
    const covered = planCourse({ courseId: 4, name: 'Starter', main: false, coveredBy: { courseId: 1, recipeId: 7, recipeName: 'Lasagne' } })
    const nobody = planCourse({ courseId: 5, name: 'Cheese', main: false, unserved: 'no_course_attendance' })
    const unfilled = planCourse({ courseId: 6, name: 'Soup', main: false, unfilled: { reason: 'no_course_recipes', slotRuleClaimed: false, eliminated: { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 } } })
    const s = courseSlot([main(), side(), dessert(), covered, nobody, unfilled])
    expect(addableCourses(s).map((c) => c.name)).toEqual(['Dessert', 'Starter', 'Cheese'])
  })

  it('plannedMeals: only the Planned Meals still to cook, in the slot order', () => {
    const s = courseSlot([main(), side({ meal: courseMeal(2, 'Side', { state: 'cooked' }) }), dessert({ unserved: null, meal: courseMeal(3, 'Dessert') })])
    expect(plannedMeals(s).map((m) => m.courseName)).toEqual(['Main', 'Dessert'])
  })

  it('offers Mark all Cooked and Not cooked: whole slot for two Planned Meals to cook, today or past', () => {
    expect(slotMenu(two, '2026-11-10')).toEqual({ markAllCooked: true, notCookedSlot: true, add: [] })
    expect(slotMenu(two, '2026-11-11')).toEqual({ markAllCooked: true, notCookedSlot: true, add: [] })
  })

  it('a future slot cannot be marked Cooked or Not cooked: no such entries', () => {
    expect(slotMenu(two, '2026-11-09')).toBeNull()
  })

  it('lists "Add <Course>" with the key of the empty Course', () => {
    const s = courseSlot([main(), dessert()])
    expect(slotMenu(s, '2026-11-10')).toEqual({ markAllCooked: false, notCookedSlot: false, add: [{ key: { date: '2026-11-10', mealSlotId: 2, courseId: 3 }, label: 'Add Dessert' }] })
  })

  it('a one-Course slot has no menu', () => {
    expect(slotMenu(slot(), '2026-11-10')).toBeNull()
    expect(slotMenu(courseSlot([main()]), '2026-11-10')).toBeNull()
  })

  it('a slot with one Planned Meal to cook and one Cooked has no whole-slot entries (the Course has its own)', () => {
    const s = courseSlot([main(), side({ meal: courseMeal(2, 'Side', { state: 'cooked' }) })])
    expect(slotMenu(s, '2026-11-10')).toBeNull()
  })

  it('unresolvedCourseIds: the Courses with a Planned Meal to cook, in the slot order', () => {
    const s = courseSlot([main(), side({ meal: courseMeal(2, 'Side', { state: 'skipped' }) }), dessert({ courseId: 3, unserved: null, meal: courseMeal(3, 'Dessert') })])
    expect(unresolvedCourseIds(s)).toEqual([1, 3])
  })
})

describe('the hero split on Today', () => {
  it('the main Course takes the hero, the others are compact rows in the slot order', () => {
    const s = courseSlot([side(), main()])
    expect(heroRow(s)!.course.name).toBe('Main')
    expect(compactRows(s).map((r) => r.course.name)).toEqual(['Side'])
  })

  it('without a Planned Meal in the main Course the first row with one takes the hero', () => {
    const s = courseSlot([main({ meal: null }), side()])
    expect(heroRow(s)!.course.name).toBe('Side')
    expect(compactRows(s).map((r) => r.course.name)).toEqual(['Main'])
  })

  it('a Cooked main Course does not take the hero: the first Course still to cook does', () => {
    const s = courseSlot([main({ meal: courseMeal(1, 'Main', { state: 'cooked' }) }), side()])
    expect(heroRow(s)!.course.name).toBe('Side')
    expect(compactRows(s).map((r) => r.course.name)).toEqual(['Main'])
  })

  it('a slot with nothing planned has no hero row', () => {
    expect(heroRow(courseSlot([main({ meal: null })]))).toBeNull()
  })
})

describe('the Whole meal chip', () => {
  const whole = main({ meal: courseMeal(1, 'Main', { recipeName: 'Lasagne', wholeMeal: true }) })

  it('a Whole meal in the main Course of a slot that serves several Courses says so', () => {
    const s = courseSlot([whole, side({ meal: null, coveredBy: { courseId: 1, recipeId: 7, recipeName: 'Lasagne' } })])
    expect(wholeMealChip(s, courseRows(s)[0]!)).toEqual({ key: 'status:whole-meal', kind: 'status', status: 'info', label: 'Whole meal' })
  })

  it('a one-Course slot, or an ordinary Recipe, has no such chip', () => {
    const one = courseSlot([whole])
    expect(wholeMealChip(one, courseRows(one)[0]!)).toBeNull()
    const ordinary = courseSlot([main(), side()])
    expect(wholeMealChip(ordinary, courseRows(ordinary)[0]!)).toBeNull()
  })
})
