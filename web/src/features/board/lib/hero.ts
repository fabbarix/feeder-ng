// B9-47 (TB-08, decision TB 7): the board's hero, chosen by the same selection as Today's (heroSelection): the earliest Meal Slot with a
// Planned Meal still to cook whose slot time has not come. Its eyebrow is Today's parts with the day word. Plain TypeScript, no React.
import { heroEyebrow, heroSelection, isStartPart } from '../../plan'
import { boardStrings } from '../strings'
import type { SlotLike } from '../types'
import { tonightRows, type TonightRow } from './tiles'

export interface BoardHero {
  slot: SlotLike
  day: 'today' | 'tomorrow' | 'later'
  /** heroEyebrow(selection, now), with its day word: ["Today", "Dinner", "start 13:00"]. */
  eyebrow: string[]
  /** "Start 13:00 · ready 19:00" under the Courses, or null. */
  startLine: string | null
  rows: TonightRow[]
  /** /cook/meal/<date>/<mealSlotId> */
  cookPath: string
}

type PlanSlots = Parameters<typeof heroSelection>[0]

/**
 * The board's slots in the plan's shape. The board's payload carries the Courses the board needs; the plan library also reads
 * the Course fields an older or smaller payload may leave out (who opts out, why a Course is empty), so they are filled with
 * "none" here rather than letting the selection read undefined.
 */
function asPlanSlots(slots: SlotLike[]): PlanSlots {
  return slots.map((s) => ({
    ...s,
    courses: (s.courses ?? []).map((c) => ({ unfilled: null, coveredBy: null, unserved: null, optOutMemberIds: [], ...c })),
  })) as unknown as PlanSlots
}

/** The board's hero at `now`, or null when no slot with a Planned Meal is ahead. */
export function boardHero(slots: SlotLike[], now: Date, today: string): BoardHero | null {
  const planSlots = asPlanSlots(slots)
  const sel = heroSelection(planSlots, now, today)
  if (!sel) return null
  // The selection returns one of the slots it was given: the board's own slot is the one at the same place.
  const slot = slots[planSlots.indexOf(sel.slot)] ?? (sel.slot as unknown as SlotLike)
  return {
    slot,
    day: sel.day,
    eyebrow: heroEyebrow(sel, now),
    startLine: slot.startBy ? boardStrings.startLine(slot.startBy, slot.time) : null,
    rows: tonightRows(slot),
    cookPath: `/cook/meal/${slot.date}/${slot.mealSlotId}`,
  }
}

/** One part of the eyebrow as the hero draws it: its text with the leading "· " after the first, and whether it is the start part. */
export interface EyebrowPart {
  text: string
  /** "start 13:00" or "start now" */
  start: boolean
  /** "start now": the meal must start now */
  now: boolean
}

/** The eyebrow's parts, each after the first carrying its separator, so a wrapped eyebrow never ends a line in "·" (TB-15b). */
export function eyebrowParts(eyebrow: string[]): EyebrowPart[] {
  return eyebrow.map((part, i) => {
    const start = isStartPart(part)
    return { text: i === 0 ? part : `· ${part}`, start, now: start && !/\d/.test(part) }
  })
}
