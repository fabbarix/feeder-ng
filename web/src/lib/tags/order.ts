// Tags are ordered by name (user decision, tg-ui.md 1).
import type { Tag } from './types'

const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

/** A copy ordered by name, case and accents ignored in the comparison, ties by id. */
export function sortTagsByName<T extends Pick<Tag, 'id' | 'name'>>(tags: readonly T[]): T[] {
  return [...tags].sort((a, b) => collator.compare(a.name, b.name) || a.id - b.id)
}
