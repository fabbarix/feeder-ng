// B9-45 (PC-02): the Cooked moment of a Cook Mode screen: what the confirmation shows after the last thing cooked here, and its Undo
// Cooked, which reopens through the same path as the toast's and the Planned Meal sheet's Undo (plan useReopen undoNow: a refusal is
// the sticky warning "Nothing was undone" and the confirmation stays). A Mark all Cooked's moment is read from its result.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useState } from 'react'
import { cachedSlots } from '../../plan/hooks/replanState'
import { useReopen } from '../../plan/hooks/useReopen'
import { reopenedText } from '../../plan/lib/resolved'
import type { CookedAllResult, SlotDayKey } from '../../plan/types'
import { allCookedMoment, type CookedMoment } from '../lib/cooked'

type Marked = { kind: 'course'; moment: CookedMoment } | { kind: 'all'; slot: SlotDayKey; slotName: string; courseIds: number[] }

export interface CookedMomentState {
  /** null until something was Cooked on this screen (and again after an Undo). */
  moment: CookedMoment | null
  /** A Mark all Cooked was the last thing cooked (its notice and sheet are the Mark all flow's). */
  all: boolean
  course: (moment: CookedMoment) => void
  markedAll: (slot: SlotDayKey, slotName: string, courseIds: number[]) => void
  undo: () => Promise<void>
  undoBusy: boolean
}

/** `allResult` is the Mark all flow's result; `onUndone` runs after a successful reopen, before the confirmation goes (refetch, clear). */
export function useCookedMoment(allResult: CookedAllResult | null, onUndone: () => Promise<void>): CookedMomentState {
  const client = useQueryClient()
  const reopen = useReopen()
  const [marked, setMarked] = useState<Marked | null>(null)
  const [undoBusy, setUndoBusy] = useState(false)
  const moment =
    marked === null ? null : marked.kind === 'course' ? marked.moment : allResult ? allCookedMoment(marked.slot, marked.slotName, marked.courseIds, allResult) : null
  const undo = useCallback(async () => {
    if (!moment || undoBusy) return
    setUndoBusy(true)
    try {
      const ok = await reopen.undoNow(moment.undoKey, reopenedText(cachedSlots(client), moment.undoKey))
      if (!ok) return
      await onUndone()
      setMarked(null)
    } finally {
      setUndoBusy(false)
    }
  }, [moment, undoBusy, reopen, client, onUndone])
  return {
    moment,
    all: marked?.kind === 'all',
    course: useCallback((m: CookedMoment) => setMarked({ kind: 'course', moment: m }), []),
    markedAll: useCallback((slot: SlotDayKey, slotName: string, courseIds: number[]) => setMarked({ kind: 'all', slot, slotName, courseIds }), []),
    undo,
    undoBusy,
  }
}
