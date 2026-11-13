// hf-recipes-filter: the Tag filter of the Filters panel: a searchable list of every Tag with its colour and Recipe count (docs/design/recipes-filter.md 4, 5.3).
import type { ReactNode } from 'react'
import { OptionList, TagDot } from '../../../ui'
import { tagColourStrings } from '../../../ui/TagColour/strings'
import { useTagFilterSearch } from '../hooks/useTagFilterSearch'
import { recipeStrings } from '../strings'
import type { TagCount } from '../types'

export interface TagFilterListProps {
  known: TagCount[]
  /** The Tag in force, '' for none. */
  selected: string
  colourOf?: (name: string) => string | undefined
  /** Choosing a Tag (the one in force again clears it). */
  onSelect: (name: string) => void
}

export function TagFilterList({ known, selected, colourOf, onSelect }: TagFilterListProps): ReactNode {
  const { query, setQuery, rows, emptyText } = useTagFilterSearch(known, selected, colourOf)
  const options = rows.map((r) => ({
    value: r.name,
    label: r.name,
    meta: tagColourStrings.recipes(r.recipes),
    leading: <TagDot colour={r.colour} />,
  }))
  return (
    <OptionList<string>
      label={recipeStrings.filters.tagListLabel}
      searchLabel={recipeStrings.filters.tagSearch}
      query={query}
      onQueryChange={setQuery}
      options={options}
      selected={rows.filter((r) => r.selected).map((r) => r.name)}
      onToggle={onSelect}
      emptyText={emptyText}
    />
  )
}
