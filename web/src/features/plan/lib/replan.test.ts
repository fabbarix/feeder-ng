// B9-26 (PC-01, docs/design/ui-review-3/plancook.md): the words of "What changed". 2026-11-17 is a Tuesday.
import { describe, expect, it } from 'vitest'
import { courseMeal, courseSlot, planCourse } from '../test-utils'
import type { PlanSlot } from '../types'
import { changedMarks, markKey, mealLabel, otherUserToast, replanToast, reviewModel, type PlanChange } from './replan'

const cell = (recipeName: string, recipeId = 1, servedFromLeftover = false) => ({ recipeId, recipeName, servedFromLeftover })
const change = (over: Partial<PlanChange> & Pick<PlanChange, 'date' | 'mealSlotId'>): PlanChange => ({
  courseId: 1, before: cell('Lentil soup'), after: cell('Chicken curry', 2), why: [], ...over,
})

const slotOf = (date: string, mealSlotId: number, name: string, time: string, courses = [planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date, mealSlotId }) })]): PlanSlot =>
  courseSlot(courses, { date, mealSlotId, name, time })
const two = (date: string, mealSlotId: number) => [
  planCourse({ courseId: 1, name: 'Main', main: true, meal: courseMeal(1, 'Main', { date, mealSlotId }) }),
  planCourse({ courseId: 2, name: 'Side', main: false, meal: courseMeal(2, 'Side', { date, mealSlotId }) }),
]
const slots: PlanSlot[] = [
  slotOf('2026-11-17', 1, 'Breakfast', '08:00'),
  slotOf('2026-11-17', 2, 'Lunch', '12:30'),
  slotOf('2026-11-17', 3, 'Dinner', '19:00', two('2026-11-17', 3)),
  slotOf('2026-11-18', 3, 'Dinner', '19:00', two('2026-11-18', 3)),
  slotOf('2026-11-19', 2, 'Lunch', '12:30'),
]
const target = { date: '2026-11-17', mealSlotId: 1, courseId: 1 }
const tueLunch = change({ date: '2026-11-17', mealSlotId: 2 })
const wedDinner = change({ date: '2026-11-18', mealSlotId: 3, before: cell('Chicken curry', 2), after: cell('Lentil soup', 1) })
const thuLunch = change({ date: '2026-11-19', mealSlotId: 2, before: cell('Stew', 3), after: cell('Pizza', 4) })

describe('mealLabel', () => {
  it('is the short weekday and the Meal Slot', () => {
    expect(mealLabel(slots, target)).toBe('Tue Breakfast')
  })
  it('names a Course that is not the Main one ("Tue Dinner, Side"); the Main Course is the slot itself', () => {
    expect(mealLabel(slots, { date: '2026-11-17', mealSlotId: 3, courseId: 2 })).toBe('Tue Dinner, Side')
    expect(mealLabel(slots, { date: '2026-11-17', mealSlotId: 3, courseId: 1 })).toBe('Tue Dinner')
  })
  it('falls back to the weekday for a slot the plan does not hold, and never throws', () => {
    expect(mealLabel(slots, { date: '2026-11-17', mealSlotId: 99, courseId: 1 })).toBe('Tue')
  })
})

