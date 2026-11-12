import { describe, expect, it } from 'vitest'
import { choices, thursdayDinnerCourses, tuesdayCourses, tuesdayDinnerCourses } from '../components/courseFixtures'
import { anna, members, sam } from '../components/fixtures'
import type { SlotCourseInput, SlotRemoves } from '../types'
import {
  attendeesOf,
  courseRemovals,
  coursesChanged,
  coursesProblem,
  eatersSummary,
  newSlotCourses,
  removalPreview,
  slotCourseInputs,
  withCourseIds,
  withEater,
  withOptional,
} from './slotCourses'

const main: SlotCourseInput = { id: 1, optional: false, optOutMemberIds: [] }
const side: SlotCourseInput = { id: 2, optional: false, optOutMemberIds: [] }
const dessert: SlotCourseInput = { id: 4, optional: true, optOutMemberIds: [3] }

describe('the starting Courses', () => {
  it('a new Meal Slot has the main Course alone, required, nobody opting out', () => {
    expect(newSlotCourses(choices)).toEqual([main])
    expect(newSlotCourses([{ id: 2, name: 'Side', main: false }])).toEqual([])
  })

  it('an existing Meal Slot keeps its Courses in its own order, as copies', () => {
    const inputs = slotCourseInputs(tuesdayDinnerCourses)
    expect(inputs).toEqual([main, side, dessert])
    inputs[2]!.optOutMemberIds.push(9)
    expect(tuesdayCourses[2]!.optOutMemberIds).toEqual([3])
    expect(slotCourseInputs({})).toEqual([])
  })
})

describe('withCourseIds (the picker chose these Courses)', () => {
  const draft = [main, side, dessert]
  it('keeps Optional and opt-outs of a kept Course, including when it moves', () => {
    expect(withCourseIds(draft, [4, 1])).toEqual([dessert, main])
  })
  it('a Course added starts required with nobody opting out, last', () => {
    expect(withCourseIds(draft, [1, 2, 4, 3])).toEqual([main, side, dessert, { id: 3, optional: false, optOutMemberIds: [] }])
  })
  it('a Course taken off and put back starts again from nothing', () => {
    const without = withCourseIds(draft, [1, 2])
    expect(withCourseIds(without, [1, 2, 4])[2]).toEqual({ id: 4, optional: false, optOutMemberIds: [] })
  })
  it('leaves the draft alone', () => {
    withCourseIds(draft, [2])
    expect(draft).toEqual([main, side, dessert])
  })
})

describe('Optional and Who eats it', () => {
  const draft = [main, side, dessert]
  it('withOptional sets the flag of one Course only', () => {
    expect(withOptional(draft, 2, true)).toEqual([main, { ...side, optional: true }, dessert])
    expect(withOptional(draft, 4, false)[2]).toEqual({ ...dessert, optional: false })
  })
  it('withEater adds an opt-out for false and removes it for true, once', () => {
    const off = withEater(draft, 2, 1, false)
    expect(off[1]).toEqual({ ...side, optOutMemberIds: [1] })
    expect(withEater(off, 2, 1, false)[1]!.optOutMemberIds).toEqual([1])
    expect(withEater(off, 2, 1, true)[1]!.optOutMemberIds).toEqual([])
    expect(withEater(draft, 4, 3, true)[2]!.optOutMemberIds).toEqual([])
  })
  it('keeps the opt-outs of a Member who does not attend, and leaves the draft alone', () => {
    const away = [{ ...side, optOutMemberIds: [9] }]
    expect(withEater(away, 2, 1, false)[0]!.optOutMemberIds).toEqual([9, 1])
    expect(draft).toEqual([main, side, dessert])
  })
  it('attendeesOf offers only the attending Members, in the Members\' order', () => {
    expect(attendeesOf(members, [{ memberId: 3, portionFactorOverride: null }, { memberId: 1, portionFactorOverride: 1 }])).toEqual([anna, sam])
    expect(attendeesOf(members, [])).toEqual([])
  })
})

describe('coursesProblem', () => {
  it('needs at least one Course', () => expect(coursesProblem([])).toBe('Choose at least one Course'))
  it('needs a Course that is not optional', () => {
    expect(coursesProblem([{ ...main, optional: true }, dessert])).toBe('Keep at least one Course that is not optional')
  })
  it('allows an optional main Course when another is required', () => {
    expect(coursesProblem([{ ...main, optional: true }, side])).toBeNull()
    expect(coursesProblem([main])).toBeNull()
  })
})

