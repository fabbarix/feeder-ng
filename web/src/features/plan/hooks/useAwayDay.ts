// B9-46 (PC-08): what a day tile says about Aways, memoised for the tile (the model is lib/away's awayDayModel).
import { useMemo } from 'react'
import { awayDayModel, dayShort, type AwayDayModel } from '../lib/away'
import { awayStrings } from '../strings/away'
import type { Away, PlanSlot } from '../types'

export interface AwayDayLineView {
  away: Away
  text: string
  /** "Ben away all day · 1.75 portions, Tue 17": unique on the page (P38). */
  name: string
}
export interface AwayDayView {
  lines: AwayDayLineView[]
  slotLabels: AwayDayModel['slotLabels']
}

const EMPTY: AwayDayView = { lines: [], slotLabels: {} }

export function useAwayDay(date: string, slots: PlanSlot[], aways: Away[] | undefined): AwayDayView {
  return useMemo(() => {
    if (!aways || aways.length === 0) return EMPTY
    const model = awayDayModel(slots, aways)
    const lines = model.lines.flatMap((l) => {
      const away = aways.find((a) => a.id === l.awayId)
      return away ? [{ away, text: l.text, name: awayStrings.away.lineName(l.text, dayShort(date)) }] : []
    })
    return { lines, slotLabels: model.slotLabels }
  }, [date, slots, aways])
}
