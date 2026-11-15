// B9-40 (PC-03, SHORT-01): where Cook Mode shows its timers and which of their sheets is open. A strip of pills in the sticky nav below
// 64 em (whole pills only in short landscape), a rail from 64 em; a tap opens the timer's sheet, "+N" the sheet of every timer.
import { useState } from 'react'
import { useBreakpoint } from '../../../ui'
import { useShortLandscape } from './useShortLandscape'
import { useTimerActions, type TimerActions, type TimerActionsSource } from './useTimerActions'
import type { TimerItem } from './useTimers'

export interface CookTimerPanel {
  /** From 64 em the timers are a rail beside the Step (jsdom without matchMedia: the rail). */
  rail: boolean
  /** A phone held sideways (SHORT-01): the landscape grid, the Advance Steps chip, whole pills only. */
  short: boolean
  /** How many whole pills the strip shows; undefined: all of them. */
  maxPills: number | undefined
  actions: TimerActions
  /** The timer whose sheet is open (null: none), and whether it holds Next. */
  sheetItem: TimerItem | null
  sheetHoldsNext: boolean
  openTimer: (id: number) => void
  closeTimer: () => void
  /** The sheet of every timer ("+N"). */
  allOpen: boolean
  showAll: () => void
  closeAll: () => void
  /** A row of the sheet of every timer: closes it and opens that timer's own sheet. */
  openFromAll: (id: number) => void
}

export function useCookTimerPanel(timers: TimerActionsSource, holdingIds: number[]): CookTimerPanel {
  const desktop = useBreakpoint('desktop')
  const { short, maxPills } = useShortLandscape()
  // a short landscape viewport keeps the side-column layout at every width: the strip, never the rail
  const rail = desktop && !short
  const actions = useTimerActions(timers)
  const [openId, setOpenId] = useState<number | null>(null)
  const [allOpen, setAllOpen] = useState(false)
  const sheetItem = openId === null ? null : (timers.items.find((i) => i.timer.id === openId) ?? null)
  return {
    rail,
    short,
    maxPills,
    actions,
    sheetItem,
    sheetHoldsNext: sheetItem !== null && holdingIds.includes(sheetItem.timer.id),
    openTimer: setOpenId,
    closeTimer: () => setOpenId(null),
    allOpen,
    showAll: () => setAllOpen(true),
    closeAll: () => setAllOpen(false),
    openFromAll: (id) => {
      setAllOpen(false)
      setOpenId(id)
    },
  }
}
