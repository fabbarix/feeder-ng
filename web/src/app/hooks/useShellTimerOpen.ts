// Where a tap on the shell's timer pill, its banner or a Timers sheet row goes (PC-04). Opens Cook Mode at the timer's Step: the
// Step (and a Recipe cook's Batches) is left as the resume Step (lib/resume), then the app navigates. Timers of several scopes, or
// a free timer, have no single Cook Mode: the Timers sheet opens instead.
import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { opensTimersSheet, type ShellTimer } from '../../features/cook/lib/householdTimers'
import { readResume, saveResume, timerOpenPlan } from '../../features/cook/lib/resume'

export interface ShellTimerOpen {
  sheetOpen: boolean
  closeSheet(): void
  /** Cook Mode for these timers' one scope (on the first one's Step), or the Timers sheet. */
  openFor(timers: ShellTimer[]): void
  /** Cook Mode for this timer, on its Step; closes the sheet. A free timer has none: nothing happens. */
  openTimer(timer: ShellTimer): void
}

export function useShellTimerOpen(): ShellTimerOpen {
  const navigate = useNavigate()
  const [sheetOpen, setSheetOpen] = useState(false)

  const openTimer = useCallback(
    (timer: ShellTimer) => {
      if (!timer.scope) return
      const plan = timerOpenPlan(timer, timer.seconds, { batches: readResume(timer.scope)?.batches })
      if (!plan) return
      if (plan.resume) saveResume(plan.resume.scope, plan.resume.step, { after: plan.resume.after, batches: plan.resume.batches })
      setSheetOpen(false)
      navigate(plan.path)
    },
    [navigate],
  )

  const openFor = useCallback(
    (timers: ShellTimer[]) => {
      const first = timers[0]
      if (!first) return
      if (opensTimersSheet(timers)) setSheetOpen(true)
      else openTimer(first)
    },
    [openTimer],
  )

  const closeSheet = useCallback(() => setSheetOpen(false), [])
  return { sheetOpen, closeSheet, openFor, openTimer }
}
