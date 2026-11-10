import { useQuery } from '@tanstack/react-query'
import { accessApi } from '../api'
import { unlinkedMembers } from '../lib/members'
import type { AccessMember } from '../types'
import { accessKeys } from './queryKeys'

export interface UnlinkedMembersState {
  members: AccessMember[]
  isPending: boolean
  isError: boolean
}

const NONE: AccessMember[] = []

/** The Members that can still be linked (GET /api/members, userId null). `enabled=false` does not fetch. */
export function useUnlinkedMembers(enabled = true): UnlinkedMembersState {
  const query = useQuery({ queryKey: accessKeys.members, queryFn: accessApi.members, select: unlinkedMembers, enabled })
  return { members: query.data ?? NONE, isPending: enabled && query.isPending, isError: query.isError }
}
