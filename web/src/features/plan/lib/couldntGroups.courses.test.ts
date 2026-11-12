// CRS G2 (spec 7.4): Couldn't plan per Course. The cause of a Course, the cells, and the groups with their counts, lines and fixes.
import { describe, expect, it } from 'vitest'
import { DINNER, EXCLUDED, NO_COURSE_RECIPES, NOBODY, WEEK, dinner, empty, flat, lone, otherSlot, planned, sideWeek, unfilled } from '../couldnt-fixtures'
import { planStrings } from '../strings'
import { planCourse } from '../test-utils'
import type { PlanEntry, PlanSlot, Unfilled } from '../types'
import { causeOf, courseCells, groupByCause, shortReason, toneOf, toneStyle, unplannedOf } from './couldntGroups'

// C3: a slot with no `courses` at all (nothing to make a cell from).
const bare = (date: string, reason: Unfilled | null) => ({ ...lone(date, reason), courses: undefined }) as unknown as PlanSlot

describe('causeOf: the new cause, and the two that are gone', () => {
  it('reason no_course_recipes is its own cause, with or without Recipes counted', () => {
    expect(causeOf({ unfilled: NO_COURSE_RECIPES })).toBe('no_course_recipes')
    expect(causeOf({ unfilled: unfilled('no_course_recipes', { considered: 3 }) })).toBe('no_course_recipes')
  })

  it('reads the reason of any Course, not only of a slot', () => {
    expect(causeOf(planCourse({ unfilled: EXCLUDED }))).toBe('excluded')
  })

  it('Cool-down and Variety counts of an old stored reason are ignored (ADR 0009)', () => {
    expect(causeOf({ unfilled: unfilled('no_candidates', { considered: 4, coolDown: 4 }) })).toBe('no_fit')
    expect(causeOf({ unfilled: unfilled('no_candidates', { considered: 4, varietyRule: 4 }) })).toBe('no_fit')
    expect(causeOf({ unfilled: unfilled('no_candidates', { considered: 5, coolDown: 4, exclusion: 1 }) })).toBe('excluded')
    expect(causeOf({ unfilled: unfilled('no_candidates', { considered: 5, varietyRule: 3, advanceStep: 1 }) })).toBe('advance_step')
  })

  it('no_attendance still wins over everything', () => expect(causeOf({ unfilled: NOBODY })).toBe('nobody_attending'))
})

describe('the causes that are gone have no copy left', () => {
  const keys = ['advance_step', 'excluded', 'no_course_recipes', 'no_fit', 'no_recipes', 'nobody_attending', 'slot_rule']
  it.each(['couldntCauseText', 'couldntHint', 'couldntShort', 'couldntFix'] as const)('%s has exactly the seven causes', (name) => {
    expect(Object.keys(planStrings[name]).sort()).toEqual(keys)
  })
  it('no Cool-down or Variety Rule sentence is left for the single-line reason either', () => {
    expect(Object.keys(planStrings)).not.toContain('couldntInCoolDown')
    expect(Object.keys(planStrings)).not.toContain('couldntVarietyRule')
  })
})

describe('no_course_recipes: tone, icon, short reason', () => {
  it('is info, with the Recipes icon, and a one-liner for the Course row', () => {
    expect(toneOf('no_course_recipes')).toBe('info')
    expect(toneStyle(toneOf('no_course_recipes')).chip).toEqual({ kind: 'status', status: 'info' })
    expect(shortReason('no_course_recipes')).toBe('No Recipes for this Course.')
  })
})

