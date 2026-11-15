// B9-46: a Member's Aways (GET /api/members/{id}/away). TEST-AUTHOR STUB.
import type { ScreenState } from '../../../lib/dataState'
import type { Away } from '../types'

export interface UseMemberAways {
  aways: Away[]
  state: ScreenState
}
/** Running and coming Aways of one Member, soonest first; query key ['household','away', memberId]; null id: nothing is read. */
export function useMemberAways(_memberId: number | null): UseMemberAways {
  throw new Error('not implemented (B9-46): useMemberAways')
}
/** The same for several Members at once (the Members list): by Member id. */
export function useAllMemberAways(_memberIds: number[]): Record<number, Away[]> {
  throw new Error('not implemented (B9-46): useAllMemberAways')
}
