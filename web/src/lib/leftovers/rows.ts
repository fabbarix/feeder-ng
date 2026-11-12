// View models for Leftover rows and choices (no React). STUB (red).
import type { IconName } from '../../ui/icons'
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
}

/** Today's Leftovers tile: the questions first (oldest Use-by first), then the not frozen Leftovers (soonest Use-by first). */
export function tileRows(_leftovers: Leftover[], _today: string): LeftoverRowModel[] {
  return []
}

/** The row menu: Had it, Threw it out, then Freeze it (before the Use-by, not frozen) or Take out (frozen). None for a question. */
export function menuActions(_l: Leftover, _today: string): LeftoverActionKind[] {
  return []
}

export function actionLabel(_kind: LeftoverActionKind): string {
  return ''
}

export interface FreezerChoice {
  leftoverId: number
  recipeId: number
  recipeName: string
  /** "3 portions · Garage Freezer" ("Not sorted" without a place). */
  meta: string
}

/** Choose a Recipe, "From the freezer": frozen Leftovers with portions, by Recipe name. */
export function freezerChoices(_leftovers: Leftover[]): FreezerChoice[] {
  return []
}
