// B9-47: fixtures shared by the board's tests (the shapes of types.ts, structurally).
import { tonightRows } from './lib/tiles'
import type { BoardHero } from './lib/hero'
import type { BoardData, CourseLike, SlotLike } from './types'

export const meal = (recipeName: string, state: 'planned' | 'cooked' | 'skipped' = 'planned') => ({ recipeId: 1, recipeName, batches: 1, portions: 4, state })
export const course = (courseId: number, name: string, main: boolean, over: Partial<CourseLike> = {}): CourseLike => ({ courseId, name, main, meal: null, ...over })

/** A slot of `date` at HH:MM (UTC, as the tests' household zone), with one planned Main Course, or the given Courses. */
export function slotOn(date: string, mealSlotId: number, name: string, time: string, recipe: string | CourseLike[] | null, over: Partial<SlotLike> = {}): SlotLike {
  const courses = recipe === null ? [] : typeof recipe === 'string' ? [course(1, 'Main', true, { meal: meal(recipe) })] : recipe
  return { date, mealSlotId, name, time, at: `${date}T${time}:00Z`, courses, ...over }
}

export const TODAY = '2026-11-09'
export const TOMORROW = '2026-11-10'

export const boardData = (over: Partial<BoardData> = {}): BoardData => ({
  now: `${TODAY}T17:00:00Z`,
  today: TODAY,
  theme: { dark: false, nextChangeAt: `${TOMORROW}T06:00:00Z`, source: 'sun', reason: '' },
  streak: { days: 3 },
  nextAdvance: null,
  ...over,
})

/** A BoardHero literal for a slot (what boardHero builds), so the tile tests do not depend on the selection. */
export function heroOf(slot: SlotLike, over: Partial<BoardHero> = {}): BoardHero {
  return {
    slot,
    day: 'today',
    eyebrow: ['Today', slot.name, slot.time],
    startLine: null,
    rows: tonightRows(slot),
    cookPath: `/cook/meal/${slot.date}/${slot.mealSlotId}`,
    ...over,
  }
}
