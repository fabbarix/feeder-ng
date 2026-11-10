import type { TagChoice } from '../types'

/** The existing Tags (GET /api/tags, read-only use of the recipes API) for the Tag selects; idle while not enabled. */
export function useTagChoices(_enabled = true): { tags: TagChoice[]; isLoading: boolean } {
  throw new Error('not implemented (WP6)')
}
