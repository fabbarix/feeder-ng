// useTags (react-query ['tags'] + SSE "tags"), useTagLookup and invalidateTagCaches (spec 17, tg-ui.md 3).
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect, useMemo } from 'react'
import { connectEvents } from '../sse'
import { tagKey } from './keys'
import { sortTagsByName } from './order'
import { tagsApi } from './api'
import type { Tag } from './types'

/** Every query key a Tag write can make stale. */
export const TAG_CACHE_KEYS: readonly (readonly string[])[] = [['tags'], ['slot-rules'], ['variety-rules'], ['plan', 'tags']]

/** Invalidates exactly ['tags'], ['slot-rules'], ['variety-rules'] and ['plan','tags']. */
export function invalidateTagCaches(client: QueryClient): Promise<void> {
  return Promise.all(TAG_CACHE_KEYS.map((queryKey) => client.invalidateQueries({ queryKey: [...queryKey] }))).then(() => undefined)
}

export interface UseTagsResult {
  /** Ordered by name. */
  tags: Tag[]
  isLoading: boolean
  isError: boolean
}

const NO_TAGS: Tag[] = []

/** The Tags, by name. A `tags` event on the live stream, and a reconnect, refresh every Tag cache. */
export function useTags(): UseTagsResult {
  const client = useQueryClient()
  const query = useQuery({ queryKey: ['tags'], queryFn: tagsApi.list })

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const off = connection.subscribe('tags', () => void invalidateTagCaches(client))
    const offReconnect = connection.onReconnect(() => void invalidateTagCaches(client))
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [client])

  const tags = useMemo(() => (query.data ? sortTagsByName(query.data) : NO_TAGS), [query.data])
  return { tags, isLoading: query.isLoading, isError: query.isError }
}

/** (a Tag name or key) => the Tag with that tagKey, once loaded. */
export function useTagLookup(): (nameOrKey: string) => Tag | undefined {
  const { tags } = useTags()
  return useMemo(() => {
    const byKey = new Map(tags.map((t) => [t.key, t] as const))
    return (nameOrKey: string) => byKey.get(tagKey(nameOrKey))
  }, [tags])
}
