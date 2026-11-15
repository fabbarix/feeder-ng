import type { TagCount } from '../types'
import { tagKey } from './keys'

// B9-37 (RX-09): what the Tag chooser lists for a query and whether it offers "Add Tag". Pure; useTagChooser and TagChooser call it.

export interface ChooserRow {
  name: string
  /** How many Recipes carry the Tag (0 for a new one). */
  recipes: number
  chosen: boolean
}

const byName = (a: ChooserRow, b: ChooserRow) => a.name.localeCompare(b.name)

/**
 * The rows for `query`: every known Tag plus the chosen ones no one has saved yet, matched by tagKey (case and spacing aside), chosen
 * first, then the others, each group by name. `create` is the typed words (trimmed, spaces collapsed) while they match no row exactly;
 * null for a blank query.
 */
export function chooserRows(known: readonly TagCount[], chosen: readonly string[], query: string): { rows: ChooserRow[]; create: string | null } {
  const chosenKeys = new Set(chosen.map(tagKey))
  const knownKeys = new Set(known.map((t) => tagKey(t.name)))
  const all: ChooserRow[] = [
    ...known.map((t) => ({ name: t.name, recipes: t.recipes, chosen: chosenKeys.has(tagKey(t.name)) })),
    ...chosen.filter((name, i) => !knownKeys.has(tagKey(name)) && chosen.findIndex((n) => tagKey(n) === tagKey(name)) === i).map((name) => ({ name, recipes: 0, chosen: true })),
  ]
  const q = tagKey(query)
  const matching = q === '' ? all : all.filter((r) => tagKey(r.name).includes(q))
  const rows = [...matching.filter((r) => r.chosen).sort(byName), ...matching.filter((r) => !r.chosen).sort(byName)]
  const typed = query.trim().split(/\s+/).join(' ')
  const create = q === '' || all.some((r) => tagKey(r.name) === q) ? null : typed
  return { rows, create }
}
