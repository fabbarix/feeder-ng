import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'

/** Refetches ['plan'] and the streak when the server publishes on SSE topic `plan` (and after a reconnect). */
export function usePlanLiveUpdates(): void {
  const client = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => {
      void client.invalidateQueries({ queryKey: ['plan'] })
      // A Leftover discard moves the zero-waste streak.
      void client.invalidateQueries({ queryKey: ['today', 'streak'] })
    }
    const off = connection.subscribe('plan', refresh)
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [client])
}
