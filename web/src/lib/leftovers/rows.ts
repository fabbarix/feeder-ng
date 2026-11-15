// View models for Leftover rows and choices (no React).
import type { IconName } from '../../ui/icons'
import { dayDiff, weekdayShort } from './dates'
import { leftoverStrings, portionsLabel, questionText, useByPhrase } from './copy'
import type { Leftover, LeftoverActionKind } from './types'

export type LeftoverRowKind = 'question' | 'leftover' | 'frozen'

export interface LeftoverRowModel {
  id: number
  kind: LeftoverRowKind
  recipeName: string
  /** The question text for a question; "Use by Thu · 3 portions" otherwise (DS 5: the Use-by leads, so it survives a cut). */
  text: string
  tone: 'info' | 'spoil' | 'leftover'
  icon: IconName
  /** B9-45 (PC-13): every Leftover the row stands for, soonest first (one for a Leftover on its own). */
  ids?: number[]
  /** B9-45 (PC-13): spareHint, the second meta line; absent when nothing is planned. */
  hint?: string
  /** A frozen question names its Storage Place ("Not sorted" without one), so it is not hidden in the Pantry. */
  badge?: string
}

const byUseBy = (a: Leftover, b: Leftover) => a.useBy.localeCompare(b.useBy) || a.id - b.id

/** One row for a Leftover: a question while it is to be answered, else a Leftover (frozen or not). */
export function leftoverRow(l: Leftover, today: string): LeftoverRowModel {
  if (l.toAnswer) {
    const badge = l.frozen ? (l.storagePlaceName ?? leftoverStrings.notSorted) : undefined
    return { id: l.id, kind: 'question', recipeName: l.recipeName, text: questionText(l.recipeName, l.useBy, today), tone: 'info', icon: 'question', badge }
  }
  const soon = dayDiff(l.useBy, today) <= 1
  return {
    id: l.id,
    kind: l.frozen ? 'frozen' : 'leftover',
    recipeName: l.recipeName,
    text: `${useByPhrase(l.useBy, today)} · ${portionsLabel(l.portions)}`,
    tone: soon ? 'spoil' : 'leftover',
    icon: l.frozen ? 'snowflake' : 'leftover',
  }
}

/**
 * Today's Leftovers tile: the questions first (frozen ones before the others, since they need a trip to the freezer; each
 * group oldest Use-by first), then the not frozen Leftovers (soonest Use-by first). Frozen Leftovers that are not to answer stay on the Pantry.
 */
/**
 * B9-45 (PC-13, decision PC 7): Leftovers of one Recipe with the same Use-by are one row (mergeRows), with every id and, when some is
 * planned for, the spare hint ("1.25 for Mon Dinner · 1.25 spare: have it or freeze it"). `plannedFor` names the Planned Meals each
 * Leftover is planned for, by Leftover id.
 */
export function tileRows(leftovers: Leftover[], today: string, plannedFor: Record<number, string[]> = {}): LeftoverRowModel[] {
  const shown = leftovers.filter((l) => !l.frozen || l.toAnswer)
  const frozenQuestions = shown.filter((l) => l.toAnswer && l.frozen).sort(byUseBy)
  const questions = shown.filter((l) => l.toAnswer && !l.frozen).sort(byUseBy)
  const rest = mergeRows(shown.filter((l) => !l.toAnswer)).sort(byUseBy)
  const asked = [...frozenQuestions, ...questions].map((l) => ({ ...leftoverRow(l, today), ids: [l.id] }))
  const kept = rest.map((l) => {
    const names = [...new Set(l.ids.flatMap((id) => plannedFor[id] ?? []))]
    const hint = spareHint(l.portions, l.plannedPortions, names)
    return { ...leftoverRow(l, today), ids: l.ids, ...(hint ? { hint } : {}) }
  })
  return [...asked, ...kept]
}

/** The row menu: Had it, Threw it out, then Freeze it (before the Use-by, not frozen) or Take out (frozen). None for a question. */
export function menuActions(l: Leftover, today: string): LeftoverActionKind[] {
  if (l.toAnswer) return []
  const actions: LeftoverActionKind[] = ['had-it', 'threw-out']
  if (l.frozen) actions.push('take-out')
  else if (dayDiff(l.useBy, today) >= 0) actions.push('freeze')
  return actions
}

export function actionLabel(kind: LeftoverActionKind): string {
  switch (kind) {
    case 'had-it':
      return leftoverStrings.hadIt
    case 'threw-out':
      return leftoverStrings.threwOut
    case 'freeze':
      return leftoverStrings.freezeIt
    case 'take-out':
      return leftoverStrings.takeOut
  }
}

export interface FreezerChoice {
  leftoverId: number
  recipeId: number
  recipeName: string
  /** "3 portions · Garage Freezer" ("Not sorted" without a place). */
  meta: string
}

/**
 * Choose a Recipe, "From the freezer": frozen Leftovers with portions that are not to answer (past their Use-by the server
 * refuses them), by Recipe name. With `recipeIds`, only the Leftovers of those Recipes (the Recipes the chooser offers).
 */
