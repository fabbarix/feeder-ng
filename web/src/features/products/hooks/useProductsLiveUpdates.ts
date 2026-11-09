import { useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'

/** Refetches shops, products and the Catalog when another User changes them (topic "products"), and after a reconnect. Does nothing where there is no EventSource. */
export function useProductsLiveUpdates(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const stale = () => {
      for (const key of [['shops'], ['products'], ['catalog']]) void queryClient.invalidateQueries({ queryKey: key })
    }
    const off = connection.subscribe('products', stale)
    const offReconnect = connection.onReconnect(stale)
    return () => {
      off()
      offReconnect()
      connection.close()
    }
  }, [queryClient])
}
