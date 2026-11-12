// CRS F (spec 7.5, 11): Courses on the kitchen board. A slot is cooked as one block; the tiles list its Courses.
import { describe, expect, it } from 'vitest'
import { boardSlots, hasPlanned, startCookPath, tomorrowLine, tomorrowSlots, tonightMeal, tonightRows } from './tiles'
import type { CourseLike, SlotLike } from '../types'

const meal = (recipeName: string, state: 'planned' | 'cooked' | 'skipped' = 'planned', wholeMeal = false) => ({ recipeId: 1, recipeName, batches: 1, portions: 4, state, wholeMeal })
const course = (courseId: number, name: string, main: boolean, over: Partial<CourseLike> = {}): CourseLike => ({ courseId, name, main, meal: null, ...over })
const slotOf = (courses: CourseLike[] | undefined, over: Partial<SlotLike> = {}): SlotLike => {
  const m = courses?.find((c) => c.main)?.meal ?? null
  return { date: '2026-11-09', mealSlotId: 2, name: 'Dinner', time: '19:00', at: '2026-11-09T19:00:00Z', meal: m, courses, ...over }
}
const roastAndBeans = () => [course(1, 'Main', true, { meal: meal('Roast chicken') }), course(2, 'Side', false, { meal: meal('green beans') })]

describe('boardSlots', () => {
  const planSlots = [slotOf(undefined, { mealSlotId: 7 })]
  it('the payload\'s slots when it has them, else the plan\'s (an older payload)', () => {
    const own = [slotOf(roastAndBeans())]
    expect(boardSlots(own, planSlots)).toBe(own)
    expect(boardSlots(undefined, planSlots)).toBe(planSlots)
  })
})

describe('hasPlanned', () => {
  it('is true when any Course still has a Planned Meal to cook', () => {
    const s = slotOf([course(1, 'Main', true, { meal: meal('Roast', 'cooked') }), course(2, 'Side', false, { meal: meal('beans') })])
    expect(s.meal?.state).toBe('cooked')
    expect(hasPlanned(s)).toBe(true)
  })

  it('is false when every Course is Cooked or Not cooked or empty', () => {
    expect(hasPlanned(slotOf([course(1, 'Main', true, { meal: meal('Roast', 'cooked') }), course(2, 'Side', false, { meal: meal('beans', 'skipped') })]))).toBe(false)
    expect(hasPlanned(slotOf([course(1, 'Main', true)]))).toBe(false)
  })

  // C3: the server sends no `meal` on a slot; only the Course rows count.
  it('without `courses` nothing is planned, whatever an old `meal` field says', () => {
    expect(hasPlanned(slotOf(undefined, { meal: meal('Stew') }))).toBe(false)
    expect(hasPlanned(slotOf([], { meal: meal('Stew') }))).toBe(false)
  })

  it('reads the Course rows of a slot that has no `meal` at all', () => {
    const s = slotOf(roastAndBeans()) as Partial<SlotLike>
    delete s.meal
    expect(hasPlanned(s as SlotLike)).toBe(true)
  })
})

describe('tonight and the Cook button follow the slot, not the main Course alone', () => {
  const cookedMain = () => slotOf([course(1, 'Main', true, { meal: meal('Roast', 'cooked') }), course(2, 'Side', false, { meal: meal('beans') })])

  it('a slot whose main Course is Cooked but whose Side is not is still tonight\'s', () => {
    const s = cookedMain()
    expect(tonightMeal([s], '2026-11-09', '2026-11-09T17:00:00Z')).toBe(s)
  })

  it('and tomorrow\'s tile still lists it', () => {
    const s = { ...cookedMain(), date: '2026-11-10', at: '2026-11-10T19:00:00Z' }
    expect(tomorrowSlots([s], '2026-11-09')).toEqual([s])
  })

  it('the Cook button opens the slot\'s timeline: /cook/meal/<date>/<slot>, no Course', () => {
    expect(startCookPath([slotOf(roastAndBeans())], '2026-11-09', '2026-11-09T17:00:00Z')).toBe('/cook/meal/2026-11-09/2')
    expect(startCookPath([cookedMain()], '2026-11-09', '2026-11-09T17:00:00Z')).toBe('/cook/meal/2026-11-09/2')
  })
})

describe('tonightRows', () => {
  it('lists the Courses with a Planned Meal in the slot\'s order, the main one flagged', () => {
    const rows = tonightRows(slotOf([course(2, 'Side', false, { meal: meal('green beans') }), course(1, 'Main', true, { meal: meal('Roast chicken') })]))
    expect(rows.map((r) => [r.courseName, r.recipeName, r.main])).toEqual([['Side', 'green beans', false], ['Main', 'Roast chicken', true]])
  })

  it('leaves out covered, not-served, empty and Not cooked Courses', () => {
    const rows = tonightRows(slotOf([
      course(1, 'Main', true, { meal: meal('Lasagne', 'planned', true) }),
      course(2, 'Side', false, { coveredBy: { courseId: 1, recipeId: 1, recipeName: 'Lasagne' } }),
      course(3, 'Dessert', false, { unserved: 'optional' }),
      course(4, 'Cheese', false, { meal: meal('Brie', 'skipped') }),
      course(5, 'Soup', false, { unfilled: { reason: 'no_candidates' } }),
    ]))
    expect(rows.map((r) => r.courseName)).toEqual(['Main'])
  })

  it('a slot without `courses` has no rows: there is no made-up main Course with the id 0', () => {
    expect(tonightRows(slotOf(undefined, { meal: meal('Chicken stew') }))).toEqual([])
  })

  it('every row carries the real id of its Course', () => {
    const rows = tonightRows(slotOf(roastAndBeans()))
    expect(rows.map((r) => r.courseId)).toEqual([1, 2])
    expect(rows.every((r) => r.courseId > 0)).toBe(true)
  })
})

describe('tomorrowLine', () => {
  it('one Course reads exactly as before: "Dinner · Chicken stew"', () => {
    expect(tomorrowLine(slotOf([course(1, 'Main', true, { meal: meal('Chicken stew') })]))).toBe('Dinner · Chicken stew')
  })

  it('several Courses: "Dinner: Roast chicken + green beans", in the slot\'s order', () => {
    expect(tomorrowLine(slotOf(roastAndBeans()))).toBe('Dinner: Roast chicken + green beans')
  })

  it('a covered slot is its Whole meal alone; a Course that holds a Planned Meal beside it is added', () => {
    const covered = slotOf([course(1, 'Main', true, { meal: meal('Lasagne', 'planned', true) }), course(2, 'Side', false, { coveredBy: { courseId: 1, recipeId: 1, recipeName: 'Lasagne' } })])
    expect(tomorrowLine(covered)).toBe('Dinner · Lasagne')
    const kept = slotOf([course(1, 'Main', true, { meal: meal('Lasagne', 'planned', true) }), course(2, 'Side', false, { meal: meal('Salad') })])
    expect(tomorrowLine(kept)).toBe('Dinner: Lasagne + Salad')
  })
})
