// TG-RW: the Household's Tags for the Recipes screens: the suggestions' counts and the colour of a Tag by name. Replaces useKnownTags.
import type { TagCount } from '../types'

export interface UseRecipeTags {
  /** Every Tag with its Recipe count, by name (the suggestions of the Tag field). */
  known: TagCount[]
  /** The Tag colour id for a Tag spelling (matched by key), undefined while unknown or not saved yet. */
  colourOf: (name: string) => string | undefined
}

export function useRecipeTags(): UseRecipeTags {
  return { known: [], colourOf: () => undefined } // stub: TG-RW Developer (useTags + useTagLookup)
}
