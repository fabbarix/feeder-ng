import { QueryClient, QueryClientContext, useQuery } from '@tanstack/react-query'
import { useContext, useMemo } from 'react'
import { tagKey, tagsApi } from '../../../lib/tags'
import type { PhraseContext } from '../lib/phrase'

let fallback: QueryClient | undefined
const bareClient = () => (fallback ??= new QueryClient())

/**
 * The context the why chips are phrased in: the slot's date and the Tag lookup, so a `variety_relaxed` chip names the
 * Tag ("3rd Fish this week") and not its key. One place for the four components that render chips.
 *
 * Reads the shared ['tags'] query (the one `useTags` fills). Outside a QueryClientProvider (a bare component) it uses a
 * private client that never fetches, and the chips say the key, as they do while the Tags load.
 */
export function usePhraseContext(slotDate: string): PhraseContext {
  const client = useContext(QueryClientContext)
  const { data } = useQuery({ queryKey: ['tags'], queryFn: tagsApi.list, enabled: client !== undefined }, client ?? bareClient())
  return useMemo(() => {
    const names = new Map((data ?? []).map((t) => [t.key, t.name] as const))
    return { slotDate, tagName: (key: string) => names.get(tagKey(key)) }
  }, [slotDate, data])
}
