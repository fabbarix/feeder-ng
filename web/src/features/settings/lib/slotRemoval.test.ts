// SAFE-02 (Remove Meal Slot, decision SAFE 4 + 7): the confirm lists what goes and what stays as rows (R-E), then an Undo toast.
import { describe, expect, it } from 'vitest'
import { ApiError } from '../../../lib/http'
import { nameTakenRefusal, otherDaysOf, putBackRefusedHeadline, removeGroups, removeLead, removedHeadline, removeTitle, restoredHeadline, undoRemoveLabel, type ImpactMeal, type MealSlotImpact } from './slotRemoval'

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
const monday = { name: 'Dinner', weekday: 1 }
const TODAY = '2026-11-16' // Monday

describe('the words', () => {
  it('the title names the Meal Slot and its weekday', () => {
    expect(removeTitle(monday, 'en')).toBe('Remove Dinner on Monday?')
  })
  it('the lead says the name stays on the other days; with no other day it has no lead', () => {
    expect(removeLead('Dinner', 6)).toBe('Dinner stays on the other days.')
    expect(removeLead('Dinner', 0)).toBeUndefined()
  })
  it('the toast headline, its Undo name and the restored line', () => {
    expect(removedHeadline(monday, 'en')).toBe('Dinner on Monday removed')
    expect(undoRemoveLabel(monday, 'en')).toBe('Undo: put back Dinner on Monday')
    expect(restoredHeadline(monday, 'en')).toBe('Dinner on Monday is back')
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
  it('Put back names what did not come back, and says so when some days did', () => {
    expect(putBackRefusedHeadline('Snack', 0)).toBe('Snack was not put back')
    expect(putBackRefusedHeadline('Snack', 1)).toBe('Snack was put back on some days only')
  })
  it('counts the other weekdays of the same name, case and edge spaces ignored', () => {
    const slots = [{ id: 1, name: 'Dinner' }, { id: 2, name: ' dinner ' }, { id: 3, name: 'Lunch' }]
    expect(otherDaysOf(slots[0]!, slots)).toBe(1)
    expect(otherDaysOf(slots[2]!, slots)).toBe(0)
  })
})
