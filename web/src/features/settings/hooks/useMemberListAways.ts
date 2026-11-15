// B9-46 (SET-16): the Members list's Away lines: every Member's running and coming Aways, and the Household's today (GET /api/plan).
import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import { planApi } from '../../plan/api'
import { useAllMemberAways } from '../../plan/hooks/useMemberAways'
import type { Away } from '../../plan/types'
import type { Member } from '../types'

export function useMemberListAways(members: Member[]): { aways: Record<number, Away[]>; today: string | undefined } {
  const ids = useMemo(() => members.map((m) => m.id), [members])
  const aways = useAllMemberAways(ids)
  const plan = useQuery({ queryKey: ['plan', 'view'], queryFn: () => planApi.view(), enabled: members.length > 0 })
  return { aways, today: plan.data?.today || undefined }
}
