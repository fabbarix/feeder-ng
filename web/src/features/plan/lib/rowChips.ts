// ds-plan (docs/design/system.md §2, §6): the chips of one Course row. Plain TypeScript, no React. One kind, one look;
// the row shows them on one line (the rest is in the sheet).
import type { ChipKind, ChipStatus } from '../../../ui'
import type { IconName } from '../../../ui/icons'
import { planStrings as s } from '../strings'
import type { PlannedMeal, PlanCourse, Why } from '../types'
import { addBoughtChip } from './bought'
import type { PlanChip } from './chips'
import { leftoverChip } from './chips'
import { causeOf, shortReason, toneOf, toneStyle } from './couldntGroups'
import { phraseWhy, weekdayName, type PhraseContext } from './phrase'

/** One chip of a row, with its look decided: `outline` is "Leftover for", `icon` an accent-coloured glyph on a why chip. */
export interface RowChip {
  key: string
  kind: ChipKind
  status?: ChipStatus
  outline?: boolean
  icon?: IconName
  label: string
  /** B9-32: the chip's tooltip and accessible description when its label is short ("Start Tue 21:30"). */
  title?: string
}

/** B9-32 (A2, PC-14): what a row needs to decide whether to show a start chip. */
export interface StartContext {
  /** The slot's `at` (RFC 3339): the start chips are hidden once it has passed. */
  slotAt: string
  /** The instant "now" (ms). */
  now: number
  /** Everyone is away at this slot: nobody cooks, so no start chip. */
  everyoneAway?: boolean
}

/** The glyph of each why code (a neutral why chip always has one). */
const WHY_ICON: Partial<Record<Why['code'], IconName>> = {
  favourite: 'favourite',
  slot_rule: 'slotRule',
  perishable_use: 'useSoon',
  ingredient_overlap: 'ingredientOverlap',
  stock_coverage: 'alreadyInStock',
  cooldown_relaxed: 'refresh',
  variety_relaxed: 'varietyRule',
}

const RELAXED: Why['code'][] = ['cooldown_relaxed', 'variety_relaxed']

function stateChips(meal: PlannedMeal): RowChip[] {
  if (meal.state === 'cooked') return [{ key: 'state:cooked', kind: 'state', status: 'success', label: s.cooked }]
  if (meal.state === 'skipped') return [{ key: 'state:skipped', kind: 'state', status: 'neutral', icon: 'notCooked', label: s.skipped }]
  return meal.pinned ? [{ key: 'state:pinned', kind: 'state', status: 'pinned', label: s.pinned }] : []
}

/**
 * A2 / PC-14: the start chip of a planned meal. Warn "Start 02:30" (or "Start Mon 02:30") when a Pinned or Bought meal
 * would start outside the cooking times; else info "Start Mon 21:30" when it starts on an earlier day. None without a
 * start context, once the slot time has passed, on an everyone-away slot, or on a resolved meal.
 */
function startChips(meal: PlannedMeal, start: StartContext | undefined): RowChip[] {
  if (!start || meal.state !== 'planned' || start.everyoneAway) return []
  if (start.now >= Date.parse(start.slotAt)) return []
  const day = meal.startsAt ? weekdayName(meal.startsAt.date, 'short') : null
  if (meal.earlyStart) {
    const label = day ? s.startChipDay(day, meal.startsAt!.time) : s.startChip(meal.earlyStart)
    return [{ key: 'start:warn', kind: 'status', status: 'warn', icon: 'warning', label, title: s.startOutsideTitle }]
  }
  if (meal.startsAt && day) {
    return [{
      key: 'start:info', kind: 'status', status: 'info', icon: 'timer', label: s.startChipDay(day, meal.startsAt.time),
      title: s.startEarlierTitle(weekdayName(meal.startsAt.date), meal.startsAt.time),
    }]
  }
  return []
}

/** Leftover for: the outlined leftover tone; "Leftovers to come" when the date is not known. */
function leftoverForChip(why: Why, ctx: PhraseContext): RowChip {
  const label = phraseWhy(why, ctx)
  return { key: `leftover-for:${label}`, kind: 'status', status: 'leftover', outline: true, label }
}

/** A why code that is a leftover (its date the Leftover it comes from) and is not already a Leftover from chip. */
function leftoverFromWhy(why: Why, ctx: PhraseContext): RowChip {
  const label = phraseWhy(why, ctx)
  return { key: `status:leftover-why:${label}`, kind: 'status', status: 'leftover', label }
}

function whyChip(why: Why, ctx: PhraseContext): RowChip {
  const label = phraseWhy(why, ctx)
  return { key: `why:${label}`, kind: 'why', icon: WHY_ICON[why.code] ?? 'why', label }
}

/**
 * What a row says about its meal, most important first: state (Pinned, Cooked, Not cooked), Leftover from, Leftover for,
 * the whole-meal chip, then the why chips, the relaxed ones last (ADR 0009). No duplicate labels; 'best_available' never.
 */
