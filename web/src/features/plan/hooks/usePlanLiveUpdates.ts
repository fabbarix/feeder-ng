import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'

/**
 * B9-26 (PC-01): `announce: true` (mounted once per screen: the Plan, Today's Tonight sheets) also shows What changed for another User's edit;
 * without it the hook only refetches and needs no Toast and no signed-in User. TEST-AUTHOR STUB: only the option is declared.
 *
 * Refetches ['plan'] and the streak when the server publishes on SSE topic `plan` (and after a reconnect); Course changes on `household` refetch the plan. */
export function usePlanLiveUpdates(_options?: { announce?: boolean }): void {
  const client = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['plan'] })
      // A Leftover discard moves the zero-waste streak.
      void client.invalidateQueries({ queryKey: ['today', 'streak'] })
    }
    // CRS F: Courses, their order and who eats them are on the plan (topic household).
    const off = connection.subscribe('plan', refresh)
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
  }, [client])
}
