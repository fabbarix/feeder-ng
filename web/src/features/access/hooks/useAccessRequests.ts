import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accessApi } from '../api'
import { oldestFirst } from '../lib/requests'
import type { AccessRequest } from '../types'
import { useAccessLiveUpdates } from './useAccessLiveUpdates'
import { accessKeys } from './queryKeys'

export interface AccessRequestsState {
  requests: AccessRequest[]
  isPending: boolean
  isError: boolean
  /** `memberId`: link the new User to this unlinked Member in the same step (decision A3). */
  approve: (id: number, memberId?: number) => Promise<unknown>
  deny: (id: number) => Promise<unknown>
}

const NONE: AccessRequest[] = []

/** The pending Access Requests with approve and deny. Any signed-in User may use it. Refetches on the "access" live event. */
export function useAccessRequests(): AccessRequestsState {
  useAccessLiveUpdates()
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: accessKeys.list, queryFn: accessApi.list, select: (list) => oldestFirst(list.requests) })
  // Success or failure, the answer may have changed what is pending (a 404 means somebody else answered first).
  const settled = () => queryClient.invalidateQueries({ queryKey: [...accessKeys.all] })
  const approve = useMutation({ mutationFn: (v: { id: number; memberId?: number }) => accessApi.approve(v.id, v.memberId), onSettled: settled })
  const deny = useMutation({ mutationFn: accessApi.deny, onSettled: settled })
  return {
    requests: query.data ?? NONE,
    isPending: query.isPending,
    isError: query.isError,
    approve: (id, memberId) => approve.mutateAsync({ id, memberId }),
    deny: deny.mutateAsync,
  }
}
