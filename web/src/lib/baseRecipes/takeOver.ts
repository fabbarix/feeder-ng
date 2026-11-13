import type { ApiError } from '../http'
import type { TakeOverAsk } from './types'

// BR-D (ADR 0015 point 1, design §3.2): the take-over ask. Pure.

/** The ask carried by a 409 `base_recipe_take_over` ApiError (details: ingredient, recipes, stockLots, convertible); null for any other error. */
export function parseTakeOver(err: unknown): TakeOverAsk | null {
  void (err as ApiError)
  throw new Error('BR-D: not implemented')
}

export interface TakeOverDialogModel {
  title: string
  /** Paragraphs: who calls for it and what Stock it has; then what Yes does; then what No does. */
  body: string[]
  yesLabel: 'Yes'
  noLabel: 'No'
  /** Yes is disabled (the Yield's unit does not convert to the Ingredient's Base Unit) and this says why; undefined when Yes works. */
  yesDisabledReason?: string
}

/**
 * Title "Use the Ingredient béchamel for Béchamel?". First paragraph names the Recipes ("Lasagne and Moussaka"; "Lasagne, Moussaka and Cannelloni";
 * more than three: "Lasagne, Moussaka, Cannelloni and 2 more") and the Stock ("1 Stock Lot of it is in the Pantry" / "2 Stock Lots ..." / none: "It has no Stock").
 * No Recipe: "No Recipe calls for it".
 */
export function takeOverDialog(ask: TakeOverAsk, baseName: string): TakeOverDialogModel {
  void ask; void baseName
  throw new Error('BR-D: not implemented')
}
