// B9-26 (SAFE-03): the words of a Cooked or Not cooked meal's sheet and of the Cooked and Not cooked toasts.
import { describe, expect, it } from 'vitest'
import { allCookedResult, courseMeal, courseSlot, planCourse } from '../test-utils'
import type { CookedResult, PlanSlot } from '../types'
import { cookedToast, markedTogether, notCookedToast, resolvedActions, resolvedHint, resolvedSummary, stockGoneNote, type MealResolution } from './resolved'

// 2026-11-14 is a Saturday; the Household zone is Europe/Rome (UTC+1 in November): 07:40Z is 08:40.
const cooked = (over: Partial<MealResolution> = {}): MealResolution => ({
  kind: 'cooked', markedOn: '2026-11-14', markedAt: '2026-11-14T07:40:00Z', markedBy: 'Anna', leftoverPortions: 1.25, canUndo: true, ...over,
})
const notCooked = (over: Partial<MealResolution> = {}): MealResolution => ({ ...cooked({ kind: 'not_cooked', leftoverPortions: 0 }), ...over })
const ctx = { today: '2026-11-14', timeZone: 'Europe/Rome' }

describe('resolvedSummary', () => {
  it('Cooked: today, the time in the Household zone, who, and the Leftover kept', () => {
    expect(resolvedSummary(cooked(), ctx)).toBe('Marked Cooked today at 08:40 by Anna. 1.25 portions were kept as a Leftover.')
  })
  it('Cooked with no Leftover says nothing about one; one portion is singular', () => {
    expect(resolvedSummary(cooked({ leftoverPortions: 0 }), ctx)).toBe('Marked Cooked today at 08:40 by Anna.')
    expect(resolvedSummary(cooked({ leftoverPortions: 1 }), ctx)).toBe('Marked Cooked today at 08:40 by Anna. 1 portion was kept as a Leftover.')
  })
  it('Not cooked', () => {
    expect(resolvedSummary(notCooked(), ctx)).toBe('Marked Not cooked today at 08:40 by Anna.')
  })
  it('an earlier day names the weekday; a missing name or zone leaves that part out', () => {
    expect(resolvedSummary(cooked({ markedOn: '2026-11-13', leftoverPortions: 0 }), ctx)).toBe('Marked Cooked on Fri at 08:40 by Anna.')
    expect(resolvedSummary(cooked({ markedBy: undefined, leftoverPortions: 0 }), { today: '2026-11-14' })).toBe('Marked Cooked today.')
  })
})

describe('resolvedHint', () => {
  it('Cooked, can undo: what Undo does and until when', () => {
    expect(resolvedHint(cooked(), ctx)).toBe(
      'Undo Cooked puts back the Stock it used and removes its Leftover. You can undo it until the end of today, while nobody has had any of the Leftover.',
    )
  })
  it('Not cooked, can undo', () => {
    expect(resolvedHint(notCooked(), ctx)).toBe('Cooked after all? Mark it now and Feeder takes the Stock it used. Undo Not cooked puts it back in To confirm.')
  })
  it('cannot undo: the Leftover was had', () => {
    expect(resolvedHint(cooked({ canUndo: false, cannotUndo: 'leftover_used' }), ctx)).toBe("Some of its Leftover was already had, so Cooked can't be undone.")
  })
  it('cannot undo: the day is over (the read says window_over)', () => {
    expect(resolvedHint(cooked({ markedOn: '2026-11-13', canUndo: false, cannotUndo: 'window_over' }), ctx)).toBe('Marked on Fri, so it can no longer be undone.')
  })
})

describe('resolvedActions', () => {
  it('Cooked: one outline Undo Cooked', () => {
    expect(resolvedActions(cooked())).toEqual([{ id: 'undoCooked', label: 'Undo Cooked', primary: false }])
  })
  it('Not cooked: Cooked after all (primary), then Undo Not cooked', () => {
    expect(resolvedActions(notCooked())).toEqual([
      { id: 'cookedAfterAll', label: 'Cooked after all', primary: true },
      { id: 'undoNotCooked', label: 'Undo Not cooked', primary: false },
    ])
  })
  it('no button once it cannot be undone', () => {
    expect(resolvedActions(cooked({ canUndo: false, cannotUndo: 'window_over' }))).toEqual([])
    expect(resolvedActions(notCooked({ canUndo: false, cannotUndo: 'leftover_used' }))).toEqual([])
  })
})

