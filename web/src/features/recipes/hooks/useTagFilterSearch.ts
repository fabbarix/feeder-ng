// hf-recipes-filter: the search and the rows of the Tag list in the Filters panel (docs/design/recipes-filter.md 5.5, 6).
import { useState } from 'react'
import { tagFilterRows, type TagFilterRow } from '../lib/recipeFilters'
import type { TagCount } from '../types'

export interface UseTagFilterSearch {
  query: string
  setQuery(query: string): void
  rows: TagFilterRow[]
  /** What the list says in place of its rows: nothing matches, or there is no Tag yet; null while there are rows. */
  emptyText: string | null
}

export function useTagFilterSearch(known: readonly TagCount[], selected: string, colourOf?: (name: string) => string | undefined): UseTagFilterSearch {
  const [query, setQuery] = useState('')
  const rows = tagFilterRows(known, selected, query, colourOf)
  const typed = query.trim()
  let emptyText: string | null = null
  if (rows.length === 0) emptyText = typed !== '' ? `No Tag matches '${typed}'` : 'No Tag to choose from'
  return { query, setQuery, rows, emptyText }
}