describe('eatersSummary', () => {
  it('is null when everybody eats the Course', () => expect(eatersSummary('Dessert', [])).toBeNull())
  it.each([
    [['Sam'], 'Dessert · without Sam'],
    [['Sam', 'Pia'], 'Dessert · without Sam and Pia'],
    [['Sam', 'Pia', 'Zio Carlo'], 'Dessert · without Sam, Pia and Zio Carlo'],
  ])('%j reads %s', (names, text) => expect(eatersSummary('Dessert', names)).toBe(text))
})

describe('coursesChanged', () => {
  const same = [main, side, dessert]
  it('is false for the same Courses, even with the opt-outs in another order', () => {
    expect(coursesChanged(same, same.map((c) => ({ ...c, optOutMemberIds: [...c.optOutMemberIds].reverse() })))).toBe(false)
    expect(coursesChanged([{ ...side, optOutMemberIds: [1, 2] }], [{ ...side, optOutMemberIds: [2, 1] }])).toBe(false)
  })
  it.each([
    ['another order', [side, main, dessert]],
    ['a Course less', [main, side]],
    ['a Course more', [...same, { id: 3, optional: false, optOutMemberIds: [] }]],
    ['an Optional flag', [main, { ...side, optional: true }, dessert]],
    ['an opt-out', [main, { ...side, optOutMemberIds: [1] }, dessert]],
  ])('is true for %s', (_name, draft) => expect(coursesChanged(same, draft as SlotCourseInput[])).toBe(true))
})

describe('courseRemovals and removalPreview', () => {
  const matched = [tuesdayDinnerCourses, thursdayDinnerCourses]
  const removals = () => courseRemovals(matched, [main])

  it('names each Course a matching slot loses, in first-seen order, with the slots that lose it', () => {
    expect(removals().map((r) => [r.id, r.name, r.slots.map((s) => s.weekday)])).toEqual([[2, 'Side', [2, 4]], [4, 'Dessert', [2]]])
    expect(courseRemovals(matched, [main, side, dessert])).toEqual([])
  })

  const meal = (over: Partial<SlotRemoves['plannedMeals'][number]>) => ({
    date: '2026-11-10', mealSlotId: 10, mealSlotName: 'Dinner', courseId: 2, courseName: 'Side', recipeId: 8, recipeName: 'Green salad', pinned: false, ...over,
  })
  const removes: SlotRemoves = {
    plannedMeals: [
      meal({ date: '2026-11-12', mealSlotId: 11, recipeId: 7, recipeName: 'Roast potatoes', pinned: true }),
      meal({}),
      meal({ date: '2026-11-17' }),
    ],
    slotRules: [{ id: 1, mealSlotId: 10, mealSlotName: 'Dinner', courseId: 2, courseName: 'Side', recipeId: 7, recipeName: 'Roast potatoes' }],
  }

  it('says where each Course goes from and what goes with it, and lists the Pinned meals', () => {
    expect(removalPreview(removals(), removes, 'en')).toEqual({
      lines: ['Removes Side from Tue and Thu: 3 Planned Meals and 1 Slot Rule go', 'Removes Dessert from Tue.'],
      pinned: ['Roast potatoes · Dinner · Thu 12 Nov'],
    })
  })

  it('counts only what belongs to the Course and the slots that lose it', () => {
    const other: SlotRemoves = { plannedMeals: [meal({ courseId: 9, courseName: 'Cheese' }), meal({ mealSlotId: 99 })], slotRules: [] }
    expect(removalPreview(removals(), other, 'en').lines).toEqual(['Removes Side from Tue and Thu.', 'Removes Dessert from Tue.'])
  })

  it('uses "goes" for a single item and joins three days with a comma and "and"', () => {
    const thursdayMeal: SlotRemoves = { plannedMeals: [meal({ mealSlotId: 11 })], slotRules: [] }
    expect(removalPreview([{ id: 2, name: 'Side', slots: [thursdayDinnerCourses] }], thursdayMeal, 'en').lines).toEqual(['Removes Side from Thu: 1 Planned Meal goes'])
    const mon = { ...tuesdayDinnerCourses, id: 20, weekday: 1 }
    const days = removalPreview([{ id: 2, name: 'Side', slots: [mon, tuesdayDinnerCourses, thursdayDinnerCourses] }], { plannedMeals: [], slotRules: [] }, 'en').lines
    expect(days).toEqual(['Removes Side from Mon, Tue and Thu.'])
  })

  it('has no lines and nothing Pinned when nothing is removed', () => {
    expect(removalPreview([], { plannedMeals: [], slotRules: [] }, 'en')).toEqual({ lines: [], pinned: [] })
  })
})