describe('replanToast: a Swap', () => {
  it('with no other change is one line, "Swapped", with Undo and no Review', () => {
    const t = replanToast({ kind: 'swap', target, changes: [], slots })!
    expect(t.headline).toBe('Swapped')
    expect(t.subline).toBeUndefined()
    expect(t.body).toBeUndefined()
    expect(t.review).toBe(false)
    expect(t.undoAriaLabel).toBe('Undo the Swap')
  })

  it('with two other changes: the headline names the meal, the subline counts, the body lists, Review and Undo are named for what they do', () => {
    const t = replanToast({ kind: 'swap', target, changes: [tueLunch, wedDinner], slots })!
    expect(t.headline).toBe('Swapped Tue Breakfast')
    expect(t.subline).toBe('2 other meals changed')
    expect(t.body).toBe('Tue Lunch is now Chicken curry. Wed Dinner is now Lentil soup.')
    expect(t.review).toBe(true)
    expect(t.reviewAriaLabel).toBe('Review 2 changed meals')
    expect(t.undoAriaLabel).toBe('Undo the Swap and 2 other changes')
  })

  it('one other change is singular everywhere', () => {
    const t = replanToast({ kind: 'swap', target, changes: [tueLunch], slots })!
    expect(t.subline).toBe('1 other meal changed')
    expect(t.body).toBe('Tue Lunch is now Chicken curry.')
    expect(t.reviewAriaLabel).toBe('Review 1 changed meal')
    expect(t.undoAriaLabel).toBe('Undo the Swap and 1 other change')
  })

  it('lists three meals and says "And N more." for the rest', () => {
    const more = [1, 2, 3, 4].map((n) => change({ date: '2026-11-19', mealSlotId: 2, courseId: 10 + n }))
    const t = replanToast({ kind: 'swap', target, changes: [tueLunch, wedDinner, thuLunch, ...more], slots })!
    expect(t.subline).toBe('7 other meals changed')
    expect(t.body).toBe('Tue Lunch is now Chicken curry. Wed Dinner is now Lentil soup. Thu Lunch is now Pizza. And 4 more.')
  })

  it('names the Course of a Swap of a Course that is not the Main one', () => {
    const t = replanToast({ kind: 'swap', target: { date: '2026-11-17', mealSlotId: 3, courseId: 2 }, changes: [tueLunch], slots })!
    expect(t.headline).toBe('Swapped Tue Dinner, Side')
  })

  it('a cell that is now empty reads "is now empty"; a Leftover reads "from a Leftover"', () => {
    const emptied = change({ date: '2026-11-17', mealSlotId: 2, after: null })
    const left = change({ date: '2026-11-18', mealSlotId: 3, after: cell('Stew', 3, true) })
    expect(replanToast({ kind: 'swap', target, changes: [emptied, left], slots })!.body).toBe('Tue Lunch is now empty. Wed Dinner is now Stew from a Leftover.')
  })
})

describe('replanToast: the other edits', () => {
  it('Choose a Recipe: "Recipe chosen for Tue Breakfast", with the count; none: "Recipe chosen"', () => {
    const t = replanToast({ kind: 'choose', target, changes: [tueLunch, wedDinner, thuLunch], slots })!
    expect(t.headline).toBe('Recipe chosen for Tue Breakfast')
    expect(t.subline).toBe('3 other meals changed')
    expect(replanToast({ kind: 'choose', target, changes: [], slots })!.headline).toBe('Recipe chosen')
  })

  it('Pin and Unpin with changes say what they did; with none they say nothing (as today)', () => {
    expect(replanToast({ kind: 'pin', target, changes: [tueLunch], slots })!.headline).toBe('Pinned Tue Breakfast')
    expect(replanToast({ kind: 'unpin', target, changes: [tueLunch], slots })!.headline).toBe('Unpinned Tue Breakfast')
    expect(replanToast({ kind: 'pin', target, changes: [], slots })).toBeNull()
    expect(replanToast({ kind: 'unpin', target, changes: [], slots })).toBeNull()
  })
})

describe('replanToast: Regenerate (SAFE-07, decision 3: a count and Undo, one line)', () => {
  it('the count is what the server says changed, not the length of the list', () => {
    const t = replanToast({ kind: 'regenerate', target, changes: [tueLunch], changed: 18, slots })!
    expect(t.headline).toBe('Plan regenerated: 18 Planned Meals changed')
    expect(t.subline).toBeUndefined()
    expect(t.body).toBeUndefined()
    expect(t.review).toBe(false)
    expect(t.undoAriaLabel).toBe('Undo Regenerate')
  })
  it('singular and nothing changed', () => {
    expect(replanToast({ kind: 'regenerate', target, changes: [], changed: 1, slots })!.headline).toBe('Plan regenerated: 1 Planned Meal changed')
    expect(replanToast({ kind: 'regenerate', target, changes: [], changed: 0, slots })!.headline).toBe('Plan regenerated: nothing needed to change')
  })
})

