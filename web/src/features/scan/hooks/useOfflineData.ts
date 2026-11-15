// The Shop's offline data (GET /api/scan/offline), saved on the device so scanning works with no signal.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'
import { ApiError } from '../../../lib/http'
import { scanApi } from '../api'
import { appSnapshots } from '../lib/idbStore'
import { snapshotKeys } from '../lib/snapshots'
import type { OfflineData } from '../types'

export interface OfflineDataState {
  offline: OfflineData | null
  /** B9-54 (RES-03): 'unavailable' = the phone is offline and this Shop's data was never saved on it ('error' stays for a failure with a server answer) */
  status: 'loading' | 'ready' | 'error' | 'unavailable'
  error: string | null
}

/**
 * The offline data for a Shop (null = home). A network failure falls back to the saved copy. It is fetched again
 * when the `products` live event arrives or the live stream reconnects (a Product created by a scan elsewhere, or
 * while the phone was away, must resolve), and the connection closes with the screen.
 */
export function useOfflineData(shopId: number | null): OfflineDataState {
  const snapshots = appSnapshots()
  const queryClient = useQueryClient()
  const query = useQuery<OfflineData>({
    queryKey: ['scan', 'offline', shopId],
    queryFn: async () => {
      try {
        const offline = await scanApi.offlineData(shopId)
        await snapshots.set(snapshotKeys.offline(shopId), offline)
        return offline
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          const saved = await snapshots.get<OfflineData>(snapshotKeys.offline(shopId))
          if (saved) return saved
        }
        throw err
      }
    },
  })
  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => void queryClient.invalidateQueries({ queryKey: ['scan', 'offline'] })
    const offProducts = connection.subscribe('products', refresh)
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      offProducts()
      offReconnect()
      connection.close()
    }
  }, [queryClient])

  if (query.data) return { offline: query.data, status: 'ready', error: null }
  // B9-54: no answer at all (offline) and no saved copy: the data is not on this phone yet; it loads once the connection is back. With the
  // app's retry the failed first try waits, paused, for the connection (offlineFirst): that is the same answer.
  if (query.error instanceof ApiError && query.error.status === 0) return { offline: null, status: 'unavailable', error: null }
  if (query.fetchStatus === 'paused' && query.failureCount > 0) return { offline: null, status: 'unavailable', error: null }
  if (query.error) return { offline: null, status: 'error', error: query.error.message }
  return { offline: null, status: 'loading', error: null }
}
