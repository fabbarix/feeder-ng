import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { connectEvents } from '../../../lib/sse'
import { cookApi } from '../api'
import { measureSkew, remainingSeconds, sortTimers } from '../lib/timers'
import type { CookTimer, StartTimerInput } from '../types'

export interface TimerItem {
  timer: CookTimer
  /** Whole seconds left right now, corrected for clock skew. */
  seconds: number
}

export interface UseTimers {
  /** Sorted with lib/timers.sortTimers. */
  items: TimerItem[]
  /** The timers as the server last sent them (stable between renders). */
  timers: CookTimer[]
  isLoading: boolean
  start(input: StartTimerInput): Promise<CookTimer>
  pause(id: number): Promise<void>
  resume(id: number): Promise<void>
  cancel(id: number): Promise<void>
}

export interface UseTimersOptions {
  /** Device clock in ms; tests inject one. Default Date.now. */
  now?: () => number
  /** How often the countdown re-renders; default 1000 ms. */
  tickMs?: number
}

const TIMERS_KEY = ['cook', 'timers'] as const

/**
 * The synced timers (all of them, or one scope's). react-query ['cook','timers',scope]
 * fed by GET /api/cook/timers; refetches on SSE topic `timers` and on reconnect.
 * Skew between the device and the server clock is measured from each response's
 * `now` and applied to the countdown. Actions call the API, then refetch.
 */
export function useTimers(scope?: string, opts: UseTimersOptions = {}): UseTimers {
  const now = opts.now ?? Date.now
  const tickMs = opts.tickMs ?? 1000
  const client = useQueryClient()
  const query = useQuery({ queryKey: [...TIMERS_KEY, scope ?? ''], queryFn: () => cookApi.timers(scope) })
  const data = query.data

  // Measured once per response, against the device clock at the moment it arrived.
  const skew = useMemo(() => (data ? measureSkew(data.now, now()) : 0), [data])

  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), tickMs)
    return () => clearInterval(id)
  }, [tickMs])

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => void client.invalidateQueries({ queryKey: [...TIMERS_KEY] })
    const off = connection.subscribe('timers', refresh)
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [client])

  const timers = data?.timers ?? EMPTY
  const clientNow = now()
  const items = sortTimers(timers, clientNow, skew).map((timer) => ({ timer, seconds: remainingSeconds(timer, clientNow, skew) }))

  const refetch = () => client.invalidateQueries({ queryKey: [...TIMERS_KEY] })
  return {
    items,
    timers,
    isLoading: query.isLoading,
    async start(input) {
      const timer = await cookApi.startTimer(input)
      await refetch()
      return timer
    },
    async pause(id) {
      await cookApi.pauseTimer(id)
      await refetch()
    },
    async resume(id) {
      await cookApi.resumeTimer(id)
      await refetch()
    },
    async cancel(id) {
      await cookApi.cancelTimer(id)
      await refetch()
    },
  }
}

const EMPTY: CookTimer[] = []
