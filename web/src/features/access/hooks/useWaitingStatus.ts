import { useQuery } from '@tanstack/react-query'
import { accessApi } from '../api'
import type { WaitingStatus } from '../types'
import { accessKeys } from './queryKeys'

const POLL_MS = 15_000

/** Polls GET /api/access-request/status every 15 s while the waiting page is open; stops once the request is answered. */
export function useWaitingStatus(enabled = true): { status?: WaitingStatus; isPending: boolean } {
  const query = useQuery({
    queryKey: accessKeys.waiting,
    queryFn: accessApi.waitingStatus,
    enabled,
    refetchInterval: (q) => (q.state.data?.status === 'none' ? false : POLL_MS),
  })
  return { status: query.data, isPending: enabled && query.isPending }
}
