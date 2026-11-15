// B9-46 (PC-08): which Away sheet is open on a screen: from a Meal Slot ("Someone is away…", or Who's eating's "Add an Away"), or
// on an Away (the day tile's line). One sheet at a time: opening it from Who's eating closes Who's eating.
import { useCallback, useMemo, useState } from 'react'
import type { Away, SlotDayKey } from '../types'

export type AwayOpenTarget = { from: SlotDayKey } | { away: Away }

export interface AwayOpenControl {
  target: AwayOpenTarget | null
  /** "Someone is away…": the sheet from this Meal Slot. */
  openFrom: (key: SlotDayKey) => void
  /** The day tile's Away line: the sheet on that Away. */
  openAway: (away: Away) => void
  close: () => void
}

export function useAwayOpen(): AwayOpenControl {
  const [target, setTarget] = useState<AwayOpenTarget | null>(null)
  const openFrom = useCallback((key: SlotDayKey) => setTarget({ from: { date: key.date, mealSlotId: key.mealSlotId } }), [])
  const openAway = useCallback((away: Away) => setTarget({ away }), [])
  const close = useCallback(() => setTarget(null), [])
  return useMemo(() => ({ target, openFrom, openAway, close }), [target, openFrom, openAway, close])
}
