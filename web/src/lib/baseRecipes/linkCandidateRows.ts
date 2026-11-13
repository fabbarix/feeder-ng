import type { LinkCandidate, LinkCandidateRow } from './types'

// BR-D (design §3.8): the rows, the heading and the counts of the LinkCandidatesSheet. Pure.

export interface LinkContext {
  /** The Base recipe's name ("Béchamel"). */
  baseName: string
  /** The Base Unit of the Base recipe's Ingredient ("ml"), for the reason of an unconvertible unit. */
  baseUnit: string
}

/**
 * One row per candidate, in the server's order. label "Lasagne · 500 ml béchamel". Nothing is ticked unless its lineId is in `ticked`;
 * a disabled row is never checked (even if its id is in `ticked`). Reasons: unit_unconvertible -> "cup cannot be converted to ml yet: link it from Moussaka";
 * cycle -> "Béchamel already calls for Lasagne".
 */
export function linkCandidateRows(lines: readonly LinkCandidate[], ctx: LinkContext, ticked: ReadonlySet<number>): LinkCandidateRow[] {
  void lines; void ctx; void ticked
  throw new Error('BR-D: not implemented')
}

/** "3 Recipes use an Ingredient named béchamel. Link them to this Base recipe?" / "1 Recipe uses an Ingredient named béchamel. Link it to this Base recipe?" (n = distinct Recipes). */
export function linkHeading(recipeCount: number, ingredientName: string): string {
  void recipeCount; void ingredientName
  throw new Error('BR-D: not implemented')
}

/** The ticked lines that can be linked, in row order (disabled ones never count). */
export function tickedLineIds(rows: readonly LinkCandidateRow[]): number[] {
  void rows
  throw new Error('BR-D: not implemented')
}

/** "Link" with nothing ticked (the button is disabled), "Link 2" otherwise. */
export function linkLabel(tickedCount: number): string {
  void tickedCount
  throw new Error('BR-D: not implemented')
}

/** The toast after a bulk link: "Linked 2 Recipes" / "Linked 1 Recipe" (distinct Recipes of the linked lines). */
export function linkedToast(recipeCount: number): string {
  void recipeCount
  throw new Error('BR-D: not implemented')
}

/** The row's tick toggled; a disabled or unknown row changes nothing. Returns a new Set. */
export function toggleTick(ticked: ReadonlySet<number>, lineId: number, rows: readonly LinkCandidateRow[]): Set<number> {
  void ticked; void lineId; void rows
  throw new Error('BR-D: not implemented')
}
