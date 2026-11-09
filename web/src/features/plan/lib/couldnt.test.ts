import { describe, expect, it } from 'vitest'
import type { Eliminations, PlanSlot, UnfilledReason } from '../types'
import { couldntPlanText } from './couldnt'

const none: Eliminations = { considered: 0, exclusion: 0, coolDown: 0, varietyRule: 0, advanceStep: 0 }

function unfilled(date: string, reason: UnfilledReason, eliminated: Partial<Eliminations> = {}, slotRuleClaimed = false): PlanSlot {
  return {
    date, mealSlotId: 1, name: 'Dinner', time: '19:00', at: `${date}T19:00:00Z`, portions: 2, meal: null, rules: [],
    unfilled: { reason, slotRuleClaimed, eliminated: { ...none, ...eliminated } },
  }
}

describe('couldntPlanText', () => {
  it('every option excluded or in Cool-down', () => {
    expect(couldntPlanText(unfilled('2026-11-12', 'no_candidates', { considered: 4, exclusion: 1, coolDown: 3 }))).toBe(
      "Couldn't plan Thursday dinner: every option was excluded or in Cool-down.",
    )
  })

  it('names only the filters that removed something', () => {
    expect(couldntPlanText(unfilled('2026-11-12', 'no_candidates', { considered: 1, coolDown: 1 }))).toBe(
      "Couldn't plan Thursday dinner: every option was in Cool-down.",
    )
    expect(couldntPlanText(unfilled('2026-11-12', 'no_candidates', { considered: 4, exclusion: 2, coolDown: 1, varietyRule: 1 }))).toBe(
      "Couldn't plan Thursday dinner: every option was excluded, in Cool-down or blocked by a Variety Rule.",
    )
    expect(couldntPlanText(unfilled('2026-11-12', 'no_candidates', { considered: 2, exclusion: 1, advanceStep: 1 }))).toBe(
      "Couldn't plan Thursday dinner: every option was excluded or needs an Advance Step that is already too late.",
    )
  })

  it('a Slot Rule that nothing satisfies', () => {
    expect(couldntPlanText(unfilled('2026-11-13', 'no_candidates', { considered: 1, coolDown: 1 }, true))).toBe(
      "Couldn't plan Friday dinner: nothing that matches its Slot Rule is available.",
    )
  })

  it('no Recipes to choose from at all', () => {
    expect(couldntPlanText(unfilled('2026-11-12', 'no_candidates'))).toBe("Couldn't plan Thursday dinner: there are no Recipes to choose from.")
  })

  it('nobody attending', () => {
    expect(couldntPlanText(unfilled('2026-11-10', 'no_attendance'))).toBe("Couldn't plan Tuesday dinner: nobody is attending.")
  })

  it('lower-cases the Meal Slot name', () => {
    const s = unfilled('2026-11-10', 'no_attendance')
    s.name = 'Sunday Lunch'
    expect(couldntPlanText(s)).toBe("Couldn't plan Tuesday sunday lunch: nobody is attending.")
  })
})