describe('otherUserToast: another User changed the plan (the event never carries the Undo token)', () => {
  const anna = { userId: 2, name: 'Anna' }
  it('names them, counts, lists, and offers Review only', () => {
    const t = otherUserToast({ reason: 'pinned', by: anna, target: { date: '2026-11-17', mealSlotId: 3, courseId: 1 }, changes: [tueLunch, wedDinner], slots })!
    expect(t.headline).toBe('Anna changed Tue Dinner')
    expect(t.subline).toBe('2 other meals changed')
    expect(t.body).toBe('Tue Lunch is now Chicken curry. Wed Dinner is now Lentil soup.')
    expect(t.review).toBe(true)
    expect(t.reviewAriaLabel).toBe('Review 2 changed meals')
  })
  it('the reason picks the verb: unpinned, regenerate', () => {
    expect(otherUserToast({ reason: 'unpinned', by: anna, target, changes: [tueLunch], slots })!.headline).toBe('Anna unpinned Tue Breakfast')
    expect(otherUserToast({ reason: 'regenerate', by: anna, changes: [tueLunch], slots })!.headline).toBe('Anna regenerated the plan')
  })
  it('a reason or target it does not know is "Anna changed the plan"', () => {
    expect(otherUserToast({ reason: 'attendance_changed', by: anna, changes: [tueLunch], slots })!.headline).toBe('Anna changed the plan')
  })
  it('says nothing when no other cell changed', () => {
    expect(otherUserToast({ reason: 'pinned', by: anna, target, changes: [], slots })).toBeNull()
  })
})

describe('reviewModel: the sheet "What changed"', () => {
  const model = reviewModel({
    kind: 'swap', target, slots,
    changes: [
      { ...wedDinner, why: [{ code: 'perishable_use', ingredient: 'Lentils', date: '2026-11-19' }] },
      tueLunch,
      change({ date: '2026-11-17', mealSlotId: 3, courseId: 2, before: null, after: cell('Green beans', 5) }),
    ],
  })

  it('has the title, the context line and the lede', () => {
    expect(model.title).toBe('What changed')
    expect(model.context).toBe('After your Swap · 3 other meals')
    expect(model.lede).toBe('Your Swap on Tue Breakfast moved 3 other meals. Meals you Pinned or shopped for did not move.')
  })

  it('groups by day in date order, headed by the short weekday and the day', () => {
    expect(model.days.map((d) => d.heading)).toEqual(['Tue 17', 'Wed 18'])
    expect(model.days.map((d) => d.date)).toEqual(['2026-11-17', '2026-11-18'])
  })

  it('orders a day by the slot time, then the Course', () => {
    expect(model.days[0]!.rows.map((r) => r.key)).toEqual(['Chicken curry', 'Green beans'])
  })

  it('a row: the new Recipe, then the slot, the Course and what it was; the first why chip, phrased', () => {
    const [lunch, dinnerSide] = model.days[0]!.rows
    expect(lunch).toMatchObject({ key: 'Chicken curry', detail: 'Lunch · Main · was Lentil soup', cell: { date: '2026-11-17', mealSlotId: 2, courseId: 1 } })
    expect(lunch!.why).toBeUndefined()
    expect(dinnerSide!.detail).toBe('Dinner · Side · was not planned')
    expect(model.days[1]!.rows[0]).toMatchObject({ key: 'Lentil soup', detail: 'Dinner · Main · was Chicken curry', why: 'uses Lentils by Thu' })
  })

  it('a cell that is now empty is "Nothing planned"', () => {
    const m = reviewModel({ kind: 'swap', target, slots, changes: [change({ date: '2026-11-19', mealSlotId: 2, after: null })] })
    expect(m.days[0]!.rows[0]!.key).toBe('Nothing planned')
    expect(m.context).toBe('After your Swap · 1 other meal')
  })

  it("another User's write: \"After Anna's change\" and a lede that names them", () => {
    const m = reviewModel({ by: { userId: 2, name: 'Anna' }, target: { date: '2026-11-17', mealSlotId: 3, courseId: 1 }, slots, changes: [tueLunch, wedDinner] })
    expect(m.context).toBe("After Anna's change · 2 other meals")
    expect(m.lede).toBe("Anna's change to Tue Dinner moved 2 other meals. Meals that are Pinned or shopped for did not move.")
  })
})

describe('the marks on the changed rows', () => {
  it('markKey is date/slot/course', () => {
    expect(markKey({ date: '2026-11-17', mealSlotId: 2, courseId: 1 })).toBe('2026-11-17/2/1')
  })
  it('changedMarks holds the "was" text of each changed cell', () => {
    const marks = changedMarks([tueLunch, change({ date: '2026-11-19', mealSlotId: 2, before: null })])
    expect(marks).toEqual({ '2026-11-17/2/1': 'was Lentil soup', '2026-11-19/2/1': 'was not planned' })
  })
})
