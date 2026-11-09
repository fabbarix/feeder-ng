import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'
import { staleKeysFor } from '../lib/liveUpdates'

/** Refetches household data when another User changes it (topic "household"). Does nothing where there is no EventSource. */
export function useHouseholdLiveUpdates(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const stale = () => {
      for (const key of [['household'], ['allowlist']]) void queryClient.invalidateQueries({ queryKey: key })
    }
    const off = connection.subscribe('household', (data) => {
      for (const queryKey of staleKeysFor(data)) void queryClient.invalidateQueries({ queryKey: [...queryKey] })
    })
    const offReconnect = connection.onReconnect(stale)
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [queryClient])
}
