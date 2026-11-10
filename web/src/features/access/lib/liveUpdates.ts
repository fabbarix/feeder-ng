// Which cached queries an "access" event makes stale. Query keys mirror hooks/queryKeys.ts.
import { accessKeys } from '../hooks/queryKeys'

/** The query keys to refetch for an event payload like {"changed":"requests"}; none for anything unknown. */
export function staleKeysFor(data: unknown): ReadonlyArray<readonly string[]> {
  if (typeof data === 'object' && data !== null && (data as { changed?: unknown }).changed === 'requests') {
    return [accessKeys.list, accessKeys.history]
  }
  return []
}
