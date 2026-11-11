import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'
import { staleKeysFor } from '../lib/liveUpdates'
import { accessKeys } from './queryKeys'

/** Refetches Access Request data when somebody asks, approves or denies (topic "access"). Does nothing where there is no EventSource. */
export function useAccessLiveUpdates(enabled = true): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (!enabled || typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const off = connection.subscribe('access', (data) => {
      for (const queryKey of staleKeysFor(data)) void queryClient.invalidateQueries({ queryKey: [...queryKey] })
    })
    const offReconnect = connection.onReconnect(() => void queryClient.invalidateQueries({ queryKey: [...accessKeys.all] }))
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [queryClient, enabled])
}
