// hf-recipes-filter: the rows of the Tag list in the Filters panel (docs/design/recipes-filter.md 6). Plain TypeScript, no React, no
// copy of its own. Kept apart from recipeFilters.ts so the Tag search hook can import it without a literal that names the filters.
import { tagKey } from './keys'
import type { TagCount } from '../types'

export interface TagFilterRow {
  name: string
  recipes: number
  colour?: string
  selected: boolean
}

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/** Lower case, accents stripped, collapsed spaces: the form search compares. */
function normalise(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')
}

/**
 * The rows of the Tag list: the Tags whose name holds every word of `query` (accents and case ignored). The selected Tags
 * (matched by key, listed even when not known) come first, in the order chosen, then the others by name.
 */
export function tagFilterRows(known: readonly TagCount[], selected: readonly string[], query: string, colourOf?: (name: string) => string | undefined): TagFilterRow[] {
  const words = normalise(query).split(' ').filter(Boolean)
  const matches = (name: string) => {
    const haystack = normalise(name)
    return words.every((w) => haystack.includes(w))
  }
  const selectedKeys: string[] = []
  const rows: TagFilterRow[] = []
  for (const s of selected) {
    const key = tagKey(s)
    if (key === '' || selectedKeys.includes(key)) continue
    selectedKeys.push(key)
    const found = known.find((t) => tagKey(t.name) === key)
    const name = found?.name ?? s.trim()
    if (matches(name)) rows.push({ name, recipes: found?.recipes ?? 0, colour: colourOf?.(name), selected: true })
  }
  const others = known.filter((t) => !selectedKeys.includes(tagKey(t.name)))
  for (const t of [...others].sort((a, b) => collator.compare(a.name, b.name))) {
    if (matches(t.name)) rows.push({ name: t.name, recipes: t.recipes, colour: colourOf?.(t.name), selected: false })
  }
  return rows
}
