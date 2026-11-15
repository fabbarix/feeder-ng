// CRS G2 (spec 7.4, First run): the setup checklist reads the plan per Course, and Courses never make a step look missing.
import { describe, expect, it } from 'vitest'
import { THREE_DONE } from '../../../test/setupFacts'
import { planFacts, setupChecklist, type SetupFacts } from './setup'

const course = (state: 'meal' | 'reason' | 'covered' | 'unserved') => ({
  meal: state === 'meal' ? { recipeName: 'Soup' } : null,
  unfilled: state === 'reason' ? { reason: 'no_course_recipes' } : null,
  ...(state === 'covered' ? { coveredBy: { courseId: 1 } } : {}),
  ...(state === 'unserved' ? { unserved: 'optional' } : {}),
})

describe('planFacts: Planned Meals and unplanned meals, counted over the Courses', () => {
  it('counts every Course holding a Planned Meal, and every Course left empty with a reason', () => {
    const slots = [{ courses: [course('meal'), course('meal'), course('reason')] }, { courses: [course('meal'), course('reason')] }]
    expect(planFacts(slots)).toEqual({ plannedMeals: 3, unplannedMeals: 2 })
  })

  it('a slot whose `meal` and `unfilled` are gone (since C3) is still read, from its Courses', () => {
    expect(planFacts([{ courses: [course('meal')] }])).toEqual({ plannedMeals: 1, unplannedMeals: 0 })
  })

  it('covered and not-served Courses count nowhere: an optional Course never makes a step look missing', () => {
    expect(planFacts([{ courses: [course('meal'), course('covered'), course('unserved')] }])).toEqual({ plannedMeals: 1, unplannedMeals: 0 })
    expect(planFacts([{ courses: [course('unserved')] }])).toEqual({ plannedMeals: 0, unplannedMeals: 0 })
  })

  it('a slot without `courses` counts nothing', () => {
    const slots = [{ meal: { recipeName: 'Soup' } }, { meal: null, unfilled: { reason: 'no_attendance' } }, {}] as never
    expect(planFacts(slots)).toEqual({ plannedMeals: 0, unplannedMeals: 0 })
  })

  it('a slot whose time has gone (no meal, no reason) counts nowhere; an empty plan is zero', () => {
    expect(planFacts([{ courses: [course('covered')] }, {}])).toEqual({ plannedMeals: 0, unplannedMeals: 0 })
    expect(planFacts([])).toEqual({ plannedMeals: 0, unplannedMeals: 0 })
  })

  it('an empty `courses` list counts nothing', () => {
    expect(planFacts([{ courses: [] }])).toEqual({ plannedMeals: 0, unplannedMeals: 0 })
  })
})

// B9-53 (TB-06, decision TB 6; changed on purpose): the Recipes step is done at 5 Recipes, and one Planned Meal no longer ends the first run.
describe('the checklist with Courses', () => {
  const base: SetupFacts = { ...THREE_DONE, recipes: 4 }

  it('the Recipes step is done at 5 Recipes, whatever Courses they are marked with', () => {
    expect(setupChecklist({ ...base, recipes: 1 }).steps.find((s) => s.id === 'recipes')!.done).toBe(false)
    expect(setupChecklist({ ...base, recipes: 5 }).steps.find((s) => s.id === 'recipes')!.done).toBe(true)
  })

  it('a Course with no Recipes marked for it (a reason, no Planned Meal) hands over to Couldn\'t plan, it does not show the checklist', () => {
    const c = setupChecklist({ ...base, unplannedMeals: 2 })
    expect(c.visible).toBe(false)
  })

  it('a Planned Meal in any Course makes the checklist compact, and it stays until five Recipes', () => {
    const c = setupChecklist({ ...base, plannedMeals: 1, unplannedMeals: 3 })
    expect(c.visible).toBe(true)
    expect(c.compact).toBe(true)
  })
})
