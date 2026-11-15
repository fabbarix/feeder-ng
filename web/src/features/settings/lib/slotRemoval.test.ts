// SAFE-02 (Remove Meal Slot, decision SAFE 4 + 7): the confirm lists what goes and what stays as rows (R-E), then an Undo toast.
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import type { MealSlot } from '../types'
import { mergeImpacts, nameTakenRefusal, putBackRefusedHeadline, removalTarget, removeGroups, removeLead, removedHeadline, removeTitle, restoredHeadline, undoRemoveLabel, type ImpactMeal, type MealSlotImpact } from './slotRemoval'

const meal = (date: string, over: Partial<ImpactMeal> = {}): ImpactMeal => ({
  date, mealSlotId: 10, mealSlotName: 'Dinner', courseId: 1, courseName: 'Main', recipeId: 5, recipeName: 'Pasta', pinned: false, bought: [], ...over,
})
const impact = (over: Partial<MealSlotImpact> = {}): MealSlotImpact => ({
  plannedMeals: [meal('2026-11-16'), meal('2026-11-23'), meal('2026-11-30')],
  slotRules: [{ id: 3, mealSlotId: 10, mealSlotName: 'Dinner', courseId: 1, courseName: 'Main', recipeId: 5, recipeName: 'Pasta al pomodoro' }],
  toConfirm: [meal('2026-11-14')],
  cookedKept: 4,
  ...over,
})
const TODAY = '2026-11-16' // Monday
const dinner = (weekday: number, over: Partial<MealSlot> = {}): MealSlot => ({ id: 600 + weekday, weekday, name: 'Dinner', time: '19:30', attendance: [], portionsNeeded: 0, ...over })
const week = [1, 2, 3, 4, 5, 6, 7].map((d) => dinner(d))
const household = [...week, { ...dinner(7), id: 650, name: 'Lunch' }]

// B9-42 ruling: Remove in the Edit sheet acts on the days ticked in it, like Save; the words follow those days.
describe('removalTarget: the days ticked in the sheet', () => {
  it('every day the name runs: all seven slots, everyDay, no other day', () => {
    const t = removalTarget(week[0]!, [1, 2, 3, 4, 5, 6, 7], household)
    expect(t).toMatchObject({ name: 'Dinner', weekdays: [1, 2, 3, 4, 5, 6, 7], everyDay: true, otherDays: 0 })
    expect(t.slots.map((s) => s.id)).toEqual([601, 602, 603, 604, 605, 606, 607])
  })
  it('one day: that slot only', () => {
    expect(removalTarget(week[0]!, [1], household)).toMatchObject({ weekdays: [1], everyDay: false, otherDays: 6 })
  })
  it('some days: those slots, in weekday order; a ticked day without the name is left out', () => {
    const fewer = household.filter((s) => s.id !== 604)
    const t = removalTarget(week[0]!, [3, 1, 2, 4], fewer)
    expect(t.weekdays).toEqual([1, 2, 3])
    expect(t).toMatchObject({ everyDay: false, otherDays: 3 })
  })
  it('matches the name as the batch does: case and edge spaces ignored', () => {
    expect(removalTarget({ name: ' dinner ' }, [5], household).slots.map((s) => s.id)).toEqual([605])
  })
  it('a name on one day only is that day, never "every day"', () => {
    expect(removalTarget(household[7]!, [7], household)).toMatchObject({ name: 'Lunch', weekdays: [7], everyDay: false, otherDays: 0 })
  })
})

describe('the words', () => {
  const all = removalTarget(week[0]!, [1, 2, 3, 4, 5, 6, 7], household)
  const one = removalTarget(week[0]!, [1], household)
  const some = removalTarget(week[0]!, [1, 2, 3], household)
  it('the title: "Remove Dinner?" for all its days, the day for one, the short days for some', () => {
    expect(removeTitle(all, 'en')).toBe('Remove Dinner?')
    expect(removeTitle(one, 'en')).toBe('Remove Dinner on Monday?')
    expect(removeTitle(some, 'en')).toBe('Remove Dinner on Mon, Tue and Wed?')
  })
  it('the lead says the name stays on the other days; with no other day it has no lead', () => {
    expect(removeLead(one)).toBe('Dinner stays on the other days.')
    expect(removeLead(some)).toBe('Dinner stays on the other days.')
    expect(removeLead(all)).toBeUndefined()
  })
  it('the toast headline, its Undo name and the restored line', () => {
    expect(removedHeadline(one, 'en')).toBe('Dinner on Monday removed')
    expect(undoRemoveLabel(one, 'en')).toBe('Undo: put back Dinner on Monday')
    expect(restoredHeadline(one, 'en')).toBe('Dinner on Monday is back')
    expect(removedHeadline(all, 'en')).toBe('Dinner removed')
    expect(undoRemoveLabel(all, 'en')).toBe('Undo: put back Dinner')
    expect(restoredHeadline(all, 'en')).toBe('Dinner is back')
    expect(removedHeadline(some, 'en')).toBe('Dinner on Mon, Tue and Wed removed')
    expect(restoredHeadline(some, 'en')).toBe('Dinner on Mon, Tue and Wed is back')
  })
})

