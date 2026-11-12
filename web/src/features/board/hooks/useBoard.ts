import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { connectEvents } from '../../../lib/sse'
import { cookApi } from '../../cook/api'
import { boardApi } from '../api'
import { msUntil } from '../lib/tiles'
import type { BoardData } from '../types'

export interface UseBoard {
  data: BoardData | undefined
  isLoading: boolean
  error: Error | null
  refetch: () => void
}

const BOARD_KEY = ['board'] as const
const LIVE_TOPICS = ['plan', 'stock', 'timers', 'cook'] as const

/**
 * GET /api/board through react-query ['board']. Live: refetches on SSE topics
 * `plan`, `stock`, `timers` and `cook` and after a reconnect (one connection).
 * Does nothing where there is no EventSource.
 */
export function useBoard(): UseBoard {
  const client = useQueryClient()
  const query = useQuery({ queryKey: [...BOARD_KEY], queryFn: () => boardApi.board() })

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => void client.invalidateQueries({ queryKey: [...BOARD_KEY] })
    const offs = LIVE_TOPICS.map((topic) => connection.subscribe(topic, refresh))
    // CRS F: the board lists Courses, their order and who eats them: those household changes refetch it.
    const offHousehold = connection.subscribe('household', (data?: unknown) => {
      const changed = (data as { changed?: unknown } | undefined)?.changed
      if (changed === 'courses' || changed === 'mealSlots' || changed === 'attendance') refresh()
    })
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      offs.forEach((off) => off())
      offHousehold()
      offReconnect()
      connection.close()
    }
  }, [client])

  const refetch = useCallback(() => void client.invalidateQueries({ queryKey: [...BOARD_KEY] }), [client])
  return { data: query.data, isLoading: query.isLoading, error: query.error, refetch }
}

/** Marks an Advance Step done from the board, then refreshes the board. */
export function useAdvanceDone(): (scope: string, step: number) => void {
  const client = useQueryClient()
  const mutation = useMutation({
    mutationFn: ({ scope, step }: { scope: string; step: number }) => cookApi.setMark(scope, step, true),
    onSuccess: () => client.invalidateQueries({ queryKey: [...BOARD_KEY] }),
  })
  return (scope, step) => mutation.mutate({ scope, step })
}

export interface Scheme {
  dark: boolean
}

/**
 * The board's light/dark scheme from the server's theme. Starts with
 * theme.dark; sets one timeout for msUntil(theme.nextChangeAt) and then refetches
 * the board (which carries the new answer) instead of guessing the flip itself,
 * so a clock that drifts cannot flip the wrong way. Before data arrives: light.
 * Clears the timeout on unmount or when the theme changes.
 */
export function useBoardScheme(data: BoardData | undefined, refetch: () => void, nowMs: () => number = Date.now): Scheme {
  const nextChangeAt = data?.theme.nextChangeAt
  useEffect(() => {
    if (nextChangeAt === undefined) return
    const id = setTimeout(refetch, msUntil(nextChangeAt, nowMs()))
    return () => clearTimeout(id)
  }, [nextChangeAt, refetch])
  return { dark: data?.theme.dark ?? false }
}

/** A Date that re-renders every tickMs (default 1000; the board clock uses 10 000). */
export function useNow(tickMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), tickMs)
    return () => clearInterval(id)
  }, [tickMs])
  return now
}
