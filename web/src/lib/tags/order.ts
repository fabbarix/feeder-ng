// Tags are ordered by name (user decision, tg-ui.md 1).
import type { Tag } from './types'

/** A copy ordered by name, case and accents ignored in the comparison, ties by id. */
export function sortTagsByName<T extends Pick<Tag, 'id' | 'name'>>(tags: readonly T[]): T[] {
  void tags
  throw new Error('TG-UI: not implemented')
}
