import type { IconName } from '../../../ui/icons'
import { planStrings as s } from '../strings'
import type { PlanSlot } from '../types'
import { weekdayName } from './phrase'

export type Cause =
  | 'nobody_attending'
  | 'no_recipes'
  | 'slot_rule'
  | 'excluded'
  | 'cool_down'
  | 'variety_rule'
  | 'advance_step'
  | 'no_fit'

/** info = setup is missing; warn = a rule conflict. Never danger: nothing is on fire. */
export type Tone = 'info' | 'warn'

export type FixAction = { kind: 'link'; label: string; to: string } | { kind: 'choose'; label: string }

export interface CauseGroup {
  cause: Cause
  count: number
  slots: PlanSlot[]
  /** "9 meals couldn't be planned. Nobody is set to attend." */
  headline: string
  hint: string
  tone: Tone
  icon: IconName
  fix: FixAction
}

/** Display order: setup gaps first, then rule conflicts. */
const ORDER: Cause[] = ['nobody_attending', 'no_recipes', 'slot_rule', 'excluded', 'cool_down', 'variety_rule', 'advance_step', 'no_fit']

const META: Record<Cause, { tone: Tone; icon: IconName; fix: (label: string) => FixAction }> = {
  nobody_attending: { tone: 'info', icon: 'attendance', fix: (label) => ({ kind: 'link', label, to: '/settings/meal-slots' }) },
  no_recipes: { tone: 'info', icon: 'recipes', fix: (label) => ({ kind: 'link', label, to: '/recipes' }) },
  slot_rule: { tone: 'warn', icon: 'slotRule', fix: (label) => ({ kind: 'link', label, to: '/settings/planning' }) },
  excluded: { tone: 'warn', icon: 'exclusion', fix: (label) => ({ kind: 'link', label, to: '/settings/preferences' }) },
  cool_down: { tone: 'warn', icon: 'duration', fix: (label) => ({ kind: 'link', label, to: '/settings/household' }) },
  variety_rule: { tone: 'warn', icon: 'varietyRule', fix: (label) => ({ kind: 'link', label, to: '/settings/planning' }) },
  advance_step: { tone: 'warn', icon: 'advanceStep', fix: (label) => ({ kind: 'choose', label }) },
  no_fit: { tone: 'warn', icon: 'info', fix: (label) => ({ kind: 'choose', label }) },
}

/** The tone of a cause. */
export function toneOf(cause: Cause): Tone {
  return META[cause].tone
}

/** The one cause a slot is filed under. */
export function causeOf(slot: PlanSlot): Cause {
  const u = slot.unfilled
  if (!u) return 'no_fit'
  if (u.reason === 'no_attendance') return 'nobody_attending'
  if (u.slotRuleClaimed) return 'slot_rule'
  const e = u.eliminated
  if (e.considered === 0) return 'no_recipes'
  // The filter that removed the most options; ties go in this order.
  const filters: [Cause, number][] = [
    ['excluded', e.exclusion],
    ['cool_down', e.coolDown],
    ['variety_rule', e.varietyRule],
    ['advance_step', e.advanceStep],
  ]
  let best: Cause = 'no_fit'
  let most = 0
  for (const [cause, n] of filters) {
    if (n > most) {
      best = cause
      most = n
    }
  }
  return best
}

/** The slots the planner left empty with a recorded reason, in plan order. */
export function unplannedOf(slots: PlanSlot[]): PlanSlot[] {
  return slots.filter((x) => x.meal === null && x.unfilled !== null && x.unfilled !== undefined)
}

function byTime(a: PlanSlot, b: PlanSlot): number {
  return a.date < b.date ? -1 : a.date > b.date ? 1 : a.time < b.time ? -1 : a.time > b.time ? 1 : 0
}

/** One group per cause, never one line per slot. */
export function groupByCause(slots: PlanSlot[]): CauseGroup[] {
  const byCause = new Map<Cause, PlanSlot[]>()
  for (const slot of slots) {
    const c = causeOf(slot)
    byCause.set(c, [...(byCause.get(c) ?? []), slot])
  }
  return ORDER.filter((c) => byCause.has(c)).map((cause) => {
    const list = [...byCause.get(cause)!].sort(byTime)
    const count = list.length
    const meta = META[cause]
    const text = cause === 'slot_rule' ? (count === 1 ? s.couldntSlotRuleOne : s.couldntSlotRuleMany) : s.couldntCauseText[cause]
    return {
      cause,
      count,
      slots: list,
      headline: `${s.couldntCount(count)} ${text}`,
      hint: s.couldntHint[cause],
      tone: meta.tone,
      icon: meta.icon,
      fix: meta.fix(s.couldntFix[cause]),
    }
  })
}

/** The short reason on a day tile. */
export function shortReason(cause: Cause): string {
  return s.couldntShort[cause]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "Tue 10 Nov · Dinner". */
export function slotLine(slot: PlanSlot): string {
  const [, m, d] = slot.date.split('-').map(Number)
  return `${weekdayName(slot.date, 'short')} ${d} ${MONTHS[(m ?? 1) - 1]} · ${slot.name}`
}

export interface ToneStyle {
  tile: { variant: 'soft' } | { variant: 'status'; status: 'spoil' }
  chip: { kind: 'tag' } | { kind: 'status'; status: 'spoil' }
}

/** Existing tokens only: info is the soft tile and a neutral chip, warn the amber status. */
export function toneStyle(tone: Tone): ToneStyle {
  if (tone === 'info') return { tile: { variant: 'soft' }, chip: { kind: 'tag' } }
  return { tile: { variant: 'status', status: 'spoil' }, chip: { kind: 'status', status: 'spoil' } }
}
