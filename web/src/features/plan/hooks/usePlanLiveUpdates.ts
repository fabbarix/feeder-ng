import { useQueryClient, type QueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { ME_QUERY_KEY, type Me } from '../../../app/useMe'
import { connectEvents } from '../../../lib/sse'
import { otherUserToast, type PlanActor, type PlanChange } from '../lib/replan'
import type { SlotKey } from '../types'
import { cachedSlots, readReplan, replanStateOf, writeReplan } from './replanState'

interface PlanEvent {
  changed?: string
  reason?: string
  by?: PlanActor
  target?: SlotKey
  changes?: PlanChange[]
}

let announceSeq = 0

/**
 * B9-26 (PC-01): another User's edit as the plan event carries it: the changes are shared (marked rows, Review) and the toast is
 * queued for the screen's useReplanReview, which shows it. Nothing for the signed-in User's own write (its answer already did),
 * for the planner's own replans (no `by`) or for an edit that moved no other meal.
 */
function announceOther(client: QueryClient, data: unknown) {
  const ev = (data ?? {}) as PlanEvent
  const changes = ev.changes ?? []
  const me = client.getQueryData<Me | null>(ME_QUERY_KEY)
  if (!ev.by || changes.length === 0 || (me && me.id === ev.by.userId)) return
  const toast = otherUserToast({ reason: ev.reason, by: ev.by, target: ev.target, changes, slots: cachedSlots(client) })
  if (!toast) return
  writeReplan(client, { ...replanStateOf({ by: ev.by, target: ev.target, changes }), announced: readReplan(client)?.announced, announce: { id: ++announceSeq, toast } })
}

/**
 * B9-26 (PC-01): `announce: true` (mounted once per screen: the Plan, Today's Tonight sheets, beside that screen's useReplanReview)
 * also shows What changed for another User's edit; without it the hook only refetches and needs no Toast and no signed-in User.
 *
 * Refetches ['plan'] and the streak when the server publishes on SSE topic `plan` (and after a reconnect); Course changes on `household` refetch the plan. */
export function usePlanLiveUpdates(options?: { announce?: boolean }): void {
  const client = useQueryClient()
  const announce = options?.announce === true
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const onPlan = (data?: unknown) => {
      if (announce) announceOther(client, data)
      refresh()
    }
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['plan'] })
      // A Leftover discard moves the zero-waste streak.
      void client.invalidateQueries({ queryKey: ['today', 'streak'] })
    }
    // CRS F: Courses, their order and who eats them are on the plan (topic household).
    const off = connection.subscribe('plan', onPlan)
    const offHousehold = connection.subscribe('household', (data?: unknown) => {
      const changed = (data as { changed?: unknown } | undefined)?.changed
      if (changed === 'courses' || changed === 'mealSlots' || changed === 'attendance' || changed === 'slotDates') void client.invalidateQueries({ queryKey: ['plan'] })
    })
    // A Tag renamed on another device (topic tags) changes the names in the why chips.
    const offTags = connection.subscribe('tags', () => void client.invalidateQueries({ queryKey: ['tags'] }))
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      off()
      offHousehold()
      offTags()
      offReconnect()
      connection.close()
    }
  }, [client, announce])
}
