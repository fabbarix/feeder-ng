// B9-46 (SET-16): the Away section of the Member sheet: the Member's Aways as rows, which Away sheet is open, and focus back to
// what opened it.
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useRef, useState } from 'react'
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
  // w6a (B9-46): an Away ended today or removed leaves the list, so focus cannot go back to its row: it goes to "Add an Away".
  const addRef = useRef<HTMLButtonElement | null>(null)
  const [closedId, setClosedId] = useState<number | null>(null)
  useEffect(() => {
    // the list's refetch may land a moment after the sheet closes; an Away still listed after that keeps its row (the sheet restored focus)
    if (closedId === null) return
    const done = setTimeout(() => setClosedId(null), 3000)
    return () => clearTimeout(done)
  }, [closedId])
  useEffect(() => {
    if (closedId === null || sheet !== null) return
    if (rows.some((r) => r.away.id === closedId)) return
    setClosedId(null)
    // after the sheet's own focus return (to the row that is gone); not cancelled by the re-run that clearing closedId causes
    requestAnimationFrame(() => addRef.current?.focus())
  }, [closedId, rows, sheet])
  return {
    rows,
    loading: state === 'loading' || (aways.length > 0 && !today),
    sheet,
    addRef,
    openNew: () => setSheet({ kind: 'new' }),
    openAway: (away: Away) => setSheet({ kind: 'edit', away }),
    close: () => {
      if (sheet?.kind === 'edit') setClosedId(sheet.away.id)
      setSheet(null)
    },
  }
}
