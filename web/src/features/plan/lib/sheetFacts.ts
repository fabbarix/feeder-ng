// B9-38 (PC-09, B9-32 follow-up): the words of the Planned Meal sheet's body. Plain TypeScript, no React.
import { menuActions } from '../../../lib/leftovers/rows'
import type { Leftover, LeftoverActionKind } from '../../../lib/leftovers/types'
import { formatMinutes } from '../../../lib/time/formatMinutes'
import { planStrings as s } from '../strings'
import type { PlannedMeal } from '../types'
import { formatPortions } from './cook'
import { weekdayName } from './phrase'

/** The facts line: "1 Batch · 2.75 portions · 45 min · start 18:15" (minutes and start only when the meal has them); "2.75 portions" for a meal served from a Leftover. */
export function sheetFacts(meal: PlannedMeal): string {
  if (meal.servedFromLeftover) return formatPortions(meal.portions)
  const parts = [s.batches(meal.batches), formatPortions(meal.portions)]
  if (meal.cookMinutes && meal.cookMinutes > 0) parts.push(formatMinutes(meal.cookMinutes))
  if (meal.startBy) parts.push(s.sheetFacts.start(meal.startBy))
  return parts.join(' · ')
}

/**
 * Why a start is outside the cooking times, or on an earlier day (A2), as one sentence for the sheet's body; null when the meal
 * has no start to explain or is no longer planned.
 */
export function startNote(meal: PlannedMeal): string | null {
  if (meal.state !== 'planned') return null
  const earlier = meal.startsAt && meal.startsAt.date < meal.date ? meal.startsAt : null
  if (meal.earlyStart) {
    return earlier ? s.sheetFacts.outsideOn(weekdayName(earlier.date, 'long'), meal.earlyStart) : s.sheetFacts.outside(meal.earlyStart)
  }
  if (meal.startsAt) return s.sheetFacts.startOn(weekdayName(meal.startsAt.date, 'long'), meal.startsAt.time)
  return null
}

const round = (n: number) => Math.round(n * 100) / 100

/** The leftover-tone block of a Cooked meal's sheet: "2.5 portions left · Use by Tue" and "1.25 portions planned. 1.25 not planned yet.". */
export function leftoverBlock(leftover: Leftover, _today: string): { title: string; detail: string } {
  const title = s.sheetFacts.leftoverTitle(formatPortions(leftover.portions), weekdayName(leftover.useBy, 'short'))
  const planned = round(Math.max(0, leftover.plannedPortions ?? 0))
  const rest = round(leftover.portions - planned)
  let detail: string
  if (planned <= 0) detail = s.sheetFacts.noneYet
  else if (rest <= 0) detail = s.sheetFacts.allPlanned
  else detail = s.sheetFacts.partPlanned(formatPortions(planned), String(rest))
  return { title, detail }
}

/** The Leftover block's actions: Had it and Freeze it (Take out for a frozen one) as outlined buttons, the rest under its ⋮. */
export function leftoverBlockActions(leftover: Leftover, today: string): { buttons: LeftoverActionKind[]; more: LeftoverActionKind[] } {
  const all = menuActions(leftover, today)
  const buttons: LeftoverActionKind[] = all.filter((k) => k !== 'threw-out')
  return { buttons, more: all.filter((k) => !buttons.includes(k)) }
}