describe('courseCells: one flat cell per Course that holds a Planned Meal or a reason', () => {
  const slotA = dinner('2026-11-10', [
    planned(1, 'Main'),
    empty(2, 'Side', EXCLUDED),
    planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional' }),
  ])

  it('gives the planned Main and the unfilled Side, with the slot fields and the Course on each', () => {
    const cells = courseCells([slotA])
    expect(cells).toHaveLength(2)
    expect(cells[0]).toMatchObject({ date: '2026-11-10', mealSlotId: DINNER, name: 'Dinner', courseId: 1, courseName: 'Main', unfilled: null })
    expect(cells[0]!.meal).not.toBeNull()
    expect(cells[1]).toMatchObject({ date: '2026-11-10', mealSlotId: DINNER, name: 'Dinner', courseId: 2, courseName: 'Side', meal: null, unfilled: EXCLUDED })
  })

  it('a covered Course and a not-served Course (an optional one left empty, or nobody eats it) give no cell', () => {
    const covered = dinner('2026-11-10', [
      planned(1, 'Main'),
      planCourse({ courseId: 2, name: 'Side', main: false, coveredBy: { courseId: 1, recipeId: 7, recipeName: 'Lasagne' } }),
      planCourse({ courseId: 3, name: 'Dessert', main: false, unserved: 'no_course_attendance' }),
    ])
    expect(courseCells([covered]).map((c) => c.courseName)).toEqual(['Main'])
  })

  it('keeps plan order: slots as given, the slot\'s Courses in its order', () => {
    const next = dinner('2026-11-11', [empty(1, 'Main', NOBODY), empty(2, 'Side', NOBODY)])
    expect(courseCells([slotA, next]).map((c) => `${c.date}/${c.courseName}`)).toEqual(['2026-11-10/Main', '2026-11-10/Side', '2026-11-11/Main', '2026-11-11/Side'])
  })

  it('a flat entry (it has a courseId) is a cell already and is kept as it is; so are cells given again', () => {
    const entry = flat('2026-11-10', 2, 'Side', EXCLUDED)
    expect(courseCells([entry])).toEqual([entry])
    const once = courseCells([slotA])
    expect(courseCells(once)).toEqual(once)
  })

  // C3: every slot and every flat entry the server sends names its Course; a "slot without Courses" is not a cell.
  it('a slot without courses and without a courseId is not a cell (there is no course-less cell)', () => {
    expect(courseCells([bare('2026-11-10', EXCLUDED)])).toEqual([])
  })

  it('a slot whose time has gone (no meal, no reason, no Course holding either) gives nothing', () => {
    expect(courseCells([lone('2026-11-10', null)])).toEqual([])
    expect(courseCells([dinner('2026-11-10', [planCourse()])])).toEqual([])
  })
})

describe('unplannedOf: the Courses the planner left empty with a reason', () => {
  it('keeps only the Side that has a reason, as a cell with its Course', () => {
    const cells = unplannedOf(courseCells(sideWeek(['2026-11-12'])))
    expect(cells).toHaveLength(1)
    expect(cells[0]).toMatchObject({ date: '2026-11-12', courseId: 2, courseName: 'Side', meal: null, unfilled: EXCLUDED })
  })

  it('a slot with no Course left empty gives nothing; an optional Course left empty (no reason) is not unplanned', () => {
    const dessert = planCourse({ courseId: 3, name: 'Dessert', main: false, optional: true, unserved: 'optional' })
    expect(unplannedOf(courseCells([dinner('2026-11-10', [planned(1, 'Main'), dessert])]))).toEqual([])
  })

  it('still works on flat API entries; an entry with no Course is dropped', () => {
    const a = flat('2026-11-10', 2, 'Side', NO_COURSE_RECIPES)
    const b = bare('2026-11-11', NOBODY)
    expect(unplannedOf(courseCells([a, b]))).toEqual([a])
  })

  it('the id of a line is built from the real Course id', () => {
    const slots = sideWeek(['2026-11-12'])
    const [g] = groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))
    expect(g!.items[0]!.id).toBe('cell-2026-11-12-4-2')
  })
})

