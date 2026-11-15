// B9-46 (SET-16): the Away section of the Member sheet: the Member's Aways as rows, which Away sheet is open, and focus back to
// what opened it.
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { planApi } from '../../plan/api'
import { useMemberAways } from '../../plan/hooks/useMemberAways'
import type { Away, AwaySlotRef } from '../../plan/types'
import { awayRow, awayRowName, type AwayRowModel } from '../lib/away'

export interface MemberAwayRow extends AwayRowModel {
  away: Away
  name: string
}
export type MemberAwaySheet = { kind: 'new' } | { kind: 'edit'; away: Away } | null

const NO_SLOTS: AwaySlotRef[] = []

export function useMemberAwaySection(memberId: number) {
  const { aways, state } = useMemberAways(memberId)
  const slots = useQuery({ queryKey: ['household', 'meal-slots'], queryFn: planApi.mealSlots })
  const plan = useQuery({ queryKey: ['plan', 'view'], queryFn: () => planApi.view() })
  const today = plan.data?.today ?? ''
  const slotList = slots.data ?? NO_SLOTS
  const rows = useMemo<MemberAwayRow[]>(
    () =>
      today
        ? aways.map((away) => {
            const row = awayRow(away, today, slotList)
            return { ...row, away, name: awayRowName(row) }
          })
        : [],
    [aways, today, slotList],
  )
  const [sheet, setSheet] = useState<MemberAwaySheet>(null)
  return {
    rows,
    loading: state === 'loading' || (aways.length > 0 && !today),
    sheet,
    openNew: () => setSheet({ kind: 'new' }),
    openAway: (away: Away) => setSheet({ kind: 'edit', away }),
    close: () => setSheet(null),
  }
}
