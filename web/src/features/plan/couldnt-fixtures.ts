// CRS G2: fixtures for the Couldn't plan tiles and the Review Exclusions page. Dates: 2026-11-10 is a Tuesday (today).
// Courses: Main 1 (the main Course), Side 2, Dessert 3. Dinner is Meal Slot 4.
import { courseMeal, courseSlot, planCourse, slot } from './test-utils'
import type { Eliminations, ExclusionCell, ExclusionRecord, MemberRef, PlanCourse, PlanSlot, Unfilled, UnfilledReason } from './types'

export const NONE: Eliminations = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }

export const DINNER = 4

/** The seven dinners of a week that starts today (Tue 10 Nov .. Mon 16 Nov). */
export const WEEK = ['2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13', '2026-11-14', '2026-11-15', '2026-11-16']

export function unfilled(reason: UnfilledReason, eliminated: Partial<Eliminations> = {}, slotRuleClaimed = false): Unfilled {
  return { reason, slotRuleClaimed, eliminated: { ...NONE, ...eliminated } }
}

export const EXCLUDED = unfilled('no_candidates', { considered: 4, exclusion: 4 })
export const NO_COURSE_RECIPES = unfilled('no_course_recipes')
export const NOBODY = unfilled('no_attendance')

/** The Course's Planned Meal, for the Courses of a slot that are fine. */
export const planned = (courseId: number, name: string, main = courseId === 1): PlanCourse =>
  planCourse({ courseId, name, main, meal: courseMeal(courseId, name, { recipeName: `${name} dish` }) })

/** A Course the planner left empty with a reason. */
export const empty = (courseId: number, name: string, reason: Unfilled, main = courseId === 1): PlanCourse =>
  planCourse({ courseId, name, main, meal: null, unfilled: reason })

/** A dinner (slot 4) with the given Courses on a date. */
export const dinner = (date: string, courses: PlanCourse[], over: Partial<PlanSlot> = {}): PlanSlot => courseSlot(courses, { date, mealSlotId: DINNER, name: 'Dinner', ...over })

/** A Meal Slot with its own name and id (Lunch, Breakfast...) and the given Courses. */
export const otherSlot = (date: string, name: string, mealSlotId: number, courses: PlanCourse[]): PlanSlot => courseSlot(courses, { date, mealSlotId, name })

/** A flat entry as GET /api/plan/couldnt-plan answers: the slot's fields plus the Course, `meal` null and the reason. */
export function flat(date: string, courseId: number, courseName: string, reason: Unfilled, over: Partial<PlanSlot> = {}): PlanSlot {
  return slot({ date, mealSlotId: DINNER, name: 'Dinner', meal: null, unfilled: reason, courseId, courseName, ...over })
}

/** A slot without `courses`: the course-less shape (one main Course), as before CRS. */
export const lone = (date: string, reason: Unfilled | null, name = 'Dinner', mealSlotId = DINNER): PlanSlot =>
  slot({ date, name, mealSlotId, meal: null, unfilled: reason })

export const member = (id: number, name: string, colour = '#3366cc'): MemberRef => ({ id, name, colour })
export const SAM = member(3, 'Sam', '#cc3366')
export const ALEX = member(2, 'Alex', '#33cc66')
export const KIM = member(5, 'Kim', '#cc9933')
export const ADA = member(6, 'Ada', '#9933cc')

export const garlic = (m: MemberRef = SAM, over: Partial<ExclusionRecord> = {}): ExclusionRecord => ({
  member: m,
  ingredient: { id: 12, name: 'garlic' },
  recipes: [
    { id: 4, name: 'Bolognese' },
    { id: 5, name: 'Garlic bread' },
    { id: 6, name: 'Pesto pasta' },
    { id: 7, name: 'Scampi' },
  ],
  recipeCount: 4,
  ...over,
})

export const fishPie = (m: MemberRef = ALEX, over: Partial<ExclusionRecord> = {}): ExclusionRecord => ({
  member: m,
  ingredient: null,
  recipes: [{ id: 3, name: 'Fish pie' }],
  recipeCount: 1,
  ...over,
})

/** An API cell of the Review Exclusions payload: a Side at dinner, Sam's garlic, everyone but nobody opting out. */
export function exclusionCell(date: string, over: Partial<ExclusionCell> = {}): ExclusionCell {
  return {
    date,
    mealSlotId: DINNER,
    mealSlotName: 'Dinner',
    time: '19:00',
    courseId: 2,
    courseName: 'Side',
    slotRuleClaimed: false,
    eliminated: { ...NONE, considered: 4, exclusion: 4 },
    attendance: [SAM, ALEX],
    optOuts: [],
    exclusions: [garlic()],
    moreExclusions: 0,
    ...over,
  }
}

/** A week of dinners that serve Main and Side, the Side excluded on the given dates (the Main is planned). */
export function sideWeek(excludedDates: string[], dates: string[] = WEEK): PlanSlot[] {
  return dates.map((d) => dinner(d, [planned(1, 'Main'), excludedDates.includes(d) ? empty(2, 'Side', EXCLUDED) : planned(2, 'Side')]))
}
