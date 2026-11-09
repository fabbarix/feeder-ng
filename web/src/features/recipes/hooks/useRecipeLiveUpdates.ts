import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'

/** Refreshes Recipe, Tag and preference data when another User changes them (SSE topic "recipes"). */
export function useRecipeLiveUpdates(): void {
  const client = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => {
      for (const key of [['recipes'], ['tags'], ['recipe-preferences']]) void client.invalidateQueries({ queryKey: key })
    }
    const off = connection.subscribe('recipes', refresh)
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [client])
}