describe('groupByCause: counts, names and lines', () => {
  it('every Side excluded: "Couldn\'t plan 7 Sides." with one line per Side, each naming the Course', () => {
    const slots = sideWeek(WEEK)
    const [g, ...rest] = groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))
    expect(rest).toEqual([])
    expect(g!.cause).toBe('excluded')
    expect(g!.count).toBe(7)
    expect(g!.headline).toBe("Couldn't plan 7 Sides. Every Recipe is excluded for someone who eats it.")
    expect(g!.items).toHaveLength(7)
    expect(g!.items[0]).toMatchObject({ text: 'Tue 10 Nov · Dinner · Side', id: 'cell-2026-11-10-4-2' })
    expect(g!.items[6]!.text).toBe('Mon 16 Nov · Dinner · Side')
  })

  it('one Course is singular', () => {
    const slots = sideWeek(['2026-11-12'])
    expect(groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))[0]!.headline).toBe("Couldn't plan 1 Side. Every Recipe is excluded for someone who eats it.")
  })

  it('the Course name is pluralised on its last word', () => {
    const slots = [dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side dish', EXCLUDED)]), dinner('2026-11-11', [planned(1, 'Main'), empty(2, 'Side dish', EXCLUDED)])]
    expect(groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))[0]!.headline).toBe("Couldn't plan 2 Side dishes. Every Recipe is excluded for someone who eats it.")
  })

  it('a slot whose every Course has the cause is named once, without Courses, and counts both Courses', () => {
    const slots = [dinner('2026-11-13', [empty(1, 'Main', EXCLUDED), empty(2, 'Side', EXCLUDED)])]
    const [g] = groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))
    expect(g!.count).toBe(2)
    expect(g!.headline).toBe("Couldn't plan 2 Courses. Every Recipe is excluded for someone who eats it.")
    expect(g!.items).toHaveLength(1)
    expect(g!.items[0]).toMatchObject({ text: 'Fri 13 Nov · Dinner', id: 'cell-2026-11-13-4-1' })
  })

  it('different Courses in one cause are "Courses", each line names its Course', () => {
    const slots = [dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', EXCLUDED)]), dinner('2026-11-11', [planned(1, 'Main'), planned(2, 'Side'), empty(3, 'Dessert', EXCLUDED)])]
    const [g] = groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))
    expect(g!.headline).toBe("Couldn't plan 2 Courses. Every Recipe is excluded for someone who eats it.")
    expect(g!.items.map((i) => i.text)).toEqual(['Tue 10 Nov · Dinner · Side', 'Wed 11 Nov · Dinner · Dessert'])
  })

  it('Nobody attends counts Meal Slots, once per slot, however many Courses the slot has', () => {
    const slots = WEEK.slice(0, 3).map((d) => dinner(d, [empty(1, 'Main', NOBODY), empty(2, 'Side', NOBODY)]))
    const [g] = groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))
    expect(g!.cause).toBe('nobody_attending')
    expect(g!.count).toBe(3)
    expect(g!.headline).toBe("Couldn't plan 3 Meal Slots. Nobody is set to attend.")
    expect(g!.items.map((i) => i.text)).toEqual(['Tue 10 Nov · Dinner', 'Wed 11 Nov · Dinner', 'Thu 12 Nov · Dinner'])
    expect(g!.fix).toEqual({ kind: 'link', label: 'Choose who attends', to: '/settings/meal-slots#meal-slot-4' })
    expect(g!.adminOnly).toBe(true)
  })

  it('the flat entries Today gets, with the plan view as `all`, read the same as the plan view', () => {
    const slots = sideWeek(['2026-11-10', '2026-11-11'])
    const entries = [flat('2026-11-10', 2, 'Side', EXCLUDED), flat('2026-11-11', 2, 'Side', EXCLUDED)]
    const [g] = groupByCause(entries, courseCells(slots))
    expect(g!.headline).toBe("Couldn't plan 2 Sides. Every Recipe is excluded for someone who eats it.")
    expect(g!.items.map((i) => i.text)).toEqual(['Tue 10 Nov · Dinner · Side', 'Wed 11 Nov · Dinner · Side'])
  })

  it('a Household with one Course per slot is exactly as before: Meal Slots, no Course names', () => {
    const cells = [flat('2026-11-10', 1, 'Main', EXCLUDED), flat('2026-11-11', 1, 'Main', EXCLUDED)]
    const [g] = groupByCause(cells)
    expect(g!.headline).toBe("Couldn't plan 2 Meal Slots. Every Recipe is excluded for someone who eats it.")
    expect(g!.items.map((i) => i.text)).toEqual(['Tue 10 Nov · Dinner', 'Wed 11 Nov · Dinner'])
  })

  it('a slot that serves several Courses but only the Main is empty: "Couldn\'t plan 1 Main."', () => {
    const slots = [dinner('2026-11-10', [empty(1, 'Main', unfilled('no_candidates', { considered: 2, advanceStep: 2 }, true)), planned(2, 'Side')])]
    const [g] = groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))
    expect(g!.headline).toBe("Couldn't plan 1 Main. Nothing that matches its Slot Rule is available.")
    expect(g!.items[0]!.text).toBe('Tue 10 Nov · Dinner · Main')
  })

  it('causes order: setup gaps first, then the new cause, then rule conflicts', () => {
    const slots = [
      dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', EXCLUDED)]),
      dinner('2026-11-11', [planned(1, 'Main'), empty(2, 'Side', NO_COURSE_RECIPES)]),
      otherSlot('2026-11-11', 'Lunch', 5, [empty(1, 'Main', NOBODY)]),
      dinner('2026-11-12', [planned(1, 'Main'), empty(2, 'Side', unfilled('no_candidates', { considered: 3, advanceStep: 3 }))]),
      dinner('2026-11-13', [planned(1, 'Main'), empty(2, 'Side', unfilled('no_candidates', { considered: 3 }))]),
    ]
    expect(groupByCause(unplannedOf(courseCells(slots)), courseCells(slots)).map((g) => g.cause)).toEqual(['nobody_attending', 'no_course_recipes', 'excluded', 'advance_step', 'no_fit'])
  })

  it('a stored Cool-down count is no cause: the cell is filed as No fit, with Choose a Recipe', () => {
    const [g] = groupByCause([lone('2026-11-10', unfilled('no_candidates', { considered: 3, coolDown: 3 })) as PlanEntry]) // a course-less slot, filed as it stands
    expect(g!.cause).toBe('no_fit')
    expect(g!.fix.label).toBe('Choose a Recipe')
  })
})

