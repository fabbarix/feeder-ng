import { useQuery } from '@tanstack/react-query'
import { useMe } from '../../../app/useMe'
import { accessApi } from '../api'
import { useAccessLiveUpdates } from './useAccessLiveUpdates'
import { accessKeys } from './queryKeys'

/** The number of pending Access Requests for the shell badge: 0 while loading, on error, and when signed out. */
export function useAccessBadge(): number {
  const me = useMe()
  // Nothing is fetched for a signed-out visitor (the API would answer 401) or before we know who is asking.
  const enabled = !me.isPending && me.data !== null
  useAccessLiveUpdates(enabled)
  const query = useQuery({ queryKey: accessKeys.list, queryFn: accessApi.list, enabled })
  return enabled && !query.isError ? (query.data?.count ?? 0) : 0
}
