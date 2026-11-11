import { describe, expect, it } from 'vitest'
import type { Eliminations, PlanSlot, UnfilledReason } from '../types'
import { causeOf, groupByCause, shortReason, slotLine, toneStyle, unplannedOf } from './couldntGroups'

const none: Eliminations = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }

function unfilled(date: string, reason: UnfilledReason, eliminated: Partial<Eliminations> = {}, slotRuleClaimed = false, name = 'Dinner', mealSlotId = 1): PlanSlot {
  return {
    date, mealSlotId, name, time: '19:00', at: `${date}T19:00:00Z`, portions: 2, meal: null, rules: [],
    unfilled: { reason, slotRuleClaimed, eliminated: { ...none, ...eliminated } },
  }
}
const nobody = (date: string, name = 'Dinner', id = 1) => unfilled(date, 'no_attendance', {}, false, name, id)

describe('causeOf: one cause per slot', () => {
  it('nobody attends', () => expect(causeOf(nobody('2026-11-10'))).toBe('nobody_attending'))
  it('no Recipe was considered at all', () => expect(causeOf(unfilled('2026-11-10', 'no_candidates'))).toBe('no_recipes'))
  it('a Slot Rule claimed the slot, whatever was eliminated', () =>
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 3, coolDown: 3 }, true))).toBe('slot_rule'))
  it('the filter that removed the most options wins', () => {
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 5, exclusion: 1, coolDown: 4 }))).toBe('cool_down')
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 3, exclusion: 3 }))).toBe('excluded')
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 3, varietyRule: 2, advanceStep: 1 }))).toBe('variety_rule')
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 2, exclusion: 1, advanceStep: 1 }))).toBe('excluded')
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 2, advanceStep: 2 }))).toBe('advance_step')
  })
  it('ties go Exclusion, Cool-down, Variety Rule, Advance Step', () => {
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 4, coolDown: 2, varietyRule: 2 }))).toBe('cool_down')
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 4, varietyRule: 2, advanceStep: 2 }))).toBe('variety_rule')
  })
  it('Recipes were considered but nothing was counted: no fit', () =>
    expect(causeOf(unfilled('2026-11-10', 'no_candidates', { considered: 2 }))).toBe('no_fit'))
  it('a slot with no recorded reason is no fit, never a crash', () =>
    expect(causeOf({ ...nobody('2026-11-10'), unfilled: null })).toBe('no_fit'))
})

describe('unplannedOf', () => {
  it('keeps the slots with no meal and a recorded reason, in plan order', () => {
    const planned: PlanSlot = { ...nobody('2026-11-11'), meal: { date: '2026-11-11', mealSlotId: 1, recipeId: 1, recipeName: 'Soup', batches: 1, portions: 2, state: 'planned', pinned: false, servedFromLeftover: null, why: [] }, unfilled: null }
    const empty = { ...nobody('2026-11-12'), unfilled: null } // nothing planned, no reason: not "couldn't plan"
    const a = nobody('2026-11-10')
    const b = nobody('2026-11-13')
    expect(unplannedOf([a, planned, empty, b])).toEqual([a, b])
  })
})

describe('groupByCause: one group per cause, never one line per slot', () => {
  const nine = [
    ...['10', '11', '12', '13', '14', '15', '16'].map((d, i) => nobody(`2026-11-${d}`, 'Dinner', 10 + i)),
    nobody('2026-11-14', 'Breakfast', 30),
    nobody('2026-11-15', 'Breakfast', 31),
  ]

  it('nine slots with the same cause become one group of nine', () => {
    const groups = groupByCause(nine)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.cause).toBe('nobody_attending')
    expect(groups[0]!.count).toBe(9)
    expect(groups[0]!.slots).toHaveLength(9)
    expect(groups[0]!.headline).toBe("Couldn't plan 9 Meal Slots. Nobody is set to attend.")
  })

  it('a single slot is singular', () => {
    expect(groupByCause([nobody('2026-11-10')])[0]!.headline).toBe("Couldn't plan 1 Meal Slot. Nobody is set to attend.")
  })

  it('causes are separate groups, setup gaps first, then rule conflicts', () => {
    const coolDown = unfilled('2026-11-12', 'no_candidates', { considered: 3, coolDown: 3 }, false, 'Lunch', 5)
    const rule = unfilled('2026-11-13', 'no_candidates', { considered: 1, coolDown: 1 }, true, 'Dinner', 6)
    const groups = groupByCause([coolDown, rule, nobody('2026-11-10')])
    expect(groups.map((g) => g.cause)).toEqual(['nobody_attending', 'slot_rule', 'cool_down'])
  })

  it('slots inside a group are in date then time order', () => {
    const late = nobody('2026-11-12')
    const early = nobody('2026-11-11')
    expect(groupByCause([late, early])[0]!.slots.map((s) => s.date)).toEqual(['2026-11-11', '2026-11-12'])
  })

  it('nothing to report is no groups', () => expect(groupByCause([])).toEqual([]))
})