describe('the Excluded cause links to the Review Exclusions page', () => {
  const slots = sideWeek(['2026-11-13', '2026-11-14'])
  const [g] = groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))

  it('its fix is a link to /plan/couldnt-plan/excluded, open to every User', () => {
    expect(g!.fix).toEqual({ kind: 'link', label: 'Review Exclusions', to: '/plan/couldnt-plan/excluded' })
    expect(g!.adminOnly).toBe(false)
  })

  it('each "Show all" line links to its cell on the page', () => {
    expect(g!.items.map((i) => i.to)).toEqual(['/plan/couldnt-plan/excluded#cell-2026-11-13-4-2', '/plan/couldnt-plan/excluded#cell-2026-11-14-4-2'])
  })

  it('other causes have no line links', () => {
    const [n] = groupByCause([lone('2026-11-10', NOBODY) as PlanEntry, lone('2026-11-11', NOBODY) as PlanEntry])
    expect(n!.items.every((i) => i.to === undefined)).toBe(true)
  })
})

describe('No Recipes for this Course', () => {
  const dessertWeek = WEEK.slice(0, 5).map((d) => dinner(d, [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)]))
  const [g] = groupByCause(unplannedOf(courseCells(dessertWeek)), courseCells(dessertWeek))

  it('names the Course in the headline', () => {
    expect(g!.cause).toBe('no_course_recipes')
    expect(g!.count).toBe(5)
    expect(g!.headline).toBe("Couldn't plan 5 Desserts. No Recipes are marked as Dessert.")
  })

  it('is info, with the Recipes icon, and no Admin is needed', () => {
    expect(g!.tone).toBe('info')
    expect(g!.icon).toBe('recipes')
    expect(g!.adminOnly).toBe(false)
  })

  it('the fix is "Mark Recipes as Dessert": the Recipes list filtered to Recipes not marked with it', () => {
    expect(g!.fix).toEqual({ kind: 'link', label: 'Mark Recipes as Dessert', to: '/recipes?notCourse=3' })
  })

  it('explains itself once, in one sentence', () => {
    expect(g!.hint).toBe('The planner fills each Course from the Recipes marked with it. Mark some Recipes with the Course, or choose a Recipe yourself.')
  })

  it('several Courses: a general sentence, and the fix is for the Course of the earliest cell', () => {
    const slots = [
      dinner('2026-11-11', [planned(1, 'Main'), planned(2, 'Side'), empty(3, 'Dessert', NO_COURSE_RECIPES)]),
      dinner('2026-11-12', [planned(1, 'Main'), empty(2, 'Side', NO_COURSE_RECIPES)]),
    ]
    const [m] = groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))
    expect(m!.headline).toBe("Couldn't plan 2 Courses. Some Courses have no Recipes marked for them.")
    expect(m!.fix).toEqual({ kind: 'link', label: 'Mark Recipes as Dessert', to: '/recipes?notCourse=3' })
  })

  it('cells of several Courses fall back to the general sentence and the Recipes list (every cell names its Course)', () => {
    const [o] = groupByCause([flat('2026-11-10', 2, 'Side', NO_COURSE_RECIPES), flat('2026-11-10', 3, 'Dessert', NO_COURSE_RECIPES)])
    expect(o!.headline).toBe("Couldn't plan 2 Courses. Some Courses have no Recipes marked for them.")
    expect(o!.fix).toEqual({ kind: 'link', label: 'Mark Recipes as Side', to: '/recipes?notCourse=2' })
  })

  it('a Household with one Course per slot: Meal Slots, with the Course named in the sentence', () => {
    const [o] = groupByCause([flat('2026-11-10', 1, 'Main', NO_COURSE_RECIPES), flat('2026-11-11', 1, 'Main', NO_COURSE_RECIPES)])
    expect(o!.headline).toBe("Couldn't plan 2 Meal Slots. No Recipes are marked as Main.")
  })
})
