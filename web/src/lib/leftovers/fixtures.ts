// Test fixtures for the Leftovers lib and its components. Today is Thursday 2026-11-12.
import type { Leftover, LeftoverPlace, PlannedMealRef } from './types'

export const TODAY = '2026-11-12'

export const leftover = (over: Partial<Leftover> = {}): Leftover => ({
  id: 1, recipeId: 10, recipeName: 'Chilli', portions: 3, cookedOn: '2026-11-10', useBy: '2026-11-14',
  fromDate: '2026-11-10', fromMealSlotId: 2, storagePlaceId: null, storagePlaceName: null,
  frozen: false, frozenOn: null, toAnswer: false, plannedPortions: 0, ...over,
})

export const frozenChilli = (over: Partial<Leftover> = {}): Leftover =>
  leftover({ id: 5, portions: 3, useBy: '2027-02-10', frozen: true, frozenOn: '2026-11-12', storagePlaceId: 2, storagePlaceName: 'Garage Freezer', ...over })

export const places: LeftoverPlace[] = [
  { id: 1, name: 'Kitchen Pantry', kind: 'pantry', default: true },
  { id: 2, name: 'Garage Freezer', kind: 'freezer', default: false },
  { id: 3, name: 'Garage Fridge', kind: 'fridge', default: false },
  { id: 4, name: 'Basement Freezer', kind: 'freezer', default: false },
]

/** A Planned Meal the server says would lose its portions (`replanned`, or the dry run). */
export const friLunch: PlannedMealRef = { date: '2026-11-13', mealSlotId: 2, mealSlotName: 'Lunch', courseId: 1, recipeName: 'Chilli' }
export const friDinner: PlannedMealRef = { date: '2026-11-13', mealSlotId: 3, mealSlotName: 'Dinner', courseId: 1, recipeName: 'Chilli' }