describe('markedTogether (the sheet says "Undo Cooked for all 3 Courses")', () => {
  const m = (courseId: number, name: string, resolution: MealResolution) => planCourse({ courseId, name, main: courseId === 1, meal: { ...courseMeal(courseId, name, { state: 'cooked' }), resolution } as never })
  const dinner = (rs: MealResolution[]): PlanSlot => courseSlot(rs.map((r, i) => m(i + 1, ['Main', 'Side', 'Dessert'][i]!, r)), { date: '2026-11-14', mealSlotId: 3 })

  it('counts the Courses marked by the same action: same kind, same time, same User', () => {
    expect(markedTogether(dinner([cooked(), cooked(), cooked()]), 2)).toBe(3)
  })
  it('a Course marked on its own counts 1', () => {
    expect(markedTogether(dinner([cooked(), cooked({ markedAt: '2026-11-14T07:45:00Z' }), cooked({ kind: 'not_cooked' })]), 2)).toBe(1)
  })
  it('a Course with no resolution counts 1', () => {
    expect(markedTogether(courseSlot([planCourse({ courseId: 1, meal: courseMeal(1, 'Main') })]), 1)).toBe(1)
  })
})

describe('cookedToast', () => {
  const slots = [courseSlot([planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main') })], { date: '2026-11-14', mealSlotId: 1, name: 'Breakfast', time: '08:30' })]
  const key = { date: '2026-11-14', mealSlotId: 1, courseId: 1 }
  const leftover = { id: 3, recipeId: 7, recipeName: 'Slow cooker beef and barley stew', portions: 1.25, cookedOn: '2026-11-14', useBy: '2026-11-17', fromDate: '2026-11-14', fromMealSlotId: 1 }
  const result = (over: Partial<CookedResult> = {}): CookedResult => ({ meal: courseMeal(1, 'Main', { state: 'cooked' }), leftover, warnings: [], plannedFor: [], ...over })

  it('a Leftover kept: headline, subline "Sat Breakfast · Recipe", body; Undo named for the meal', () => {
    expect(cookedToast({ slots, key, recipeName: 'Slow cooker beef and barley stew', result: result() })).toEqual({
      headline: 'Cooked, nice one!',
      subline: 'Sat Breakfast · Slow cooker beef and barley stew',
      body: '1.25 portions kept as a Leftover, good until Tue.',
      undoAriaLabel: 'Undo Cooked for Sat Breakfast',
      restored: 'Sat Breakfast is back in To confirm',
    })
  })
  it('a Leftover planned for a later meal says where', () => {
    const t = cookedToast({ slots, key, recipeName: 'Stew', result: result({ plannedFor: [{ date: '2026-11-16', mealSlotId: 3, mealSlotName: 'Dinner', recipeName: 'Stew' }] }) })
    expect(t.body).toBe('1.25 portions planned for Mon Dinner.')
  })
  it('no Leftover: no body', () => {
    expect(cookedToast({ slots, key, recipeName: 'Stew', result: result({ leftover: null }) }).body).toBeUndefined()
  })
  it('a Mark all: the slot as the subline, each Leftover by its Recipe, Undo for all the Courses', () => {
    const dinner = courseSlot(
      [
        planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main') }),
        planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') }),
        planCourse({ courseId: 3, name: 'Dessert', main: false, meal: courseMeal(3, 'Dessert') }),
      ],
      { date: '2026-11-10', mealSlotId: 4, name: 'Dinner', time: '19:00' },
    )
    const t = cookedToast({ slots: [dinner], key: { date: '2026-11-10', mealSlotId: 4, courseId: 1 }, recipeName: '', result: allCookedResult(), courses: 3 })
    expect(t.headline).toBe('Cooked, nice one!')
    expect(t.subline).toBe('Tue Dinner')
    expect(t.body).toBe('Roast chicken: 2 portions planned for Thu Lunch. Green beans: 1 portion kept as a Leftover, good until Fri.')
    expect(t.undoAriaLabel).toBe('Undo Cooked for all 3 Courses')
    expect(t.restored).toBe('Tue Dinner is back in To confirm')
  })
})

describe('notCookedToast', () => {
  const dinner = courseSlot(
    [planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main') }), planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side') })],
    { date: '2026-11-14', mealSlotId: 3, name: 'Dinner', time: '19:00' },
  )
  it('the whole slot: one line, no body', () => {
    expect(notCookedToast({ slots: [dinner], key: { date: '2026-11-14', mealSlotId: 3, courseId: 1 }, whole: true })).toEqual({
      headline: 'Sat Dinner marked Not cooked',
      undoAriaLabel: 'Undo Not cooked for Sat Dinner',
      restored: 'Sat Dinner is back in To confirm',
    })
  })
  it('one Course that is not the Main one names the Course', () => {
    const t = notCookedToast({ slots: [dinner], key: { date: '2026-11-14', mealSlotId: 3, courseId: 2 } })
    expect(t.headline).toBe('Sat Dinner, Side marked Not cooked')
    expect(t.undoAriaLabel).toBe('Undo Not cooked for Sat Dinner, Side')
  })
})

describe('stockGoneNote', () => {
  it('says how many Stock Lots could not be given back', () => {
    expect(stockGoneNote(0)).toBeNull()
    expect(stockGoneNote(1)).toBe('1 Stock Lot was already gone, so its Stock was not put back.')
    expect(stockGoneNote(3)).toBe('3 Stock Lots were already gone, so their Stock was not put back.')
  })
})
