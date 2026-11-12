import type { IconName } from '../../../ui/icons'
import { todayStrings as s } from '../strings'

/** Counts only: what the Household has set up so far. */
export interface SetupFacts {
  members: number
  mealSlots: number
  /** Meal Slots with at least one attendee. */
  mealSlotsWithAttendance: number
  recipes: number
  /** Slots with a Planned Meal. */
  plannedMeals: number
  /** Slots the planner left empty with a reason. */
  unplannedMeals: number
}

export type SetupStepId = 'members' | 'attendance' | 'recipes' | 'plan'

export interface SetupStep {
  id: SetupStepId
  label: string
  action: string
  hint: string
  to: string
  icon: IconName
  done: boolean
  /** The first step not done: the only one with a button. */
  current: boolean
  /** Its page can only be changed by an Admin (Members, Meal Slots): a plain User is told to ask one. */
  adminOnly: boolean
}

export interface SetupChecklist {
  steps: SetupStep[]
  doneCount: number
  total: number
  /** Show the checklist: nothing is planned yet and it is not the attendance-only case below (or nothing has run yet). */
  visible: boolean
}

const EMPTY: SetupChecklist = { steps: [], doneCount: 0, total: 0, visible: false }

/** Members, Meal Slots and attendance, Recipes, first plan. Unknown facts (null) show nothing. */
export function setupChecklist(facts: SetupFacts | null): SetupChecklist {
  if (!facts) return EMPTY
  const done: Record<SetupStepId, boolean> = {
    members: facts.members > 0,
    attendance: facts.mealSlotsWithAttendance > 0,
    recipes: facts.recipes > 0,
    plan: facts.plannedMeals > 0,
  }
  const defs: { id: SetupStepId; to: string; icon: IconName }[] = [
    { id: 'members', to: '/settings/members', icon: 'members' },
    { id: 'attendance', to: '/settings/meal-slots', icon: 'mealSlots' },
    { id: 'recipes', to: '/recipes', icon: 'recipes' },
    { id: 'plan', to: '/plan', icon: 'plan' },
  ]
  const firstOpen = defs.findIndex((d) => !done[d.id])
  const steps = defs.map((d, i) => ({ ...d, ...s.setupSteps[d.id], done: done[d.id], current: i === firstOpen, adminOnly: d.id === 'members' || d.id === 'attendance' }))
  // Members and Recipes exist and the planner reports unplanned meals: either it is held back by rules, or only
  // attendance is missing. Couldn't plan explains both ("Nobody is set to attend", with "Choose who attends").
  const visible = facts.plannedMeals === 0 && !(facts.members > 0 && facts.recipes > 0 && facts.unplannedMeals > 0)
  return { steps, doneCount: steps.filter((x) => x.done).length, total: steps.length, visible }
}

/** Whether Today leads with the checklist instead of Couldn't plan: exactly when the checklist is visible. */
export function needsSetup(facts: SetupFacts | null): boolean {
  return setupChecklist(facts).visible
}

/** The slice of GET /api/plan that the facts read: a slot, and since CRS its Courses. Since C3 the slot has no `meal` or `unfilled` of its own. */
export interface PlanSlotLike {
  meal?: unknown
  unfilled?: unknown
  courses?: { meal?: unknown; unfilled?: unknown }[]
}

/**
 * CRS G2: `plannedMeals` and `unplannedMeals` of the facts, counted over every Course of every slot (a Course holding a
 * Planned Meal; a Course with a reason and no Planned Meal). A slot without `courses` counts its own `meal` and `unfilled`.
 * Covered and not-served Courses (neither) count nowhere, so an optional Course never makes a step look missing.
 */
export function planFacts(slots: PlanSlotLike[]): Pick<SetupFacts, 'plannedMeals' | 'unplannedMeals'> {
  let plannedMeals = 0
  let unplannedMeals = 0
  for (const slot of slots) {
    // A slot with `courses` counts each of them; the list is the whole truth then (an empty list counts nothing).
    const counted = slot.courses !== undefined ? slot.courses : [slot]
    for (const x of counted) {
      if (x.meal != null) plannedMeals++
      else if (x.unfilled != null) unplannedMeals++
    }
  }
  return { plannedMeals, unplannedMeals }
}
