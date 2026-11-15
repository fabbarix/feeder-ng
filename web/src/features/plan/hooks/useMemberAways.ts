// B9-46: a Member's Aways (GET /api/members/{id}/away), one Member or every Member of the Members list.
import { useQueries, useQuery } from '@tanstack/react-query'
import { useScreenState } from '../../../app/useScreenState'
import type { ScreenState } from '../../../lib/dataState'
import { planApi } from '../api'
import type { Away } from '../types'

export interface UseMemberAways {
  aways: Away[]
  state: ScreenState
}

/** The query key of one Member's Aways; ['household', 'away'] refreshes every Member's. */
export const memberAwaysKey = (memberId: number) => ['household', 'away', memberId] as const

const NONE: Away[] = []

/** Running and coming Aways of one Member, soonest first; query key ['household','away', memberId]; null id: nothing is read. */
export function useMemberAways(memberId: number | null): UseMemberAways {
  const query = useQuery({ queryKey: memberAwaysKey(memberId ?? 0), queryFn: () => planApi.memberAways(memberId!), enabled: memberId !== null })
  const aways = query.data ?? NONE
  const state = useScreenState(query, { isEmpty: aways.length === 0, hasFilter: false })
  return { aways, state: memberId === null ? 'empty' : state }
}

/** The same for several Members at once (the Members list): by Member id. A Member whose read fails is left out. */
export function useAllMemberAways(memberIds: number[]): Record<number, Away[]> {
  return useQueries({
    queries: memberIds.map((id) => ({ queryKey: memberAwaysKey(id), queryFn: () => planApi.memberAways(id) })),
    combine: (results) => {
      const out: Record<number, Away[]> = {}
      results.forEach((r, i) => {
        const id = memberIds[i]
        if (id !== undefined && r.data) out[id] = r.data
      })
      return out
    },
  })
}
