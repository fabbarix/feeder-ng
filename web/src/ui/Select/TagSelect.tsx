import { useMemo, type ReactNode } from 'react'
import type { Tag } from '../../lib/tags/types'
import { sortTagsByName } from '../../lib/tags/order'
import { TagDot } from '../TagColour/TagDot'
import { tagColourStrings } from '../TagColour/strings'
import { Select, type SelectFieldProps } from './Select'
import type { SelectOption } from './lib'

/** What the select needs of a Tag. `recipes` is optional: without it an option has no meta line. */
export type TagChoice = Pick<Tag, 'id' | 'name' | 'colour'> & { recipes?: number }

export interface TagSelectProps extends SelectFieldProps {
  tags: readonly TagChoice[]
  value: number | null
  onChange: (id: number) => void
  /** A Tag left out of the list (Merge into…: every other Tag). */
  exclude?: number
}

/** Options for the Tag select: by name, a TagDot as leading, the Recipe count as meta. */
export function tagOptions(tags: readonly TagChoice[], exclude?: number): SelectOption<number>[] {
  return sortTagsByName(tags)
    .filter((t) => t.id !== exclude)
    .map((t) => ({
      value: t.id,
      label: t.name,
      meta: t.recipes === undefined ? undefined : tagColourStrings.recipes(t.recipes),
      searchText: t.name,
      leading: <TagDot colour={t.colour} />,
    }))
}

/** One Tag, with its colour dot and Recipe count on each option; type-ahead and search as the other domain selects. */
export function TagSelect({ tags, value, onChange, exclude, ...field }: TagSelectProps): ReactNode {
  const options = useMemo(() => tagOptions(tags, exclude), [tags, exclude])
  return <Select<number> {...field} entityName="Tag" options={options} value={value} onChange={onChange} />
}
