// B9-53 (TB-06, decision TB 6; changed on purpose, the whole file): five steps, with the facts timeZoneConfigured, recipes and setupHidden,
// and the new `compact` and `visible`. A step is done by its own fact; the current step is the first not done. The Recipes step is done at 5
// Recipes, and the checklist stays until every step is done or the Admin hides it (Settings > Household shows it again).
import { describe, expect, it } from 'vitest'
import { ESTABLISHED, FRESH, THREE_DONE, facts } from '../../../test/setupFacts'
import { needsSetup, setupChecklist, setupCompact } from './setup'

const ids = (f = FRESH) => setupChecklist(f).steps.map((s) => s.id)

describe('setupChecklist: five steps (TB-06)', () => {
  it('a brand new Household has five steps, none done, the time zone and currency the current one', () => {
    const c = setupChecklist(FRESH)
    expect(c.steps.map((s) => s.id)).toEqual(['zone', 'members', 'attendance', 'recipes', 'plan'])
    expect(c.steps.map((s) => s.label)).toEqual(['Check time zone and currency', 'Add your Members', 'Set up Meal Slots', 'Add Recipes', 'Get your first plan'])
    expect(c.steps.map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo', 'todo'])
    expect(c.steps.map((s) => s.done)).toEqual([false, false, false, false, false])
    expect(c.doneCount).toBe(0)
    expect(c.total).toBe(5)
    expect(c.visible).toBe(true)
    expect(c.compact).toBe(false)
  })

  it('the hints are the chapter copy, one line each', () => {
    expect(setupChecklist(FRESH).steps.map((s) => s.hint)).toEqual([
      'Slot times and reminders use the time zone; Prices use the currency.',
      'Everyone who eats from the plan.',
      'When you eat, and who is at the table.',
      'The planner picks from these. Five give it some variety.',
      'The planner fills the week from your Recipes.',
    ])
  })

  it('the main action of a step is a button name, never a link to a list page (no `to`, no `icon`)', () => {
    const c = setupChecklist(FRESH)
    expect(c.steps.map((s) => s.action)).toEqual(['Looks right', 'Add a Member', 'Set up Meal Slots', null, null])
    for (const step of c.steps) {
      expect(step).not.toHaveProperty('to')
      expect(step).not.toHaveProperty('icon')
    }
  })

  it('step 1 is done once the time zone is confirmed (timeZoneConfigured), not by the default value', () => {
    expect(setupChecklist(facts({ timeZone: 'Europe/Rome', currency: 'EUR' })).steps[0]!.done).toBe(false)
    expect(setupChecklist(facts({ timeZoneConfigured: true })).steps[0]!.done).toBe(true)
  })

  it('a step is done by its own fact; the current step is the first one not done', () => {
    const c = setupChecklist(facts({ timeZoneConfigured: true, members: 2, mealSlots: 3, mealSlotsWithAttendance: 0 }))
    expect(c.steps.map((s) => s.state)).toEqual(['done', 'done', 'current', 'todo', 'todo'])
    expect(c.doneCount).toBe(2)
  })

  it('Meal Slots with nobody attending do not count as set up', () => {
    expect(setupChecklist(facts({ members: 1, mealSlots: 7, mealSlotsWithAttendance: 0 })).steps[2]!.done).toBe(false)
    expect(setupChecklist(facts({ members: 1, mealSlots: 7, mealSlotsWithAttendance: 7 })).steps[2]!.done).toBe(true)
  })

  it('steps can be done out of order: the current one is still the first not done', () => {
    const c = setupChecklist(facts({ recipes: 5 }))
    expect(c.steps.map((s) => s.done)).toEqual([false, false, false, true, false])
    expect(c.steps.find((s) => s.current)!.id).toBe('zone')
  })

  it('only one step is current, and it is marked as such', () => {
    for (const f of [FRESH, THREE_DONE, facts({ timeZoneConfigured: true })]) {
      const c = setupChecklist(f)
      expect(c.steps.filter((s) => s.current)).toHaveLength(1)
      expect(c.steps.filter((s) => s.state === 'current')).toHaveLength(1)
    }
  })

  it('the Admin-only steps are the first three; Recipes are for everyone', () => {
    expect(setupChecklist(FRESH).steps.map((s) => s.adminOnly)).toEqual([true, true, true, false, false])
  })
})

describe('setupChecklist: the Recipes step completes at 5 Recipes (decision TB 6)', () => {
  it('1 to 4 Recipes leave the step open; the facts say how many of five', () => {
    for (const n of [0, 1, 4]) {
      const c = setupChecklist({ ...THREE_DONE, recipes: n })
      expect(c.steps[3]!.done).toBe(false)
      expect(c.recipes).toEqual({ have: n, want: 5 })
    }
  })

  it('5 Recipes complete the step', () => {
    const c = setupChecklist({ ...THREE_DONE, recipes: 5 })
    expect(c.steps[3]!.done).toBe(true)
    expect(c.recipes).toEqual({ have: 5, want: 5 })
  })

  it('more than five show as five of five, never "7 of 5"', () => {
    expect(setupChecklist({ ...THREE_DONE, recipes: 9 }).recipes).toEqual({ have: 5, want: 5 })
  })

  it('the first plan is done automatically: it is the Planned Meals', () => {
    expect(setupChecklist({ ...THREE_DONE, recipes: 1 }).steps[4]!.done).toBe(false)
    expect(setupChecklist({ ...THREE_DONE, recipes: 1, plannedMeals: 1 }).steps[4]!.done).toBe(true)
  })
})

describe('setupChecklist: stays after the first plan until five Recipes (BDD "The checklist stays after the first plan until five Recipes")', () => {
  it('with the first plan made and 1 Recipe the checklist is still visible, now compact, 4 of 5', () => {
    const c = setupChecklist({ ...THREE_DONE, recipes: 1, plannedMeals: 3 })
    expect(c.visible).toBe(true)
    expect(c.compact).toBe(true)
    expect(c.doneCount).toBe(4)
    expect(c.recipes).toEqual({ have: 1, want: 5 })
  })

  it('it stays through 4 Recipes and goes at the fifth', () => {
    expect(setupChecklist({ ...THREE_DONE, recipes: 4, plannedMeals: 3 }).visible).toBe(true)
    const done = setupChecklist({ ...THREE_DONE, recipes: 5, plannedMeals: 3 })
    expect(done.visible).toBe(false)
    expect(done.doneCount).toBe(5)
  })

  it('before the first plan the checklist is the full list, not compact', () => {
    expect(setupChecklist({ ...THREE_DONE, recipes: 1 }).compact).toBe(false)
    expect(setupChecklist({ ...THREE_DONE, recipes: 1 }).steps.find((s) => s.current)!.id).toBe('recipes')
  })

  it('a plan with an earlier step still open (the time zone not confirmed) is not compact: the open step needs its button', () => {
    const c = setupChecklist(facts({ members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 2, plannedMeals: 3 }))
    expect(c.visible).toBe(true)
    expect(c.compact).toBe(false)
    expect(c.steps.find((s) => s.current)!.id).toBe('zone')
  })
})

describe('setupChecklist: hidden by the Admin (setupHidden)', () => {
  it('a hidden checklist is not visible at any stage', () => {
    for (const f of [FRESH, THREE_DONE, { ...THREE_DONE, recipes: 1, plannedMeals: 1 }]) {
      expect(setupChecklist({ ...f, setupHidden: true }).visible).toBe(false)
    }
  })

  it('hidden changes nothing else: the steps and the counts are still worked out', () => {
    const c = setupChecklist({ ...THREE_DONE, recipes: 1, plannedMeals: 1, setupHidden: true })
    expect(c.doneCount).toBe(4)
    expect(c.steps).toHaveLength(5)
  })
})

describe('setupChecklist: Couldn\'t plan explains instead when the steps are done and only the rules block the planner', () => {
  it('steps 1 to 3 done, Recipes present, nothing planned and meals left empty: not visible', () => {
    expect(setupChecklist({ ...THREE_DONE, recipes: 4, unplannedMeals: 3 }).visible).toBe(false)
  })

  it('but an unconfirmed time zone wins over Couldn\'t plan', () => {
    const f = facts({ members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 4, unplannedMeals: 3 })
    expect(setupChecklist(f).visible).toBe(true)
  })

  it('while Members or Recipes are missing the checklist wins over Couldn\'t plan', () => {
    expect(setupChecklist({ ...THREE_DONE, recipes: 0, unplannedMeals: 3 }).visible).toBe(true)
    expect(setupChecklist({ ...THREE_DONE, members: 0, memberNames: [], unplannedMeals: 3, recipes: 4 }).visible).toBe(true)
  })

  it('attendance missing with Members and Recipes there: Couldn\'t plan leads (it says "Choose who attends")', () => {
    const f = { ...THREE_DONE, mealSlotsWithAttendance: 0, recipes: 4, unplannedMeals: 3 }
    expect(setupChecklist(f).visible).toBe(false)
    expect(setupChecklist(f).steps.find((s) => s.current)!.id).toBe('attendance')
  })
})

describe('setupChecklist: the summaries of done steps (the mocks of steps 2 to 4)', () => {
  const summary = (f: typeof FRESH, id: string) => setupChecklist(f).steps.find((s) => s.id === id)!.summary

  it('a step that is not done has no summary (it shows its hint)', () => {
    for (const s of setupChecklist(FRESH).steps) expect(s.summary).toBeNull()
  })

  it('time zone and currency: "Europe/Rome · Euro (€)"', () => {
    expect(summary(THREE_DONE, 'zone')).toBe('Europe/Rome · Euro (€)')
  })

  it('Members: "3 Members: Anna, Ben, Chiara"; one is "1 Member: Anna"; five or more are only counted', () => {
    expect(summary(THREE_DONE, 'members')).toBe('3 Members: Anna, Ben, Chiara')
    expect(summary({ ...THREE_DONE, members: 1, memberNames: ['Anna'] }, 'members')).toBe('1 Member: Anna')
    expect(summary({ ...THREE_DONE, members: 5, memberNames: ['A', 'B', 'C', 'D', 'E'] }, 'members')).toBe('5 Members')
  })

  it('Meal Slots: "Breakfast, Lunch, Dinner, every day. Everyone attends."', () => {
    expect(summary(THREE_DONE, 'attendance')).toBe('Breakfast, Lunch, Dinner, every day. Everyone attends.')
    expect(summary({ ...THREE_DONE, mealSlotsEveryDay: false }, 'attendance')).toBe('Breakfast, Lunch, Dinner. Everyone attends.')
    expect(summary({ ...THREE_DONE, mealSlotsEveryDay: false, everyoneAttends: false }, 'attendance')).toBe('Breakfast, Lunch, Dinner.')
  })

  it('Recipes: "5 Recipes" once done', () => {
    expect(summary({ ...THREE_DONE, recipes: 5 }, 'recipes')).toBe('5 Recipes')
  })
})

describe('needsSetup and setupCompact', () => {
  it('needsSetup is the full checklist leading Today (visible and not compact), the one that replaces Couldn\'t plan', () => {
    const cases = [FRESH, THREE_DONE, { ...THREE_DONE, recipes: 1, plannedMeals: 1 }, { ...THREE_DONE, recipes: 5, plannedMeals: 1 }, { ...THREE_DONE, setupHidden: true }, ESTABLISHED]
    for (const f of cases) {
      const c = setupChecklist(f)
      expect(needsSetup(f)).toBe(c.visible && !c.compact)
      expect(setupCompact(f)).toBe(c.visible && c.compact)
    }
    expect(needsSetup(null)).toBe(false)
    expect(setupCompact(null)).toBe(false)
  })

  it('unknown facts (still loading, or the request failed) show nothing', () => {
    const c = setupChecklist(null)
    expect(c.visible).toBe(false)
    expect(c.compact).toBe(false)
    expect(c.steps).toEqual([])
    expect(c.doneCount).toBe(0)
  })
})

describe('upgrade: an existing Household whose steps are done does not see the checklist (plan trap of B9-53)', () => {
  // The upgrade itself is the migration (internal/db/setup_hidden_upgrade_test.go): a beta.8 Household that already has a Planned Meal gets
  // setup_hidden = 1. These cases pin what the client does with the facts it then reads.
  it('a Household with a plan, Members, attended Meal Slots and 3 Recipes, hidden by the upgrade, shows nothing', () => {
    const upgraded = { ...THREE_DONE, recipes: 3, plannedMeals: 8, setupHidden: true, timeZoneConfigured: true }
    expect(setupChecklist(upgraded).visible).toBe(false)
    expect(needsSetup(upgraded)).toBe(false)
    expect(setupCompact(upgraded)).toBe(false)
  })

  it('ids stay stable for the saved layout memory and the tests', () => {
    expect(ids()).toEqual(['zone', 'members', 'attendance', 'recipes', 'plan'])
  })
})
