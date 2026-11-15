import { currencyLabel } from './currencyGuess'
import { todayStrings as s } from '../strings'

/** What the Household has set up so far: counts, the Household settings the first step confirms, and the names the done steps summarise. */
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
  /** B9-53 (TB-06): the Admin confirmed the time zone (the server marks it on the first save of the settings). */
  timeZoneConfigured: boolean
  /** B9-53 (TB 6): the Admin hid the checklist ("Hide for now"); Settings > Household shows it again. */
  setupHidden: boolean
  timeZone: string
  currency: string
  /** The Members' names, in the server's order. */
  memberNames: string[]
  /** The distinct Meal Slot names, in time order. */
  mealSlotNames: string[]
  /** Each Meal Slot name is on all seven weekdays. */
  mealSlotsEveryDay: boolean
  /** Every Member attends every Meal Slot. */
  everyoneAttends: boolean
}

export type SetupStepId = 'zone' | 'members' | 'attendance' | 'recipes' | 'plan'

/** done: a tick and its summary; current: expanded, the only one with controls; todo: muted. */
export type SetupStepState = 'done' | 'current' | 'todo'

export interface SetupStep {
  id: SetupStepId
  label: string
  /** The step's primary button, or null (Recipes has its three ways; the plan is made by the planner). */
  action: string | null
  hint: string
  /** The one line a done step shows instead of its hint; null while not done. */
  summary: string | null
  state: SetupStepState
  done: boolean
  /** The first step not done: the only one with controls. */
  current: boolean
  /** Only an Admin can do it (the settings, Members, Meal Slots): a plain User is told to ask one. */
  adminOnly: boolean
}

export interface SetupChecklist {
  steps: SetupStep[]
  doneCount: number
  total: number
  /** Show the checklist: a step is open, it is not hidden, and it is not the hand-over to Couldn't plan. */
  visible: boolean
  /** After the first plan with only the Recipes step open: the short tile after the hero. */
  compact: boolean
  /** The Recipes step's count, never more than five of five. */
  recipes: { have: number; want: number }
}

/** The Recipes step is done at this many Recipes (decision TB 6). */
export const RECIPES_WANTED = 5

const EMPTY: SetupChecklist = { steps: [], doneCount: 0, total: 0, visible: false, compact: false, recipes: { have: 0, want: RECIPES_WANTED } }
const ORDER: SetupStepId[] = ['zone', 'members', 'attendance', 'recipes', 'plan']
const ADMIN_ONLY: readonly SetupStepId[] = ['zone', 'members', 'attendance']

function doneSteps(f: SetupFacts): Record<SetupStepId, boolean> {
  return {
    zone: f.timeZoneConfigured,
    members: f.members > 0,
    attendance: f.mealSlotsWithAttendance > 0,
    recipes: f.recipes >= RECIPES_WANTED,
    plan: f.plannedMeals > 0,
  }
}

function summaryOf(id: SetupStepId, f: SetupFacts): string {
  switch (id) {
    case 'zone':
      return s.setupSummary.zone(f.timeZone, currencyLabel(f.currency, 'en'))
    case 'members':
      return s.setupSummary.members(f.members, f.memberNames)
    case 'attendance':
      return s.setupSummary.mealSlots(f.mealSlotNames, f.mealSlotsEveryDay, f.everyoneAttends)
    case 'recipes':
      return s.setupSummary.recipes(f.recipes)
    case 'plan':
      return s.setupSummary.plan
  }
}

/**
 * Five steps (TB-06): time zone and currency, Members, Meal Slots with attendance, Recipes (done at five, TB 6), the first plan. The checklist
 * stays until every step is done or the Admin hides it. After the first plan, with only Recipes open, it is compact. Before any plan, when the
 * first three steps are done (or only attendance is missing) and the planner left meals empty with Recipes there, Couldn't plan explains
 * instead. Unknown facts (null) show nothing.
 */
