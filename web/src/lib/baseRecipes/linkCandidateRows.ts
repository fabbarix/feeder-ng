import type { LinkCandidate, LinkCandidateRow } from './types'

// BR-D (design §3.8): the rows, the heading and the counts of the LinkCandidatesSheet. Pure.

export interface LinkContext {
  /** The Base recipe's name ("Béchamel"). */
  baseName: string
  /** The Base Unit of the Base recipe's Ingredient ("ml"), for the reason of an unconvertible unit. */
  baseUnit: string
}

function reasonOf(line: LinkCandidate, ctx: LinkContext): string | undefined {
  if (line.linkable) return undefined
  if (line.reason === 'unit_unconvertible') return `${line.unit} cannot be converted to ${ctx.baseUnit} yet: link it from ${line.recipeName}`
  if (line.reason === 'cycle') return `${ctx.baseName} already calls for ${line.recipeName}`
  return 'This line cannot be linked yet'
}

/**
 * One row per candidate, in the server's order. label "Lasagne · 500 ml béchamel". Nothing is ticked unless its lineId is in `ticked`;
 * a disabled row is never checked (even if its id is in `ticked`). Reasons: unit_unconvertible -> "cup cannot be converted to ml yet: link it from Moussaka";
 * cycle -> "Béchamel already calls for Lasagne".
 */
export function linkCandidateRows(lines: readonly LinkCandidate[], ctx: LinkContext, ticked: ReadonlySet<number>): LinkCandidateRow[] {
  return lines.map((line) => {
    const reason = reasonOf(line, ctx)
    const disabled = !line.linkable
    return {
      lineId: line.lineId,
      recipeId: line.recipeId,
      label: `${line.recipeName} · ${line.quantity} ${line.unit} ${line.ingredientName}`,
      archived: line.archived,
      checked: !disabled && ticked.has(line.lineId),
      disabled,
      ...(reason !== undefined ? { reason } : {}),
    }
  })
}

/** "3 Recipes use an Ingredient named béchamel. Link them to this Base recipe?" / "1 Recipe uses an Ingredient named béchamel. Link it to this Base recipe?" (n = distinct Recipes). */
export function linkHeading(recipeCount: number, ingredientName: string): string {
  if (recipeCount === 1) return `1 Recipe uses an Ingredient named ${ingredientName}. Link it to this Base recipe?`
  return `${recipeCount} Recipes use an Ingredient named ${ingredientName}. Link them to this Base recipe?`
}

/** The ticked lines that can be linked, in row order (disabled ones never count). */
export function tickedLineIds(rows: readonly LinkCandidateRow[]): number[] {
  return rows.filter((r) => r.checked && !r.disabled).map((r) => r.lineId)
}

/** "Link" with nothing ticked (the button is disabled), "Link 2" otherwise. */
export function linkLabel(tickedCount: number): string {
  return tickedCount > 0 ? `Link ${tickedCount}` : 'Link'
}

/** The toast after a bulk link: "Linked 2 Recipes" / "Linked 1 Recipe" (distinct Recipes of the linked lines). */
export function linkedToast(recipeCount: number): string {
  return recipeCount === 1 ? 'Linked 1 Recipe' : `Linked ${recipeCount} Recipes`
}

/** The row's tick toggled; a disabled or unknown row changes nothing. Returns a new Set. */
export function toggleTick(ticked: ReadonlySet<number>, lineId: number, rows: readonly LinkCandidateRow[]): Set<number> {
  const next = new Set(ticked)
  const row = rows.find((r) => r.lineId === lineId)
  if (!row || row.disabled) return next
  if (next.has(lineId)) next.delete(lineId)
  else next.add(lineId)
  return next
}
