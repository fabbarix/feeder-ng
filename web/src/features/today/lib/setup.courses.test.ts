// CRS G2 (spec 7.4, First run): the setup checklist reads the plan per Course, and Courses never make a step look missing.
import { describe, expect, it } from 'vitest'
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

describe('the checklist with Courses', () => {
  const base: SetupFacts = { members: 2, mealSlots: 3, mealSlotsWithAttendance: 3, recipes: 4, plannedMeals: 0, unplannedMeals: 0 }

  it('the Recipes step is done when any Recipe exists, whatever Courses they are marked with', () => {
    expect(setupChecklist({ ...base, recipes: 1 }).steps.find((s) => s.id === 'recipes')!.done).toBe(true)
  })

  it('a Course with no Recipes marked for it (a reason, no Planned Meal) hands over to Couldn\'t plan, it does not show the checklist', () => {
    const c = setupChecklist({ ...base, unplannedMeals: 2 })
    expect(c.visible).toBe(false)
    expect(c.steps.find((s) => s.id === 'recipes')!.done).toBe(true)
  })

  it('one Planned Meal in any Course ends the first run', () => {
    expect(setupChecklist({ ...base, plannedMeals: 1, unplannedMeals: 3 }).visible).toBe(false)
  })
})