export function setupChecklist(facts: SetupFacts | null): SetupChecklist {
  if (!facts) return EMPTY
  const done = doneSteps(facts)
  const firstOpen = ORDER.findIndex((id) => !done[id])
  const steps: SetupStep[] = ORDER.map((id, i) => {
    const copy = s.setupSteps[id]
    const state: SetupStepState = done[id] ? 'done' : i === firstOpen ? 'current' : 'todo'
    return {
      id,
      label: copy.label,
      action: copy.action,
      hint: copy.hint,
      summary: done[id] ? summaryOf(id, facts) : null,
      state,
      done: done[id],
      current: state === 'current',
      adminOnly: ADMIN_ONLY.includes(id),
    }
  })
  const doneCount = steps.filter((x) => x.done).length
  const allDone = doneCount === steps.length
  const compact = !allDone && done.zone && done.members && done.attendance && done.plan && !done.recipes
  // Couldn't plan says why nothing was planned ("Nobody is set to attend" with "Choose who attends", or the rules), once the time zone is
  // confirmed and there are Members and Recipes to plan with.
  const handOver = facts.plannedMeals === 0 && done.zone && facts.members > 0 && facts.recipes > 0 && facts.unplannedMeals > 0
  const visible = !facts.setupHidden && !allDone && !handOver
  return {
    steps,
    doneCount,
    total: steps.length,
    visible,
    compact: visible && compact,
    recipes: { have: Math.min(facts.recipes, RECIPES_WANTED), want: RECIPES_WANTED },
  }
}

/**
 * The steps as one User sees them: a plain User cannot do the Admin-only steps, so the current step is the first open one they can act on
 * (Recipes), and the open Admin-only steps are muted with "Ask an Admin to do this." (`askAdmin`).
 */
export function stepsFor(checklist: SetupChecklist, isAdmin: boolean): (SetupStep & { askAdmin: boolean })[] {
  if (isAdmin) return checklist.steps.map((x) => ({ ...x, askAdmin: false }))
  const currentId = checklist.steps.find((x) => !x.done && !x.adminOnly)?.id
  return checklist.steps.map((x) => {
    const state: SetupStepState = x.done ? 'done' : x.id === currentId ? 'current' : 'todo'
    return { ...x, state, current: state === 'current', askAdmin: !x.done && x.adminOnly }
  })
}

/** Whether Today leads with the full checklist instead of Couldn't plan: visible and not compact. */
export function needsSetup(facts: SetupFacts | null): boolean {
  const c = setupChecklist(facts)
  return c.visible && !c.compact
}

/** Whether Today shows the compact checklist after the hero. */
export function setupCompact(facts: SetupFacts | null): boolean {
  const c = setupChecklist(facts)
  return c.visible && c.compact
}

/** The slice of GET /api/plan that the facts read: a slot, and since CRS its Courses. Since C3 the slot has no `meal` or `unfilled` of its own. */
export interface PlanSlotLike {
  courses?: { meal?: unknown; unfilled?: unknown }[]
}

/**
 * CRS G2: `plannedMeals` and `unplannedMeals` of the facts, counted over every Course of every slot (a Course holding a
 * Planned Meal; a Course with a reason and no Planned Meal). A slot without `courses` counts nothing.
 * Covered and not-served Courses (neither) count nowhere, so an optional Course never makes a step look missing.
 */
export function planFacts(slots: PlanSlotLike[]): Pick<SetupFacts, 'plannedMeals' | 'unplannedMeals'> {
  let plannedMeals = 0
  let unplannedMeals = 0
  for (const slot of slots) {
    for (const x of slot.courses ?? []) {
      if (x.meal != null) plannedMeals++
      else if (x.unfilled != null) unplannedMeals++
    }
  }
  return { plannedMeals, unplannedMeals }
}

/** The slice of a Meal Slot (GET /api/meal-slots) the summary reads. */
export interface MealSlotLike {
  weekday?: number
  name?: string
  time?: string
  attendance?: { memberId?: number }[]
}

const WEEK = 7

/** B9-53: the Meal Slot facts the summary reads: the distinct names in time order, every day, everyone attends. */
export function mealSlotFacts(slots: MealSlotLike[], memberIds: number[]): Pick<SetupFacts, 'mealSlotNames' | 'mealSlotsEveryDay' | 'everyoneAttends'> {
  const byName = new Map<string, { time: string; days: Set<number> }>()
  for (const slot of slots) {
    const name = slot.name ?? ''
    const entry = byName.get(name) ?? { time: slot.time ?? '', days: new Set<number>() }
    if ((slot.time ?? '') < entry.time) entry.time = slot.time ?? ''
    if (slot.weekday !== undefined) entry.days.add(slot.weekday)
    byName.set(name, entry)
  }
  const names = [...byName.entries()].sort((a, b) => a[1].time.localeCompare(b[1].time)).map(([name]) => name)
  const everyDay = byName.size > 0 && [...byName.values()].every((e) => e.days.size >= WEEK)
  const everyone =
    slots.length > 0 && memberIds.length > 0 && slots.every((slot) => memberIds.every((id) => (slot.attendance ?? []).some((a) => a.memberId === id)))
  return { mealSlotNames: names, mealSlotsEveryDay: everyDay, everyoneAttends: everyone }
}
