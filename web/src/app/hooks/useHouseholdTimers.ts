// The shell's view of the household's timers (PC-04): every timer (useTimers, polled every 15 s besides the live events, with a
// local countdown), summarised for the pill and the banner (lib/householdTimers), and the alarm.
//   Rings when a timer is SEEN to turn finished while the app is open: a countdown reaching 0 here, or a poll or live event now holding
//   a finished timer that was not there. The first list that loads never rings (a timer already finished then shows the banner only).
//   The alarm stops when no finished timer is left, on dismiss, and on unmount.
import { useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createWebAudioAlarm, type AlarmAdapter } from '../../features/cook/adapters/alarm'
import { cookApi } from '../../features/cook/api'
import { useTimers } from '../../features/cook/hooks/useTimers'
import { nameSecondsFor, summarizeTimers, type ShellTimer } from '../../features/cook/lib/householdTimers'

export interface HouseholdTimers {
  head: ShellTimer | null
  more: number
  /** The seconds the pill's accessible name says: refreshed once a minute. */
  nameSeconds: number
  all: ShellTimer[]
  finished: ShellTimer[]
  ringing: boolean
  /** Dismisses the finished timers (cancels each on the server). */
  dismissFinished(): Promise<void>
}
export interface UseHouseholdTimersOptions {
  now?: () => number
  tickMs?: number
  pollMs?: number
  alarm?: AlarmAdapter
}
export const EMPTY_HOUSEHOLD_TIMERS: HouseholdTimers = { head: null, more: 0, nameSeconds: 0, all: [], finished: [], ringing: false, dismissFinished: async () => {} }

const POLL_MS = 15000
const NO_IDS: ReadonlySet<number> = new Set()

export function useHouseholdTimers(opts: UseHouseholdTimersOptions = {}): HouseholdTimers {
  const client = useQueryClient()
  const { items, isLoading } = useTimers(undefined, { now: opts.now, tickMs: opts.tickMs, pollMs: opts.pollMs ?? POLL_MS })
  const fallbackAlarm = useRef<AlarmAdapter | null>(null)
  const alarm = opts.alarm ?? (fallbackAlarm.current ??= createWebAudioAlarm())

  // Timers dismissed here: hidden at once, even before (or without, offline) the server's answer.
  const [dismissed, setDismissed] = useState<ReadonlySet<number>>(NO_IDS)
  const summary = useMemo(() => summarizeTimers(dismissed.size ? items.filter((i) => !dismissed.has(i.timer.id)) : items), [items, dismissed])
  const { head, more, all, finished } = summary

  // The accessible name's seconds, kept within the minute (per head timer).
  const named = useRef<{ id: number; seconds: number } | null>(null)
  let nameSeconds = 0
  if (head) {
    const previous = named.current && named.current.id === head.id ? named.current.seconds : null
    nameSeconds = nameSecondsFor(previous, head.seconds)
    named.current = { id: head.id, seconds: nameSeconds }
  } else named.current = null

  // The alarm: the finished ids seen so far; null until the first list has loaded.
  const seen = useRef<Set<number> | null>(null)
  const [ringing, setRinging] = useState(false)
  const finishedKey = finished.map((t) => t.id).join(',')
  useEffect(() => {
    const ids = finishedKey ? finishedKey.split(',').map(Number) : []
    if (seen.current === null) {
      if (isLoading) return
      seen.current = new Set(ids)
      return
    }
    const fresh = ids.filter((id) => !seen.current!.has(id))
    for (const id of fresh) seen.current.add(id)
    if (fresh.length > 0) {
      alarm.play()
      setRinging(true)
    } else if (ids.length === 0) {
      alarm.stop()
      setRinging(false)
    }
  }, [finishedKey, isLoading, alarm])

  useEffect(() => () => alarm.stop(), [alarm])

  const finishedRef = useRef(finished)
  finishedRef.current = finished
  const dismissFinished = useCallback(async () => {
    const ids = finishedRef.current.map((t) => t.id)
    alarm.stop()
    setRinging(false)
    if (ids.length === 0) return
    setDismissed((prev) => new Set([...prev, ...ids]))
    await Promise.allSettled(ids.map((id) => cookApi.cancelTimer(id)))
    await client.invalidateQueries({ queryKey: ['cook', 'timers'] })
  }, [alarm, client])

  return { head, more, nameSeconds, all, finished, ringing, dismissFinished }
}
