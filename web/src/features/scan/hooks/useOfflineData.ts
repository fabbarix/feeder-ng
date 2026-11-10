// The Shop's offline data (GET /api/scan/offline), saved on the device so scanning works with no signal.
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../lib/http'
import { scanApi } from '../api'
import { appSnapshots } from '../lib/idbStore'
import { snapshotKeys } from '../lib/snapshots'
import type { OfflineData } from '../types'

export interface OfflineDataState {
  offline: OfflineData | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
}

/** The offline data for a Shop (null = home). A network failure falls back to the saved copy. */
export function useOfflineData(shopId: number | null): OfflineDataState {
  const snapshots = appSnapshots()
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
  if (query.data) return { offline: query.data, status: 'ready', error: null }
  if (query.error) return { offline: null, status: 'error', error: query.error.message }
  return { offline: null, status: 'loading', error: null }
}
