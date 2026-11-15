// B9-44 (TB-02): the pure parts of the Advance Steps tile: the When badge, the meta, the rows shown, the Done names and the Done toast.
import { todayIn } from '../../../lib/householdDate'
import { todayStrings as s } from '../strings'
import type { AdvanceStepDue } from '../types'
import { shortWeekday } from './dates'

export interface StepBadge {
  /** "Today", the short weekday of the due day, or "Overdue". */
  top: string
  /** The due time, "19:00". */
  bottom: string
  /** Drawn solid (info fill, surface text). */
  overdue: boolean
}

/** The When badge, read in the Household zone: Overdue (whatever its day), Today, or the due day's short weekday. */
export function badgeFor(step: AdvanceStepDue, today: string, timeZone: string): StepBadge {
  if (step.overdue) return { top: s.advanceOverdue, bottom: step.dueTime, overdue: true }
  const day = dueDay(step, timeZone)
  return { top: day === null || day === today ? s.advanceToday : shortWeekday(day), bottom: step.dueTime, overdue: false }
}

function dueDay(step: AdvanceStepDue, timeZone: string): string | null {
  try {
    return todayIn(timeZone, step.dueAt)
  } catch {
    return null
  }
}

/** "For Tue Dinner · Cauliflower al gorgonzola" (the Meal Slot left out when the server did not say it). */
export function metaFor(step: AdvanceStepDue): string {
  const when = [shortWeekday(step.mealDate), step.mealSlotName].filter(Boolean).join(' ')
  return s.advanceMeta(when, step.recipeName)
}

export const SHOWN_STEPS = 4

/** The first four rows and how many more there are ("Show 2 more"), in the order given (the server sorts soonest first). */
export function splitShown(steps: AdvanceStepDue[], max = SHOWN_STEPS): { rows: AdvanceStepDue[]; more: number } {
  return { rows: steps.slice(0, max), more: Math.max(0, steps.length - max) }
}

/**
 * "Done: <Step text>". With `all`, a Step whose text another listed Step shares is named with its meal too
 * ("Done: Soak the beans, for Tue Dinner · Chilli"), so every Done on the page has its own name (P38).
 */
export function doneName(step: AdvanceStepDue, all: AdvanceStepDue[] = []): string {
  const shared = all.some((o) => o !== step && o.description === step.description)
  return shared ? s.advanceDoneNameWithMeal(step.description, metaFor(step)) : s.advanceDoneName(step.description)
}

export interface DoneToast {
  headline: string
  subline: string
  body: string
}

/** R-D and R-D+: a plain success toast (no icon): the headline, the meta as its muted subline, the Step text as its body. */
export function doneToast(step: AdvanceStepDue): DoneToast {
  return { headline: s.advanceDoneToast, subline: metaFor(step), body: step.description }
}

/** The key of a row (a Step of a Planned Meal's Course). */
export function stepKey(step: AdvanceStepDue): string {
  return `${step.scope}:${step.step}`
}
