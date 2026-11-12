import type { ChipStatus } from '../../../ui'
import type { PlannedMeal, WhyCode } from '../types'
import { planStrings as s } from '../strings'
import { phraseWhy, weekdayName, type PhraseContext } from './phrase'

/** One chip of a Planned Meal: what the planner or the state says, never a raw fact (ui-fix-plan 4.3). */
export interface PlanChip {
  /** Stable React key and dedupe key. */
  key: string
  kind: 'why' | 'state' | 'status'
  /** Needed by 'state' and 'status'. */
  status?: ChipStatus
  label: string
}

const SHEET_LIMIT = 3
const HERO_LIMIT = 2

/** The state chip of a meal: Cooked (success), Not cooked (danger), else Pinned when pinned. */
function stateChips(meal: PlannedMeal): PlanChip[] {
  if (meal.state === 'cooked') return [{ key: 'state:cooked', kind: 'state', status: 'success', label: s.cooked }]
  if (meal.state === 'skipped') return [{ key: 'state:skipped', kind: 'state', status: 'danger', label: s.skipped }]
  return meal.pinned ? [{ key: 'state:pinned', kind: 'state', status: 'pinned', label: s.pinned }] : []
}

/** "Leftover from Mon" when the meal is served from a Leftover. */
export function leftoverChip(meal: PlannedMeal): PlanChip[] {
  const from = meal.servedFromLeftover
  if (!from) return []
  return [{ key: 'status:leftover', kind: 'status', status: 'leftover', label: from.date ? s.servedFromLeftover(weekdayName(from.date, 'short')) : s.servedFromLeftoverUnknown }]
}

const RELAXED: WhyCode[] = ['cooldown_relaxed', 'variety_relaxed']

/**
 * The why chips: phrased, 'best_available' never, a 'leftover' why dropped when the leftover chip says it, an unnamed
 * 'stock_coverage' never (the server does not send its Ingredient, so "uses what is in Stock" is noise), no duplicate labels.
 * Split in two: the positive chips, and the relaxed ones (ADR 0009: a neutral chip that always comes last).
 */
function whyChipsSplit(meal: PlannedMeal, ctx: PhraseContext): { positive: PlanChip[]; relaxed: PlanChip[] } {
  const positive: PlanChip[] = []
  const relaxed: PlanChip[] = []
  const seen = new Set<string>()
  for (const why of meal.why) {
    if (why.code === 'leftover' && meal.servedFromLeftover) continue
    if (why.code === 'stock_coverage' && !why.ingredient) continue
    const label = phraseWhy(why, ctx)
    if (label === '' || seen.has(label)) continue
    seen.add(label)
    const chip: PlanChip = { key: `why:${label}`, kind: 'why', label }
    ;(RELAXED.includes(why.code) ? relaxed : positive).push(chip)
  }
  return { positive, relaxed }
}

function whyChips(meal: PlannedMeal, ctx: PhraseContext): PlanChip[] {
  const { positive, relaxed } = whyChipsSplit(meal, ctx)
  return [...positive, ...relaxed]
}

/**
 * The single chip a day tile shows (rule: at most 1). Priority: Cooked (state success), Not cooked (state danger),
 * Pinned (state pinned), served from a Leftover (status leftover "Leftover from Tue"), then the first phrased why
 * chip. 'best_available' never makes a chip. null when there is nothing to say.
 */
export function dayChip(meal: PlannedMeal, ctx: PhraseContext): PlanChip | null {
  const [first] = [...stateChips(meal), ...leftoverChip(meal), ...whyChips(meal, ctx)]
  return first ?? null
}

/**
 * The chips of the Planned Meal sheet (rule: at most 3, overflow becomes a count chip "+N"): states first (Cooked,
 * Not cooked, Pinned), then the Leftover chip, then the why chips. No duplicates by label. The relaxed chip (ADR 0009)
 * is always visible: it takes the last visible place, and the overflow counts what did not fit.
 */
export function sheetChips(meal: PlannedMeal, ctx: PhraseContext): { chips: PlanChip[]; overflow: number } {
  const { positive, relaxed } = whyChipsSplit(meal, ctx)
  const base = dedupe([...stateChips(meal), ...leftoverChip(meal), ...positive])
  if (relaxed.length === 0) return { chips: base.slice(0, SHEET_LIMIT), overflow: Math.max(0, base.length - SHEET_LIMIT) }
  const shown = [...base.slice(0, SHEET_LIMIT - 1), relaxed[0]!]
  return { chips: shown, overflow: base.length + relaxed.length - shown.length }
}

/** The why chips of the Today hero (rule: at most 2), most relevant first; a relaxed chip comes after the positive ones. */
export function heroChips(meal: PlannedMeal, ctx: PhraseContext): PlanChip[] {
  return whyChips(meal, ctx).slice(0, HERO_LIMIT)
}

function dedupe(chips: PlanChip[]): PlanChip[] {
  const seen = new Set<string>()
  return chips.filter((c) => {
    if (seen.has(c.label)) return false
    seen.add(c.label)
    return true
  })
}
