import type { AccessMember } from '../types'

export interface UnlinkedMembersState {
  members: AccessMember[]
  isPending: boolean
  isError: boolean
}

/** The Members that can still be linked (GET /api/members, userId null). STUB: the Developer implements it. */
export function useUnlinkedMembers(): UnlinkedMembersState {
  return { members: [], isPending: false, isError: false }
}
