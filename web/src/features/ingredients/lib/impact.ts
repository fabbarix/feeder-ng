// B9-48 (SAFE-02): what Delete Ingredient / Delete Supply and Merge show of an Ingredient's impact, as rows (R-E), never sentences.
// GET /api/ingredients/{id}/impact answers { references: { <mover>: n }, total: n }. Plain TypeScript, no React.
import type { ConfirmGroup, ConfirmOptions, ConfirmRow } from '../../../ui'
import { strings } from '../strings'
import type { IngredientImpact, IngredientKind } from '../types'
import { wordsFor } from './kind'
import { displayName } from './names'

/** The movers this build knows, in the order the rows show them, with their Household words. */
const KNOWN: ReadonlyArray<readonly [string, string]> = [
  ['recipe lines', 'Recipe lines'],
  ['products', 'Products'],
  ['stock lots', 'Stock Lots'],
  ['shopping list', 'Shopping List'],
  ['ingredient exclusions', 'Exclusions'],
  ['scan events', 'Scans'],
  ['bought Planned Meals', 'Bought Planned Meals'],
]

/** One row per mover with a count above 0: known movers first in a fixed order, then unknown ones by name, capitalised. */
export function impactRows(references: Record<string, number>): ConfirmRow[] {
  const known = new Map(KNOWN)
  const rows: ConfirmRow[] = []
  for (const [mover, label] of KNOWN) {
    const n = references[mover] ?? 0
    if (n > 0) rows.push({ key: label, state: String(n) })
  }
  const unknown = Object.keys(references)
    .filter((mover) => !known.has(mover) && (references[mover] ?? 0) > 0)
    .sort()
  for (const mover of unknown) rows.push({ key: displayName(mover), state: String(references[mover]) })
  return rows
}

/** True when the impact read says something still uses the Ingredient (then it cannot be deleted, only merged). */
export function isInUse(impact: IngredientImpact | undefined): boolean {
  return impact !== undefined && impactRows(impact.references).length > 0
}

/**
 * The Delete confirm. Nothing uses it: a danger confirm whose lead says so. Still in use (the page was stale): the title
 * "<Name> is still used" (batch w3e ruling; the page opens the dialog only once the read has answered, so it never jumps), the
 * places as "Used by" rows, and the way forward instead of a Delete that would only be refused: Close and "Merge into another
 * Ingredient" (user decision, B9-48). While the read is out: no claim about its use.
 */
export function deleteConfirm(kind: IngredientKind, name: string, impact: IngredientImpact | undefined): ConfirmOptions {
  const words = wordsFor(kind)
  const title = strings.deleteConfirm(displayName(name))
  if (impact !== undefined && isInUse(impact)) {
    const rows = impactRows(impact.references)
    return {
      title: strings.stillUsed(displayName(name)),
      body: strings.impact.usedIn(impact.total),
      groups: [{ label: strings.impact.usedBy, rows }],
      note: strings.impact.mergeInstead(kind),
      confirmLabel: words.mergeInto,
      cancelLabel: strings.impact.close,
      tone: 'default',
      icon: 'error',
    }
  }
  return {
    title,
    body: impact === undefined ? undefined : strings.impact.unused,
    groups: [],
    note: strings.impact.cannotUndo,
    confirmLabel: words.deleteLabel,
    tone: 'danger',
  }
}

/** The merge step's "Moves to <target>" rows; null when nothing moves. */
export function mergeMovesGroup(targetName: string, sourceReferences: Record<string, number>): ConfirmGroup | null {
  const rows = impactRows(sourceReferences)
  return rows.length === 0 ? null : { label: strings.impact.movesTo(displayName(targetName)), rows }
}