describe('every cause: copy, fix action, tone and icon', () => {
  const sample: Record<string, PlanSlot> = {
    nobody_attending: nobody('2026-11-10'),
    no_recipes: unfilled('2026-11-10', 'no_candidates'),
    slot_rule: unfilled('2026-11-10', 'no_candidates', { considered: 2, coolDown: 2 }, true),
    excluded: unfilled('2026-11-10', 'no_candidates', { considered: 2, exclusion: 2 }),
    cool_down: unfilled('2026-11-10', 'no_candidates', { considered: 2, coolDown: 2 }),
    variety_rule: unfilled('2026-11-10', 'no_candidates', { considered: 2, varietyRule: 2 }),
    advance_step: unfilled('2026-11-10', 'no_candidates', { considered: 2, advanceStep: 2 }),
    no_fit: unfilled('2026-11-10', 'no_candidates', { considered: 2 }),
  }
  const group = (cause: string) => groupByCause([sample[cause]!])[0]!

  it.each([
    ['nobody_attending', "Couldn't plan 1 Meal Slot. Nobody is set to attend.", 'Choose who attends', '/settings/meal-slots#meal-slot-1', 'info', 'attendance'],
    ['no_recipes', "Couldn't plan 1 Meal Slot. There are no Recipes to choose from.", 'Add Recipes', '/recipes', 'info', 'recipes'],
    ['slot_rule', "Couldn't plan 1 Meal Slot. Nothing that matches its Slot Rule is available.", 'Review Slot Rules', '/settings/planning', 'warn', 'slotRule'],
    ['excluded', "Couldn't plan 1 Meal Slot. Every Recipe is excluded for someone who attends.", 'Review Exclusions', '/recipes', 'warn', 'exclusion'],
    ['cool_down', "Couldn't plan 1 Meal Slot. Every Recipe is in Cool-down.", 'Review Cool-down', '/settings/household', 'warn', 'duration'],
    ['variety_rule', "Couldn't plan 1 Meal Slot. Every Recipe is blocked by a Variety Rule.", 'Review Variety Rules', '/settings/planning', 'warn', 'varietyRule'],
    ['advance_step', "Couldn't plan 1 Meal Slot. Every Recipe needs an Advance Step that is already too late.", 'Choose a Recipe', '/plan', 'warn', 'advanceStep'],
    ['no_fit', "Couldn't plan 1 Meal Slot. No Recipe fits.", 'Choose a Recipe', '/plan', 'warn', 'info'],
  ])('%s', (cause, headline, label, to, tone, icon) => {
    const g = group(cause)
    expect(g.headline).toBe(headline)
    expect(g.tone).toBe(tone)
    expect(g.icon).toBe(icon)
    expect(g.fix.label).toBe(label)
    expect(g.hint.length).toBeGreaterThan(20)
    if (g.fix.kind === 'link') expect(g.fix.to).toBe(to)
    else expect(cause === 'advance_step' || cause === 'no_fit').toBe(true)
  })

  it('the Slot Rule headline is plural for several slots', () => {
    const two = groupByCause([sample.slot_rule!, { ...sample.slot_rule!, date: '2026-11-11' }])[0]!
    expect(two.headline).toBe("Couldn't plan 2 Meal Slots. Nothing that matches their Slot Rules is available.")
  })

  it('setup gaps explain how to fix them in one sentence', () => {
    expect(group('nobody_attending').hint).toBe('Pick the Members who eat at each Meal Slot, and the planner will fill it.')
    expect(group('no_recipes').hint).toBe('The planner picks from your Recipes. Add a few, or import a Recipe File.')
  })

  it('no cause is the danger tone, and the hints are all different', () => {
    const groups = Object.keys(sample).map(group)
    expect(groups.every((g) => g.tone === 'info' || g.tone === 'warn')).toBe(true)
    expect(new Set(groups.map((g) => g.hint)).size).toBe(groups.length)
  })

  it('the fix actions are the ones in the spec', () => {
    expect(Object.keys(sample).map((c) => group(c).fix.label)).toEqual([
      'Choose who attends', 'Add Recipes', 'Review Slot Rules', 'Review Exclusions', 'Review Cool-down', 'Review Variety Rules', 'Choose a Recipe', 'Choose a Recipe',
    ])
  })
})

describe('shortReason: the one-liner on a day tile', () => {
  it.each([
    ['nobody_attending', 'Nobody is set to attend.'],
    ['no_recipes', 'No Recipes to choose from.'],
    ['slot_rule', "Its Slot Rule can't be met."],
    ['excluded', 'Every Recipe is excluded.'],
    ['cool_down', 'Every Recipe is in Cool-down.'],
    ['variety_rule', 'Variety Rules block every Recipe.'],
    ['advance_step', 'Too late for an Advance Step.'],
    ['no_fit', 'No Recipe fits.'],
  ] as const)('%s', (cause, text) => expect(shortReason(cause)).toBe(text))
})

describe('toneStyle: warn and info tokens, never danger', () => {
  // R2-2: --color-info-* exists now; needs Tile and Chip `status="info"` from R2-1 first (primitive request in r2-2-today-plan.md).
  it('info is the blue info status tile and chip', () => {
    expect(toneStyle('info')).toEqual({ tile: { variant: 'status', status: 'info' }, chip: { kind: 'status', status: 'info' } })
  })
  it('warn is the spoil (amber) status tile and chip', () => {
    expect(toneStyle('warn')).toEqual({ tile: { variant: 'status', status: 'spoil' }, chip: { kind: 'status', status: 'spoil' } })
  })
})

describe('slotLine: one affected meal in the expanded list', () => {
  it('"Tue 10 Nov · Dinner"', () => expect(slotLine(nobody('2026-11-10'))).toBe('Tue 10 Nov · Dinner'))
  it('keeps the Meal Slot name as written', () => expect(slotLine(nobody('2026-11-14', 'Sunday Lunch'))).toBe('Sat 14 Nov · Sunday Lunch'))
})
