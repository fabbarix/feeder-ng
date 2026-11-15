// B9-27 (SAFE-05, ruling 3): the words of the Recipe detail's Delete dialogs. Plain TypeScript.
import type { ConfirmOptions } from '../../../ui/ConfirmDialog'
import { recipeStrings } from '../strings'
import type { DeleteBlockedBy, RecipeRef } from '../types'

/** How many Recipes the "can't be deleted" dialog of a Base recipe in use lists before "and N more". */
export const IN_USE_ROWS = 5

/** The danger dialog of a Recipe that can be deleted: "Nobody has planned it yet.", Cancel, Archive instead, Delete. */
export function deleteDialog(name: string): ConfirmOptions {
  const d = recipeStrings.deleteDialog
  return { title: d.title(name), body: d.body, note: d.note, tone: 'danger', confirmLabel: d.confirm, alternateLabel: d.alternate }
}

/**
 * "<Name> can't be deleted", Cancel (focused) and Archive, no Close. Planned before: why, and what Archive does. A Base recipe in use:
 * "It is used in N Recipes." and those Recipes as rows (up to IN_USE_ROWS, an archived one says so), then "and N more".
 */
export function blockedDialog(name: string, reason: DeleteBlockedBy, usedBy: readonly RecipeRef[] = []): ConfirmOptions {
  const b = recipeStrings.deleteBlocked
  if (reason === 'planned') return { title: b.title(name), body: b.planned, note: b.note, confirmLabel: b.archive }
  const u = recipeStrings.inUse
  const rows = usedBy.slice(0, IN_USE_ROWS).map((r) => ({ key: r.name, state: r.archived ? u.archived : undefined }))
  const rest = usedBy.length - rows.length
  return {
    title: b.title(name),
    body: u.lead(usedBy.length),
    groups: [{ label: u.rowsLabel, rows }],
    note: rest > 0 ? u.more(rest) : undefined,
    confirmLabel: b.archive,
  }
}