export function freezerChoices(leftovers: Leftover[], recipeIds?: ReadonlySet<number>): FreezerChoice[] {
  return leftovers
    .filter((l) => l.frozen && !l.toAnswer && l.portions > 0 && (recipeIds === undefined || recipeIds.has(l.recipeId)))
    .sort((a, b) => a.recipeName.localeCompare(b.recipeName) || a.id - b.id)
    .map((l) => ({
      leftoverId: l.id,
      recipeId: l.recipeId,
      recipeName: l.recipeName,
      meta: `${portionsLabel(l.portions)} · ${l.storagePlaceName ?? leftoverStrings.notSorted}`,
    }))
}

// ---- B9-45 (PC-13): Leftovers of one Recipe with the same Use-by are one row. ----

/** Several Leftovers shown as one row: portions and planned portions summed, `id` the soonest member's, `ids` every member soonest first. */
export interface MergedLeftover extends Leftover {
  ids: number[]
}

const tidy = (n: number) => Math.round(n * 100) / 100
const soonest = (a: Leftover, b: Leftover) => a.cookedOn.localeCompare(b.cookedOn) || a.id - b.id
const mergeKey = (l: Leftover): string | null =>
  l.toAnswer ? null : [l.recipeId, l.useBy, l.frozen ? `frozen:${l.storagePlaceId ?? 'none'}` : 'fresh'].join('|')

/**
 * One entry per Recipe and Use-by. Frozen and not frozen stay apart; frozen ones in different Storage Places stay apart; a Leftover that is to
 * answer (a question) is never merged. Members are ordered soonest first (cooked earliest, then lowest id); the entries keep the order of
 * their first member in `leftovers`. A Leftover on its own comes back with `ids: [id]`.
 */
export function mergeRows(leftovers: Leftover[]): MergedLeftover[] {
  const groups: Leftover[][] = []
  const byKey = new Map<string, Leftover[]>()
  for (const l of leftovers) {
    const key = mergeKey(l)
    const group = key === null ? undefined : byKey.get(key)
    if (group) group.push(l)
    else {
      const fresh = [l]
      groups.push(fresh)
      if (key !== null) byKey.set(key, fresh)
    }
  }
  return groups.map((members) => {
    const sorted = [...members].sort(soonest)
    const first = sorted[0]!
    return {
      ...first,
      portions: tidy(sorted.reduce((n, m) => n + m.portions, 0)),
      plannedPortions: tidy(sorted.reduce((n, m) => n + m.plannedPortions, 0)),
      ids: sorted.map((m) => m.id),
    }
  })
}

/** Splits `portions` over the members of a merged row, soonest first: [{ leftoverId, portions }] (the last may take part of its portions). */
export function takeFromSoonest(members: Leftover[], portions: number): { leftoverId: number; portions: number }[] {
  const out: { leftoverId: number; portions: number }[] = []
  let rest = portions
  for (const m of [...members].sort(soonest)) {
    if (rest <= 0) break
    const take = tidy(Math.min(m.portions, rest))
    if (take > 0) out.push({ leftoverId: m.id, portions: take })
    rest = tidy(rest - take)
  }
  return out
}

const n = (x: number) => String(tidy(x))
const joinMeals = (names: string[]) => (names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)

/**
 * The second meta line of a Leftover that is planned for: "1.25 for Mon Dinner · 1.25 spare: have it or freeze it" (some spare),
 * "Planned for Sun Dinner" (all of it is planned); null when nothing is planned. Without meal names: "a planned meal".
 */
export function spareHint(left: number, plannedPortions: number, plannedFor: string[]): string | null {
  if (plannedPortions <= 0) return null
  const meals = plannedFor.length > 0 ? joinMeals(plannedFor) : 'a planned meal'
  const spare = tidy(left - plannedPortions)
  if (spare <= 0) return `Planned for ${meals}`
  return `${n(plannedPortions)} for ${meals} · ${n(spare)} spare: have it or freeze it`
}

/** The slots as the plan view holds them (structural, so this pure module needs nothing of the plan feature). */
export interface PlannedForSlot {
  date: string
  name: string
  courses?: { meal?: { servedFromLeftover?: { leftoverId: number | null } | null; state?: string } | null }[]
}

/** B9-45 (PC-13): the Planned Meals each Leftover is planned for, by Leftover id ("Mon Dinner"), in plan order, still to eat only. */
export function plannedForNames(slots: PlannedForSlot[]): Record<number, string[]> {
  const out: Record<number, string[]> = {}
  for (const slot of slots) {
    for (const course of slot.courses ?? []) {
      const id = course.meal?.servedFromLeftover?.leftoverId
      if (id === null || id === undefined || (course.meal?.state !== undefined && course.meal.state !== 'planned')) continue
      const label = `${weekdayShort(slot.date)} ${slot.name}`
      const names = (out[id] ??= [])
      if (!names.includes(label)) names.push(label)
    }
  }
  return out
}

/** The names of the Planned Meals a (merged) Leftover is planned for. */
export function plannedForOf(plannedFor: Record<number, string[]>, leftover: Leftover & { ids?: number[] }): string[] {
  return [...new Set((leftover.ids ?? [leftover.id]).flatMap((id) => plannedFor[id] ?? []))]
}
