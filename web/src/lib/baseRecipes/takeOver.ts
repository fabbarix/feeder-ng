import { ApiError } from '../http'
import { joinNames } from './refusals'
import type { TakeOverAsk } from './types'

// BR-D (ADR 0015 point 1, design §3.2): the take-over ask. Pure.

/** The ask carried by a 409 `base_recipe_take_over` ApiError (details: ingredient, recipes, stockLots, convertible, keptLines); null for any other error. */
export function parseTakeOver(err: unknown): TakeOverAsk | null {
  if (!(err instanceof ApiError) || err.code !== 'base_recipe_take_over') return null
  const d = err.details as { ingredient: { id: number; name: string }; recipes?: Array<{ id: number; name: string }>; stockLots?: number; convertible?: boolean; keptLines?: number }
  return {
    ingredient: { id: d.ingredient.id, name: d.ingredient.name },
    recipes: (d.recipes ?? []).map((r) => ({ id: r.id, name: r.name })),
    stockLots: d.stockLots ?? 0,
    convertible: d.convertible ?? true,
    // Carried only when the answer has it (beta.8): the editor's and older answers have none.
    ...(d.keptLines === undefined ? {} : { keptLines: d.keptLines }),
  }
}

/**
 * beta.8: "1 other line in this import stays an Ingredient. With Yes it uses Béchamel too; with No it keeps the Ingredient." (several: "3 other lines ...
 * stay ... With Yes they use ...; with No they keep ..."). Null when no other line stays an Ingredient.
 */
export function keptLinesNote(keptLines: number | undefined, baseName: string): string | null {
  if (!keptLines || keptLines <= 0) return null
  if (keptLines === 1) return `1 other line in this import stays an Ingredient. With Yes it uses ${baseName} too; with No it keeps the Ingredient.`
  return `${keptLines} other lines in this import stay an Ingredient. With Yes they use ${baseName} too; with No they keep the Ingredient.`
}

export interface TakeOverDialogModel {
  title: string
  /** Paragraphs: who calls for it and what Stock it has; then what Yes does; then what No does. */
  body: string[]
  yesLabel: string
  noLabel: string
  /** Yes is disabled (the Yield's unit does not convert to the Ingredient's Base Unit) and this says why; undefined when Yes works. */
  yesDisabledReason?: string
  /** beta.8: what Yes and No do to the other lines of the import that stay Ingredient lines; undefined when there are none. */
  note?: string
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
    title: `${baseName} (Base recipe) has the name of an Ingredient. Take it over?`,
    body: [
      first,
      `Yes: ${baseName} takes this Ingredient over. Its Stock and its Recipes carry over, and every line of ${ask.ingredient.name} becomes a ${baseName} line.`,
      `No: ${baseName} gets its own Ingredient, and the plain ${ask.ingredient.name} stays as it is. You link its lines one by one or in a list. The Base recipe badge tells them apart.`,
    ],
    yesLabel: 'Yes, take it over',
    noLabel: 'No, keep it apart',
  }
  const note = keptLinesNote(ask.keptLines, baseName)
  if (note) model.note = note
  if (!ask.convertible) model.yesDisabledReason = `The Yield's unit cannot be converted to ${ask.ingredient.name} yet.`
  return model
}
