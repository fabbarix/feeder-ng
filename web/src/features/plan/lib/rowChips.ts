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
import { phraseWhy, type PhraseContext } from './phrase'

/** One chip of a row, with its look decided: `outline` is "Leftover for", `icon` an accent-coloured glyph on a why chip. */
export interface RowChip {
  key: string
  kind: ChipKind
  status?: ChipStatus
  outline?: boolean
  icon?: IconName
  label: string
}

/** The glyph of each why code (a neutral why chip always has one). */
const WHY_ICON: Partial<Record<Why['code'], IconName>> = {
  favourite: 'favourite',
  slot_rule: 'slotRule',
  perishable_use: 'useSoon',
  ingredient_overlap: 'ingredientOverlap',
  stock_coverage: 'alreadyInStock',
  cooldown_relaxed: 'advanceStep',
  variety_relaxed: 'varietyRule',
}

const RELAXED: Why['code'][] = ['cooldown_relaxed', 'variety_relaxed']

function stateChips(meal: PlannedMeal): RowChip[] {
  if (meal.state === 'cooked') return [{ key: 'state:cooked', kind: 'state', status: 'success', label: s.cooked }]
  if (meal.state === 'skipped') return [{ key: 'state:skipped', kind: 'state', status: 'danger', label: s.skipped }]
  return meal.pinned ? [{ key: 'state:pinned', kind: 'state', status: 'pinned', label: s.pinned }] : []
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
export function rowChips(meal: PlannedMeal, ctx: PhraseContext, whole?: PlanChip | null): RowChip[] {
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
  const chips = [...stateChips(meal), ...leftovers, ...leftoverFor, ...wholeChip, ...bought, ...positive, ...relaxed]
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

/** The first `limit` chips in order, and a "+N" for the rest (null when everything fits). Stub: the developer implements it. */
export function capChips(_chips: RowChip[], _limit: number = ROW_CHIP_LIMIT): { shown: RowChip[]; more: ChipMore | null } {
  throw new Error('ds-plan round 2: capChips is not implemented')
}
