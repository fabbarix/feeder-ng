// CRS E2: the pure rules of a Recipe's Courses and Whole meal (docs/dev/design/crs-e2.md 2).
import { describe, expect, it } from 'vitest'
import { courseChoices } from '../fixtures.test-helper'
import type { RecipeSlotRule, SlotName } from '../types'
import { emptyDraft, type RecipeDraft } from './draft'
import { courseNamesOf, defaultWholeMeal, joinNames, lostSlotRules, pickCourseIds, reconcileWholeMeal, showsWholeMeal, validateCourses, withDefaultCourse } from './recipeCourses'

const MAIN = 1
const SIDE = 2
const draft = (over: Partial<RecipeDraft> = {}): RecipeDraft => ({ ...emptyDraft(), name: 'Rice', courseIds: [MAIN], ...over })

describe('showsWholeMeal', () => {
  it('is true only when the ids include the active main Course', () => {
    expect(showsWholeMeal([MAIN], courseChoices)).toBe(true)
    expect(showsWholeMeal([SIDE, MAIN], courseChoices)).toBe(true)
    expect(showsWholeMeal([SIDE], courseChoices)).toBe(false)
    expect(showsWholeMeal([], courseChoices)).toBe(false)
  })
  it('finds the main Course by its flag, not by its name or position', () => {
    const moved = [
      { id: 1, name: 'Main', main: false },
      { id: 2, name: 'Side', main: true },
    ]
    expect(showsWholeMeal([1], moved)).toBe(false)
    expect(showsWholeMeal([2], moved)).toBe(true)
  })
  it('is false while no Course is known', () => {
    expect(showsWholeMeal([MAIN], [])).toBe(false)
  })
})

describe('defaultWholeMeal', () => {
  it('is true for a Ready Meal whose Courses include the main Course, false otherwise', () => {
    expect(defaultWholeMeal(true, [MAIN], courseChoices)).toBe(true)
    expect(defaultWholeMeal(true, [SIDE, MAIN], courseChoices)).toBe(true)
    expect(defaultWholeMeal(true, [SIDE], courseChoices)).toBe(false)
    expect(defaultWholeMeal(false, [MAIN], courseChoices)).toBe(false)
  })
})

describe('reconcileWholeMeal', () => {
  it('ticking Ready Meal switches Whole meal on when the Courses include the main Course', () => {
    const next = reconcileWholeMeal(draft(), draft({ readyMeal: true }), courseChoices)
    expect(next.wholeMeal).toBe(true)
    expect(next.wholeMealSet).toBe(false)
  })
  it('leaves Whole meal alone when the Courses do not include the main Course', () => {
    const next = reconcileWholeMeal(draft({ courseIds: [SIDE] }), draft({ courseIds: [SIDE], readyMeal: true }), courseChoices)
    expect(next.wholeMeal).toBe(false)
  })
  it('leaves it alone when the User already set Whole meal in this edit', () => {
    const prev = draft({ wholeMealSet: true, wholeMeal: false })
    expect(reconcileWholeMeal(prev, { ...prev, readyMeal: true }, courseChoices).wholeMeal).toBe(false)
  })
  it('unticking Ready Meal leaves Whole meal as it is', () => {
    const prev = draft({ readyMeal: true, wholeMeal: true })
    expect(reconcileWholeMeal(prev, { ...prev, readyMeal: false }, courseChoices).wholeMeal).toBe(true)
  })
  it('a change of Courses never touches Whole meal (a hidden switch keeps the stored value)', () => {
    const prev = draft({ readyMeal: true, wholeMeal: true })
    expect(reconcileWholeMeal(prev, { ...prev, courseIds: [SIDE] }, courseChoices).wholeMeal).toBe(true)
    const stored = draft({ readyMeal: true, wholeMeal: false, courseIds: [SIDE] })
    expect(reconcileWholeMeal(stored, { ...stored, courseIds: [SIDE, MAIN] }, courseChoices).wholeMeal).toBe(false)
  })
  it('a Whole meal change the step did not make is the User\'s: wholeMealSet becomes true', () => {
    const next = reconcileWholeMeal(draft(), draft({ wholeMeal: true }), courseChoices)
    expect(next).toMatchObject({ wholeMeal: true, wholeMealSet: true })
    const off = reconcileWholeMeal(draft({ wholeMeal: true }), draft({ wholeMeal: false }), courseChoices)
    expect(off).toMatchObject({ wholeMeal: false, wholeMealSet: true })
  })
  it('after the User switched it off, ticking Ready Meal does not switch it back on', () => {
    const off = reconcileWholeMeal(draft({ wholeMeal: true }), draft({ wholeMeal: false }), courseChoices)
    expect(reconcileWholeMeal(off, { ...off, readyMeal: true }, courseChoices).wholeMeal).toBe(false)
  })
  it('an unrelated change gives an equal draft and mutates nothing', () => {
    const prev = draft()
    const next = { ...prev, name: 'Rice and peas' }
    const copy = structuredClone(next)
    expect(reconcileWholeMeal(prev, next, courseChoices)).toEqual(copy)
    expect(next).toEqual(copy)
  })
})

describe('withDefaultCourse', () => {
  it('an empty choice becomes the main Course', () => {
    expect(withDefaultCourse(draft({ courseIds: [] }), courseChoices).courseIds).toEqual([MAIN])
  })
  it('a choice is kept, and so is an empty one when no main Course is known', () => {
    expect(withDefaultCourse(draft({ courseIds: [SIDE] }), courseChoices).courseIds).toEqual([SIDE])
    expect(withDefaultCourse(draft({ courseIds: [] }), []).courseIds).toEqual([])
  })
})

