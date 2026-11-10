import { describe, expect, it } from 'vitest'
import { setupChecklist, type SetupFacts } from './setup'

const fresh: SetupFacts = { members: 0, mealSlots: 0, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 0, unplannedMeals: 0 }

describe('setupChecklist: Members, Meal Slots and attendance, Recipes, first plan', () => {
  it('a brand new household has four steps, none done, the first current', () => {
    const c = setupChecklist(fresh)
    expect(c.steps.map((s) => s.id)).toEqual(['members', 'attendance', 'recipes', 'plan'])
    expect(c.steps.map((s) => s.done)).toEqual([false, false, false, false])
    expect(c.steps.map((s) => s.current)).toEqual([true, false, false, false])
    expect(c.doneCount).toBe(0)
    expect(c.total).toBe(4)
    expect(c.visible).toBe(true)
  })

  it('copy and where each step goes (Glossary terms)', () => {
    const c = setupChecklist(fresh)
    expect(c.steps.map((s) => [s.label, s.action, s.to])).toEqual([
      ['Add your Members', 'Add Members', '/settings/members'],
      ['Set up Meal Slots and attendance', 'Set up Meal Slots', '/settings/meal-slots'],
      ['Add Recipes', 'Add a Recipe', '/recipes'],
      ['Get your first plan', 'Open the Plan', '/plan'],
    ])
    expect(c.steps.every((s) => s.hint.length > 10)).toBe(true)
    expect(c.steps.map((s) => s.icon)).toEqual(['members', 'mealSlots', 'recipes', 'plan'])
  })

  it('a step is done by its own fact; the current step is the first one not done', () => {
    const c = setupChecklist({ ...fresh, members: 2, mealSlots: 3, mealSlotsWithAttendance: 0 })
    expect(c.steps.map((s) => s.done)).toEqual([true, false, false, false])
    expect(c.steps.map((s) => s.current)).toEqual([false, true, false, false])
    expect(c.doneCount).toBe(1)
  })

  it('Meal Slots with nobody attending do not count as set up', () => {
    expect(setupChecklist({ ...fresh, members: 1, mealSlots: 7, mealSlotsWithAttendance: 0 }).steps[1]!.done).toBe(false)
    expect(setupChecklist({ ...fresh, members: 1, mealSlots: 7, mealSlotsWithAttendance: 7 }).steps[1]!.done).toBe(true)
  })

  it('steps can be done out of order: the current one is still the first not done', () => {
    const c = setupChecklist({ ...fresh, recipes: 5 })
    expect(c.steps.map((s) => s.done)).toEqual([false, false, true, false])
    expect(c.steps.find((s) => s.current)!.id).toBe('members')
  })

  it('with the first three done and nothing planned yet, the planner is the current step', () => {
    const c = setupChecklist({ members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 4, plannedMeals: 0, unplannedMeals: 0 })
    expect(c.steps.find((s) => s.current)!.id).toBe('plan')
    expect(c.visible).toBe(true)
  })

  it('goes away once a Planned Meal exists', () => {
    const c = setupChecklist({ members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 4, plannedMeals: 1, unplannedMeals: 0 })
    expect(c.visible).toBe(false)
    expect(c.steps.every((s) => s.done)).toBe(true)
    expect(c.steps.some((s) => s.current)).toBe(false)
  })

  it('stays away for a household that already plans, even if a setup step regresses', () => {
    expect(setupChecklist({ members: 0, mealSlots: 0, mealSlotsWithAttendance: 0, recipes: 0, plannedMeals: 3, unplannedMeals: 0 }).visible).toBe(false)
  })

  it('when the three setup steps are done and the planner is only blocked by rules, Couldn\'t plan explains it instead', () => {
    const c = setupChecklist({ members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 4, plannedMeals: 0, unplannedMeals: 3 })
    expect(c.visible).toBe(false)
  })

  it('but while a setup step is missing the checklist wins over Couldn\'t plan', () => {
    expect(setupChecklist({ members: 2, mealSlots: 3, mealSlotsWithAttendance: 0, recipes: 4, plannedMeals: 0, unplannedMeals: 3 }).visible).toBe(true)
  })

  it('unknown facts (still loading, or the request failed) show nothing', () => {
    const c = setupChecklist(null)
    expect(c.visible).toBe(false)
    expect(c.steps).toEqual([])
    expect(c.doneCount).toBe(0)
  })
})
