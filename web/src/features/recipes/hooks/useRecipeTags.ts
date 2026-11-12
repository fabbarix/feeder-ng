// TG-RW: useRecipeTags = useTags (by name, live) + useTagLookup (by key) for the Recipes screens.
import { useMemo } from 'react'
import { useTagLookup, useTags } from '../../../lib/tags/useTags'
import type { TagCount } from '../types'

export interface UseRecipeTags {
  /** Every Tag with its Recipe count, by name (the suggestions of the Tag field). */
  known: TagCount[]
  /** The Tag colour id for a Tag spelling (matched by key), undefined while unknown or not saved yet. */
  colourOf: (name: string) => string | undefined
  /** True until the Tags have first loaded (nothing is known, so no Tag is "New" yet). */
  isLoading: boolean
}

export function useRecipeTags(): UseRecipeTags {
  const { tags, isLoading } = useTags()
  const lookup = useTagLookup()
  const known = useMemo(() => tags.map((t) => ({ name: t.name, recipes: t.recipes })), [tags])
  return { known, colourOf: (name: string) => lookup(name)?.colour, isLoading }
}
