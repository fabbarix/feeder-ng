import { ApiError } from '../http'
import { joinNames } from './refusals'
import type { TakeOverAsk } from './types'

// BR-D (ADR 0015 point 1, design §3.2): the take-over ask. Pure.

/** The ask carried by a 409 `base_recipe_take_over` ApiError (details: ingredient, recipes, stockLots, convertible); null for any other error. */
export function parseTakeOver(err: unknown): TakeOverAsk | null {
  if (!(err instanceof ApiError) || err.code !== 'base_recipe_take_over') return null
  const d = err.details as { ingredient: { id: number; name: string }; recipes?: Array<{ id: number; name: string }>; stockLots?: number; convertible?: boolean }
  return {
    ingredient: { id: d.ingredient.id, name: d.ingredient.name },
    recipes: (d.recipes ?? []).map((r) => ({ id: r.id, name: r.name })),
    stockLots: d.stockLots ?? 0,
    convertible: d.convertible ?? true,
  }
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

/** "Lasagne and Moussaka"; more than three: "Lasagne, Moussaka, Cannelloni and 2 more". */
function recipeList(names: string[]): string {
  if (names.length <= 3) return joinNames(names)
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`
}

/**
 * Title "Use the Ingredient béchamel for Béchamel?". First paragraph names the Recipes ("Lasagne and Moussaka"; "Lasagne, Moussaka and Cannelloni";
 * more than three: "Lasagne, Moussaka, Cannelloni and 2 more") and the Stock ("1 Stock Lot of it is in the Pantry" / "2 Stock Lots ..." / none: "It has no Stock").
 * No Recipe: "No Recipe calls for it".
 */
export function takeOverDialog(ask: TakeOverAsk, baseName: string): TakeOverDialogModel {
  const n = ask.recipes.length
  const head = n === 0 ? 'No Recipe calls for it' : `${recipeList(ask.recipes.map((r) => r.name))} ${n === 1 ? 'calls' : 'call'} for it`
  const first =
    ask.stockLots > 0
      ? `${head}, and ${ask.stockLots === 1 ? '1 Stock Lot of it is in the Pantry' : `${ask.stockLots} Stock Lots of it are in the Pantry`}.`
      : `${head}. It has no Stock.`
  const model: TakeOverDialogModel = {
    title: `Use the Ingredient ${ask.ingredient.name} for ${baseName}?`,
    body: [
      first,
      `Yes: ${baseName} takes this Ingredient over. Its Stock and its Recipes carry over, and every line of ${ask.ingredient.name} becomes a ${baseName} line.`,
      `No: ${baseName} gets its own Ingredient, and the plain ${ask.ingredient.name} stays as it is. You link its lines one by one or in a list. An Ingredient named ${ask.ingredient.name} can still be added.`,
    ],
    yesLabel: 'Yes',
    noLabel: 'No',
  }
  if (!ask.convertible) model.yesDisabledReason = `The Yield's unit cannot be converted to ${ask.ingredient.name} yet.`
  return model
}
