// View models for Leftover rows and choices (no React).
import type { IconName } from '../../ui/icons'
import { dayDiff } from './dates'
import { leftoverStrings, portionsLabel, questionText, useByPhrase } from './copy'
import type { Leftover, LeftoverActionKind } from './types'

export type LeftoverRowKind = 'question' | 'leftover' | 'frozen'

export interface LeftoverRowModel {
  id: number
  kind: LeftoverRowKind
  recipeName: string
  /** The question text for a question; "3 portions · Use by Thu" otherwise. */
  text: string
  tone: 'info' | 'spoil' | 'leftover'
  icon: IconName
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
    text: `${portionsLabel(l.portions)} · ${useByPhrase(l.useBy, today)}`,
    tone: soon ? 'spoil' : 'leftover',
    icon: l.frozen ? 'snowflake' : 'leftover',
  }
}

/**
 * Today's Leftovers tile: the questions first (frozen ones before the others, since they need a trip to the freezer; each
 * group oldest Use-by first), then the not frozen Leftovers (soonest Use-by first). Frozen Leftovers that are not to answer stay on the Pantry.
 */
export function tileRows(leftovers: Leftover[], today: string): LeftoverRowModel[] {
  const shown = leftovers.filter((l) => !l.frozen || l.toAnswer)
  const frozenQuestions = shown.filter((l) => l.toAnswer && l.frozen).sort(byUseBy)
  const questions = shown.filter((l) => l.toAnswer && !l.frozen).sort(byUseBy)
  const rest = shown.filter((l) => !l.toAnswer).sort(byUseBy)
  return [...frozenQuestions, ...questions, ...rest].map((l) => leftoverRow(l, today))
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
