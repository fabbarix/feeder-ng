// CRS D2 test data: the household's Courses, Meal Slots that serve some, and what removing Side would change.
import type { Course, CourseChoice, CourseImpact } from '../../../lib/courses'
import type { DateAttendance, MealSlot, SlotCourse } from '../types'
import { thursdayDinner, tuesdayDinner } from './fixtures'

export const mainCourse: Course = { id: 1, name: 'Main', position: 0, main: true, archived: false, recipeCount: 12, mealSlotCount: 5, planned: true }
export const sideCourse: Course = { id: 2, name: 'Side', position: 1, main: false, archived: false, recipeCount: 8, mealSlotCount: 3, planned: true }
export const starterCourse: Course = { id: 3, name: 'Starter', position: 2, main: false, archived: false, recipeCount: 1, mealSlotCount: 1, planned: false }
export const dessertCourse: Course = { id: 4, name: 'Dessert', position: 3, main: false, archived: false, recipeCount: 4, mealSlotCount: 2, planned: false }
export const brunchCourse: Course = { id: 5, name: 'Brunch', position: 4, main: false, archived: true, recipeCount: 0, mealSlotCount: 0, planned: true }

/** Household order: Main, Side, Starter, Dessert. */
export const activeCourses: Course[] = [mainCourse, sideCourse, starterCourse, dessertCourse]
export const allCourses: Course[] = [...activeCourses, brunchCourse]
export const choices: CourseChoice[] = activeCourses.map(({ id, name, main }) => ({ id, name, main }))

const slotCourse = (c: Course, optional = false, optOutMemberIds: number[] = []): SlotCourse => ({ id: c.id, name: c.name, main: c.main, optional, optOutMemberIds })

/** Tuesday Dinner: Main, Side, and an optional Dessert that Sam (3) does not eat. */
export const tuesdayCourses: SlotCourse[] = [slotCourse(mainCourse), slotCourse(sideCourse), slotCourse(dessertCourse, true, [3])]
export const tuesdayDinnerCourses: MealSlot = { ...tuesdayDinner, courses: tuesdayCourses }
/** Thursday Dinner: Main, Side. */
export const thursdayDinnerCourses: MealSlot = { ...thursdayDinner, courses: [slotCourse(mainCourse), slotCourse(sideCourse)] }

/** Thursday 12 Nov 2026, usual Attendance, three Courses, Sam (3) usually skipping Dessert. */
export const thursdayWithDessert: MealSlot = { ...thursdayDinner, courses: [slotCourse(mainCourse), slotCourse(sideCourse), slotCourse(dessertCourse, true, [3])] }
export const dateWithCourses: DateAttendance = {
  slotId: 11,
  date: '2026-11-12',
  isOverride: false,
  attendance: thursdayDinner.attendance,
  portionsNeeded: 2.5,
  courses: [
    { courseId: 1, name: 'Main', optOutMemberIds: [], isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5 },
    { courseId: 2, name: 'Side', optOutMemberIds: [], isOverride: false, attendance: thursdayDinner.attendance, portionsNeeded: 2.5 },
    { courseId: 4, name: 'Dessert', optOutMemberIds: [3], isOverride: false, attendance: thursdayDinner.attendance.slice(0, 2), portionsNeeded: 2 },
  ],
}

/** What deleting or archiving Side changes: 3 Recipes and 2 Meal Slots have only Side. */
export const sideImpact: CourseImpact = {
  planned: true,
  recipes: 8,
  recipesOnlyThis: 3,
  mealSlots: 3,
  mealSlotsOnlyThis: 2,
  plannedMeals: [
    { date: '2026-11-10', mealSlotId: 10, mealSlotName: 'Dinner', recipeId: 8, recipeName: 'Green salad', pinned: false },
    { date: '2026-11-12', mealSlotId: 11, mealSlotName: 'Dinner', recipeId: 7, recipeName: 'Roast potatoes', pinned: true },
  ],
  slotRules: [
    { id: 1, mealSlotId: 11, recipeId: 7, recipeName: 'Roast potatoes' },
    { id: 2, mealSlotId: 10, tag: 'vegetarian' },
  ],
}
/** A Course nothing uses. */
export const emptyImpact: CourseImpact = { planned: false, recipes: 0, recipesOnlyThis: 0, mealSlots: 0, mealSlotsOnlyThis: 0, plannedMeals: [], slotRules: [] }
