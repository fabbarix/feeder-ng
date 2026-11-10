import type { ReactNode } from 'react'
import { Chip } from '../../../ui'
import { tagKey } from '../lib/keys'
import { recipeStrings } from '../strings'
import type { TagCount } from '../types'

export interface TagChipsProps {
  tags: TagCount[]
  /** The Tag filter in use (its name), '' for all Recipes. */
  selected: string
  onSelect: (name: string) => void
}

/** The Tag filter of the Recipes list: one horizontally scrolling group of filter Chips, "All Tags" first. */
export function TagChips({ tags, selected, onSelect }: TagChipsProps): ReactNode {
  const selectedKey = selected ? tagKey(selected) : ''
  return (
    <div role="group" aria-label={recipeStrings.allTags} className="tag-chips">
      <Chip kind="filter" selected={selectedKey === ''} onClick={() => onSelect('')}>
        {recipeStrings.allTags}
      </Chip>
      {tags.map((t) => (
        <Chip key={t.name} kind="filter" selected={selectedKey === tagKey(t.name)} onClick={() => onSelect(t.name)}>
          {t.name}
        </Chip>
      ))}
    </div>
  )
}