export function rowChips(meal: PlannedMeal, ctx: PhraseContext, whole?: PlanChip | null, start?: StartContext): RowChip[] {
  const leftoverFor: RowChip[] = []
  const positive: RowChip[] = []
  const relaxed: RowChip[] = []
  for (const why of meal.why) {
    if (why.code === 'leftover' && meal.servedFromLeftover) continue
    if (why.code === 'stock_coverage' && !why.ingredient) continue
    if (why.code === 'leftover_fits') {
      leftoverFor.push(leftoverForChip(why, ctx))
    } else if (why.code === 'leftover') {
      leftoverFor.push(leftoverFromWhy(why, ctx))
    } else if (RELAXED.includes(why.code)) {
      relaxed.push(whyChip(why, ctx))
    } else {
      positive.push(whyChip(why, ctx))
    }
  }
  const leftovers: RowChip[] = leftoverChip(meal)
  const wholeChip: RowChip[] = whole ? [whole] : []
  const bought: RowChip[] = addBoughtChip([], meal.bought, 'sheet').map((c) => ({ ...c, icon: 'shoppingCart' as const }))
  const chips = [...stateChips(meal), ...startChips(meal, start), ...leftovers, ...leftoverFor, ...wholeChip, ...bought, ...positive, ...relaxed]
  const seen = new Set<string>()
  return chips.filter((c) => {
    if (c.label === '' || seen.has(c.label)) return false
    seen.add(c.label)
    return true
  })
}

/** An empty Course: its short reason is the row title, its "Not planned" chip is in the tone of its cause. */
export interface EmptyRowModel {
  title: string
  chip: RowChip | null
  /** "Choose a Recipe" is offered (nobody attending means nobody to cook for). */
  canChoose: boolean
}

export function emptyRow(course: PlanCourse): EmptyRowModel {
  if (course.unfilled === null) return { title: s.nothingPlanned, chip: null, canChoose: true }
  const cause = causeOf(course)
  const tone = toneStyle(toneOf(cause)).chip
  return {
    title: shortReason(cause),
    chip: { key: 'status:not-planned', kind: 'status', status: tone.status, label: s.notPlanned },
    canChoose: cause !== 'nobody_attending',
  }
}

/** ds-plan round 2: a row shows at most this many chips; the rest collapse into one "+N" chip. */
export const ROW_CHIP_LIMIT = 2

/** The collapsed "+N" chip: its label, and the hidden chips' labels (the chip's title and accessible name). */
export interface ChipMore {
  label: string
  /** The hidden chips' labels, joined with ", ". */
  title: string
  count: number
}

/** The first `limit` chips in order, and a "+N" for the rest (null when everything fits). Never changes its input. */
export function capChips(chips: RowChip[], limit: number = ROW_CHIP_LIMIT): { shown: RowChip[]; more: ChipMore | null } {
  if (chips.length <= limit) return { shown: chips.slice(), more: null }
  const hidden = chips.slice(limit)
  return {
    shown: chips.slice(0, limit),
    more: { label: `+${hidden.length}`, title: hidden.map((c) => c.label).join(', '), count: hidden.length },
  }
}

/** B9-32 (PC-06): the result of fitting a row's chips into its chip line. */
export interface FitResult {
  shown: RowChip[]
  more: ChipMore | null
  /** Only a lone chip wider than the whole line is cut (it ends in an ellipsis). */
  cut: boolean
}

const isLeftover = (c: RowChip) => c.kind === 'status' && c.status === 'leftover'

/** How many chips of `widths`, from the first, fit in `available` beside a "+N" chip (`reserve` px with its gap). */
function countFitting(widths: number[], available: number, gap: number, reserve: number): number {
  let used = reserve
  let n = 0
  for (const w of widths) {
    const next = used + (n > 0 ? gap : 0) + w
    if (next > available) break
    used = next
    n++
  }
  return n
}

function moreOf(hidden: RowChip[]): ChipMore | null {
  if (hidden.length === 0) return null
  return { label: `+${hidden.length}`, title: hidden.map((c) => c.label).join(', '), count: hidden.length }
}

/**
 * PC-06: the chips a row's line shows, whole and in priority order, then "+N" for the rest. A Leftover chip that would be
 * hidden goes first. Only a lone chip wider than the line is cut (and, before the line is measured, the first chip).
 * `widths[i]` is the natural width of chips[i]. Never changes its input.
 */
export function fitChips(chips: RowChip[], widths: number[], available: number, opts: { gap?: number; moreWidth?: number } = {}): FitResult {
  const gap = opts.gap ?? 4
  const moreWidth = opts.moreWidth ?? 36
  if (chips.length === 0) return { shown: [], more: null, cut: false }
  const total = widths.slice(0, chips.length).reduce((a, w, i) => a + w + (i > 0 ? gap : 0), 0)
  if (total <= available) return { shown: chips.slice(), more: null, cut: false }
  if (chips.length === 1) return { shown: chips.slice(), more: null, cut: true }
  let order = chips.map((c, i) => ({ c, w: widths[i] ?? 0 }))
  const reserve = moreWidth + gap
  let n = countFitting(order.map((o) => o.w), available, gap, reserve)
  const hiddenLeftover = order.findIndex((o, i) => i >= Math.max(n, 1) && isLeftover(o.c))
  if (hiddenLeftover >= 0) {
    order = [order[hiddenLeftover]!, ...order.filter((_, i) => i !== hiddenLeftover)]
    n = countFitting(order.map((o) => o.w), available, gap, reserve)
  }
  const keep = Math.max(1, n)
  const shown = order.slice(0, keep).map((o) => o.c)
  return { shown, more: moreOf(order.slice(keep).map((o) => o.c)), cut: n === 0 }
}