describe('mergeImpacts: one confirm for several days', () => {
  it('lists every day\'s Planned Meals, Slot Rules and To confirm rows and adds the Cooked meals kept', () => {
    const a = impact()
    const b = impact({ plannedMeals: [meal('2026-11-17', { mealSlotId: 11 })], toConfirm: [meal('2026-11-15', { mealSlotId: 11 })], cookedKept: 2 })
    const m = mergeImpacts([a, b])
    expect(m.plannedMeals).toHaveLength(4)
    expect(m.slotRules).toHaveLength(2)
    expect(m.toConfirm).toHaveLength(2)
    expect(m.cookedKept).toBe(6)
  })
  it('the same Slot Rule on several days is named once and counted each time', () => {
    const rows = removeGroups(mergeImpacts([impact(), impact()]), { today: TODAY, locale: 'en' })[0]!.rows
    expect(rows.find((r) => r.key === 'Slot Rules')).toMatchObject({ state: '2', detail: 'Dinner = Pasta al pomodoro stops applying' })
  })
  it('nothing to merge is an empty impact', () => {
    expect(mergeImpacts([])).toEqual({ plannedMeals: [], slotRules: [], toConfirm: [], cookedKept: 0 })
  })
})

describe('removeGroups: Goes, then Stays', () => {
  it('Goes lists Planned Meals, Slot Rule and To confirm as rows with a count state', () => {
    const [goes] = removeGroups(impact(), { today: TODAY, locale: 'en' })
    expect(goes!.label).toBe('Goes')
    expect(goes!.rows).toEqual([
      { key: 'Planned Meals', state: '3', detail: 'From today, Mon 16 to Mon 30' },
      { key: 'Slot Rule', state: '1', detail: 'Dinner = Pasta al pomodoro stops applying' },
      { key: 'To confirm', state: '1', detail: 'Sat Dinner' },
    ])
  })
  it('Planned Meals starting later than today say "From <day>"; one date is just that day', () => {
    const later = removeGroups(impact({ plannedMeals: [meal('2026-11-17'), meal('2026-11-30')] }), { today: TODAY, locale: 'en' })[0]!.rows[0]!
    expect(later.detail).toBe('From Tue 17 to Mon 30')
    const one = removeGroups(impact({ plannedMeals: [meal('2026-11-23')] }), { today: TODAY, locale: 'en' })[0]!.rows[0]!
    expect(one).toMatchObject({ state: '1', detail: 'Mon 23' })
  })
  it('a row with nothing to say is not drawn: no Slot Rule, no To confirm', () => {
    const [goes] = removeGroups(impact({ slotRules: [], toConfirm: [] }), { today: TODAY, locale: 'en' })
    expect(goes!.rows.map((r) => r.key)).toEqual(['Planned Meals'])
  })
  it('several Slot Rules read "Slot Rules" and name each; a Tag rule names its Tag', () => {
    const rules = [
      { id: 1, mealSlotId: 10, mealSlotName: 'Dinner', courseId: 1, courseName: 'Main', recipeId: 5, recipeName: 'Pasta' },
      { id: 2, mealSlotId: 10, mealSlotName: 'Dinner', courseId: 2, courseName: 'Side', tag: 'Quick' },
    ]
    const row = removeGroups(impact({ slotRules: rules }), { today: TODAY, locale: 'en' })[0]!.rows.find((r) => r.key === 'Slot Rules')!
    expect(row).toMatchObject({ state: '2', detail: 'Dinner = Pasta and Dinner = Quick stop applying' })
  })
  it('To confirm names each day and Meal Slot once, even with several Courses', () => {
    const rows = removeGroups(impact({ toConfirm: [meal('2026-11-14'), meal('2026-11-14', { courseId: 2, courseName: 'Side' }), meal('2026-11-15', { mealSlotName: 'Dinner' })] }), { today: TODAY, locale: 'en' })[0]!.rows
    expect(rows.find((r) => r.key === 'To confirm')).toMatchObject({ state: '2', detail: 'Sat Dinner, Sun Dinner' })
  })
  it('Stays says the Cooked history is kept, and that Last cooked and Cool-down do not change', () => {
    const groups = removeGroups(impact(), { today: TODAY, locale: 'en' })
    expect(groups[1]!.label).toBe('Stays')
    expect(groups[1]!.rows).toHaveLength(1)
    expect(groups[1]!.rows[0]).toMatchObject({ key: 'Cooked history', state: 'Kept' })
    expect(groups[1]!.rows[0]!.detail).toMatch(/Last cooked and Cool-down don.t change/)
  })
  it('with nothing planned, Goes is not drawn at all and Stays remains', () => {
    const groups = removeGroups(impact({ plannedMeals: [], slotRules: [], toConfirm: [] }), { today: TODAY, locale: 'en' })
    expect(groups.map((g) => g.label)).toEqual(['Stays'])
  })
})

describe('the restore refusal (409 meal_slot_name_taken, main-session ruling 3)', () => {
  it('a taken name gives the server\'s sentence as the subline and what to do as the body', () => {
    const err = new ApiError(409, 'meal_slot_name_taken', 'There is already a Dinner on Monday.')
    expect(nameTakenRefusal(err)).toEqual({ subline: 'There is already a Dinner on Monday.', body: 'Rename or remove that Meal Slot first.' })
  })
  it('any other failure is not this refusal', () => {
    expect(nameTakenRefusal(new ApiError(404, 'not_found', 'gone'))).toBeNull()
    expect(nameTakenRefusal(new Error('boom'))).toBeNull()
  })
  it('Put back is all or nothing: the refusal names what was not put back', () => {
    expect(putBackRefusedHeadline('Snack')).toBe('Snack was not put back')
  })
})
