import type { ReactNode } from 'react'
import type { Tag } from '../../lib/tags/types'
import type { SelectFieldProps } from './Select'
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
  void tags
  void exclude
  return []
}

/** One Tag, with its colour dot and Recipe count on each option; type-ahead and search as the other domain selects. */
export function TagSelect(props: TagSelectProps): ReactNode {
  void props
  return null // TG-UI stub
}