describe('validateCourses', () => {
  it('asks for at least one Course', () => {
    expect(validateCourses(draft({ courseIds: [] }))).toEqual({ courses: 'courses_empty' })
    expect(validateCourses(draft({ courseIds: [SIDE] }))).toEqual({})
  })
})

describe('courseNamesOf and joinNames', () => {
  it('names the ids in household order and leaves out unknown ids', () => {
    expect(courseNamesOf([4, 1, 99], courseChoices)).toEqual(['Main', 'Dessert'])
    expect(courseNamesOf([], courseChoices)).toEqual([])
  })
  it('joins names with commas and "and"', () => {
    expect(joinNames([])).toBe('')
    expect(joinNames(['Side'])).toBe('Side')
    expect(joinNames(['Side', 'Dessert'])).toBe('Side and Dessert')
    expect(joinNames(['Side', 'Starter', 'Dessert'])).toBe('Side, Starter and Dessert')
  })
})

describe('lostSlotRules', () => {
  const slots: SlotName[] = [{ id: 5, weekday: 5, name: 'Dinner' }, { id: 6, weekday: 7, name: 'Lunch' }]
  const rule = (over: Partial<RecipeSlotRule>): RecipeSlotRule => ({ id: 10, mealSlotId: 5, courseId: SIDE, recipeId: 3, recipeName: 'rice', ...over })
  const input = (over = {}) => ({
    recipeId: 3 as number | undefined,
    storedIds: [MAIN, SIDE],
    draftIds: [MAIN],
    rules: [rule({})],
    slots,
    courses: courseChoices,
    ...over,
  })

  it('names the Slot Rules by this Recipe on a Course the draft takes off', () => {
    expect(lostSlotRules(input())).toEqual({ courseNames: ['Side'], rules: [{ id: 10, label: 'Friday Dinner · Side = rice' }] })
  })
  it('keeps the order the API gave and names several Courses in household order', () => {
    const rules = [rule({ id: 12, mealSlotId: 6, courseId: 4, recipeName: 'rice' }), rule({ id: 10 })]
    const out = lostSlotRules(input({ storedIds: [MAIN, SIDE, 4], draftIds: [MAIN], rules }))
    expect(out?.courseNames).toEqual(['Side', 'Dessert'])
    expect(out?.rules.map((r) => r.label)).toEqual(['Sunday Lunch · Dessert = rice', 'Friday Dinner · Side = rice'])
  })
  it('only counts a Course that is taken off with a rule, so a taken-off Course without rules is not named', () => {
    const out = lostSlotRules(input({ storedIds: [MAIN, SIDE, 4], draftIds: [MAIN] }))
    expect(out?.courseNames).toEqual(['Side'])
  })
  it('ignores rules of other Recipes, rules by Tag and rules on a Course the Recipe keeps', () => {
    const rules = [
      rule({ id: 11, recipeId: 9, recipeName: 'pasta' }),
      { id: 12, mealSlotId: 5, courseId: SIDE, tag: 'fish' },
      rule({ id: 13, courseId: MAIN }),
    ]
    expect(lostSlotRules(input({ rules }))).toBeNull()
  })
  it('is null when nothing is taken off, for a new Recipe and when no rule is lost', () => {
    expect(lostSlotRules(input({ draftIds: [MAIN, SIDE] }))).toBeNull()
    expect(lostSlotRules(input({ draftIds: [MAIN, SIDE, 3] }))).toBeNull()
    expect(lostSlotRules(input({ recipeId: undefined, storedIds: [] }))).toBeNull()
    expect(lostSlotRules(input({ rules: [] }))).toBeNull()
  })
  it('ignores a rule on a Course the household no longer lists (archiving took it already)', () => {
    expect(lostSlotRules(input({ storedIds: [MAIN, 99], draftIds: [MAIN], rules: [rule({ courseId: 99 })] }))).toBeNull()
  })
})

describe('pickCourseIds', () => {
  const DESSERT = 4
  it('toggles the one id the picker changed against the current ids, not the ones shown', () => {
    // shown [MAIN]; the User adds SIDE; meanwhile the draft became [MAIN, DESSERT]
    expect(pickCourseIds([MAIN, DESSERT], [MAIN], [MAIN, SIDE], courseChoices)).toEqual([MAIN, SIDE, DESSERT])
    // shown [MAIN, SIDE]; the User removes SIDE; the draft has since gained DESSERT, which stays
    expect(pickCourseIds([MAIN, SIDE, DESSERT], [MAIN, SIDE], [MAIN], courseChoices)).toEqual([MAIN, DESSERT])
    // shown [MAIN]; the User removes MAIN; current also has DESSERT, which stays
    expect(pickCourseIds([MAIN, DESSERT], [MAIN, DESSERT], [DESSERT], courseChoices)).toEqual([DESSERT])
  })
  it('an added id takes its household place, not the end', () => {
    expect(pickCourseIds([DESSERT], [DESSERT], [DESSERT, MAIN], courseChoices)).toEqual([MAIN, DESSERT])
    expect(pickCourseIds([MAIN, DESSERT], [MAIN, DESSERT], [MAIN, DESSERT, SIDE], courseChoices)).toEqual([MAIN, SIDE, DESSERT])
  })
  it('no change returns a copy of the current ids', () => {
    const current = [MAIN, SIDE]
    const out = pickCourseIds(current, [MAIN], [MAIN], courseChoices)
    expect(out).toEqual([MAIN, SIDE])
    expect(out).not.toBe(current)
  })
})
