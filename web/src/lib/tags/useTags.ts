// useTags (react-query ['tags'] + SSE "tags"), useTagLookup and invalidateTagCaches (spec 17, tg-ui.md 3).
import type { QueryClient } from '@tanstack/react-query'
import type { Tag } from './types'

/** Every query key a Tag write can make stale. */
export const TAG_CACHE_KEYS: readonly (readonly string[])[] = []

/** Invalidates exactly ['tags'], ['slot-rules'], ['variety-rules'] and ['plan','tags']. */
export function invalidateTagCaches(client: QueryClient): Promise<void> {
  void client
  return Promise.resolve()
}

export interface UseTagsResult {
  /** Ordered by name. */
  tags: Tag[]
  isLoading: boolean
  isError: boolean
}

export function useTags(): UseTagsResult {
  return { tags: [], isLoading: false, isError: false }
}

/** (a Tag name or key) => the Tag with that tagKey, once loaded. */
export function useTagLookup(): (nameOrKey: string) => Tag | undefined {
  return () => undefined
}
