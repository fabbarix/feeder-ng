// B9-32 (PC-07, PC-14, DS-06): what the compact Couldn't plan tile reads from a group, and the short cause of an unfilled row. TEST-AUTHOR tests.
import { describe, expect, it } from 'vitest'
import { EXCLUDED, NO_COURSE_RECIPES, NOBODY, WEEK, dinner, empty, planned, sideWeek, unfilled } from '../couldnt-fixtures'
import { courseCells, groupByCause, shortCause, unplannedOf } from './couldntGroups'

const groupsOf = (slots: ReturnType<typeof sideWeek>) => groupByCause(unplannedOf(courseCells(slots)), courseCells(slots))

describe('a cause row: title and meta', () => {
  it('title is the count and the noun: "7 Sides" for seven excluded Sides, the cause is the meta', () => {
    const [g] = groupsOf(sideWeek(WEEK))
    expect(g!.title).toBe('7 Sides')
    expect(g!.meta).toBe('Every Recipe is excluded for someone who eats it.')
  })

  it('"7 Desserts" with "No Recipes are marked as Dessert."', () => {
    const slots = WEEK.map((d) => dinner(d, [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)]))
    const [g] = groupsOf(slots)
    expect(g!.title).toBe('7 Desserts')
    expect(g!.meta).toBe('No Recipes are marked as Dessert.')
  })

  it('one meal reads "1 Dessert"; Meal Slots read "7 Meal Slots" with "Nobody is set to attend."', () => {
    const one = groupsOf([dinner('2026-11-10', [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)])])
    expect(one[0]!.title).toBe('1 Dessert')
    const nine = groupsOf(WEEK.map((d) => dinner(d, [empty(1, 'Main', NOBODY)])))
    expect(nine[0]!.title).toBe('7 Meal Slots')
    expect(nine[0]!.meta).toBe('Nobody is set to attend.')
  })

  it('still one group per cause, never one per meal', () => {
    const slots = [...WEEK.slice(0, 2).map((d) => dinner(d, [planned(1, 'Main'), empty(2, 'Side', EXCLUDED)])), dinner(WEEK[2]!, [planned(1, 'Main'), empty(3, 'Dessert', NO_COURSE_RECIPES)])]
    expect(groupsOf(slots).map((g) => g.title)).toEqual(['1 Dessert', '2 Sides'])
  })
})

describe('shortCause: the one chip of an unfilled Course row', () => {
  it.each([
    ['no_course_recipes', 'Dessert', 'No Dessert Recipes'],
    ['no_course_recipes', null, 'No Recipes for this Course'],
    ['no_recipes', 'Side', 'No Recipes'],
    ['nobody_attending', 'Side', 'Nobody attending'],
    ['slot_rule', 'Side', 'Slot Rule unmet'],
    ['excluded', 'Side', 'Excluded'],
    ['advance_step', 'Side', 'Too late for its Advance Step'],
    ['no_fit', 'Side', 'No Recipe fits'],
  ] as const)('%s (%s) says "%s"', (cause, course, label) => {
    expect(shortCause(cause, course)).toBe(label)
  })

  it('every label is one short phrase: no full stop, at most 30 characters', () => {
    for (const cause of ['no_course_recipes', 'no_recipes', 'nobody_attending', 'slot_rule', 'excluded', 'advance_step', 'no_fit'] as const) {
      const label = shortCause(cause, 'Dessert')
      expect(label).not.toMatch(/\.$/)
      expect(label.length).toBeLessThanOrEqual(30)
    }
  })
})

describe('B9-32 keeps the cause rules (unfilled() fixture sanity)', () => {
  it('a no_candidates reason with exclusions only is excluded', () => {
    expect(groupsOf([dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', unfilled('no_candidates', { considered: 3, exclusion: 3 }))])])[0]!.cause).toBe('excluded')
  })
})

describe('PC-14 / A2: a Course no Recipe can start within the cooking times', () => {
  it('is the too_early cause, a warn rule conflict, with the chip "Outside your cooking times" and Choose a Recipe as the fix', () => {
    const slots = [dinner('2026-11-10', [planned(1, 'Main'), empty(2, 'Side', unfilled('no_candidates', { considered: 3, tooEarly: 3 }))])]
    const [g] = groupsOf(slots)
    expect(g!.cause).toBe('too_early')
    expect(g!.tone).toBe('warn')
    expect(g!.meta).toBe('Every Recipe would start outside your cooking times.')
    expect(g!.fix).toEqual({ kind: 'choose', label: 'Choose a Recipe' })
    expect(shortCause('too_early', 'Side')).toBe('Outside your cooking times')
  })
})
