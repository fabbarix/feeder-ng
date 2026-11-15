// B9-40 (PC-03): what Cook Mode does with a timer from its pill, its rail tile and its sheet. React-facing; the restart input and the
// timer's short name come from lib/timers and lib/householdTimers.
import { useCallback, useMemo, useRef } from 'react'
import { useToast, useUndoToast } from '../../../ui'
import { formatTimer } from '../../../lib/format'
import { parseTimerLabel } from '../lib/householdTimers'
import { restartInput } from '../lib/timers'
import { cookStrings as s } from '../strings'
import type { TimerItem, UseTimers } from './useTimers'

export interface TimerActions {
  pause: (id: number) => Promise<void>
  resume: (id: number) => Promise<void>
  /**
   * "Add 1 minute": the server cannot extend a timer, so the timer is cancelled and started again with a minute more. If that second
   * call fails it is started again with the time it had and a warning toast says so; if that fails too a sticky warning names it.
   */
  addMinute: (id: number) => Promise<void>
  /** "Cancel timer": cancels it and shows the Undo toast "Timer cancelled" with the timer's short name; Undo starts it again with what was left. */
  cancel: (id: number) => Promise<void>
  /** A finished timer's "Dismiss": clears it, no toast. */
  dismiss: (id: number) => Promise<void>
}

export type TimerActionsSource = Pick<UseTimers, 'start' | 'pause' | 'resume' | 'cancel'> & { items: TimerItem[] }

export function useTimerActions(timers: TimerActionsSource): TimerActions {
  const toast = useToast()
  const undo = useUndoToast()
  const latest = useRef(timers)
  latest.current = timers
  const find = useCallback((id: number) => latest.current.items.find((i) => i.timer.id === id) ?? null, [])

  // Starts `item`'s timer again with `seconds` and keeps it paused when it was paused: Add 1 minute and Undo never set a paused timer
  // running behind the cook's back. A failed re-pause leaves it running (the start is what matters) and is not an error of the action.
  const startAgain = useCallback(async (item: TimerItem, seconds: number) => {
    const started = await latest.current.start(restartInput(item.timer, seconds))
    if (item.timer.state === 'paused' && started && typeof started.id === 'number') {
      try {
        await latest.current.pause(started.id)
      } catch {
        // running is the safe side: the cook sees it counting down
      }
    }
  }, [])

  const failed = useCallback(() => {
    toast.show({ status: 'error', title: s.timerActionFailed })
  }, [toast])

  const pause = useCallback(
    async (id: number) => {
      try {
        await latest.current.pause(id)
      } catch {
        failed()
      }
    },
    [failed],
  )
  const resume = useCallback(
    async (id: number) => {
      try {
        await latest.current.resume(id)
      } catch {
        failed()
      }
    },
    [failed],
  )

  const addMinute = useCallback(
    async (id: number) => {
      const item = find(id)
      if (!item) return
      const name = parseTimerLabel(item.timer.label).title
      const left = Math.max(0, item.seconds)
      try {
        await latest.current.cancel(id)
      } catch {
        failed()
        return
      }
      try {
        await startAgain(item, left + 60)
        return
      } catch {
        // the timer is cancelled on the server: start it again with the time it had, so the cook never loses it silently
      }
      try {
        await startAgain(item, left)
        toast.show({ status: 'warning', title: s.addMinuteFailed, subline: s.addMinuteKept(name, formatTimer(left)) })
      } catch {
        toast.show({
          status: 'warning',
          title: s.timerLost(name),
          subline: s.timerLostDetail(formatTimer(left)),
          sticky: true,
          actions: [
            {
              label: s.startAgain,
              ariaLabel: s.startAgainName(name),
              onClick: () => {
                void startAgain(item, left).catch(failed)
              },
            },
          ],
        })
      }
    },
    [failed, find, startAgain, toast],
  )

  const cancel = useCallback(
    async (id: number) => {
      const item = find(id)
      if (!item) return
      const left = Math.max(0, item.seconds)
      try {
        await latest.current.cancel(id)
      } catch {
        failed()
        return
      }
      undo.show({
        headline: s.timerCancelled,
        subline: parseTimerLabel(item.timer.label).title,
        undo: () => startAgain(item, left),
      })
    },
    [failed, find, startAgain, undo],
  )

  const dismiss = useCallback(
    async (id: number) => {
      if (!find(id)) return
      try {
        await latest.current.cancel(id)
      } catch {
        failed()
      }
    },
    [failed, find],
  )

  return useMemo(() => ({ pause, resume, addMinute, cancel, dismiss }), [pause, resume, addMinute, cancel, dismiss])
}
