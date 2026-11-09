// The Shop's offline bundle (GET /api/scan/bundle), saved on the device so scanning works with no signal.
import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../../lib/http'
import { scanApi } from '../api'
import { appSnapshots } from '../lib/idbStore'
import { snapshotKeys } from '../lib/snapshots'
import type { Bundle } from '../types'

export interface BundleState {
  bundle: Bundle | null
  status: 'loading' | 'ready' | 'error'
  error: string | null
}

/** The bundle for a Shop (null = home). A network failure falls back to the saved bundle. */
export function useBundle(shopId: number | null): BundleState {
  const snapshots = appSnapshots()
  const query = useQuery<Bundle>({
    queryKey: ['scan', 'bundle', shopId],
    queryFn: async () => {
      try {
        const bundle = await scanApi.bundle(shopId)
        await snapshots.set(snapshotKeys.bundle(shopId), bundle)
        return bundle
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          const saved = await snapshots.get<Bundle>(snapshotKeys.bundle(shopId))
          if (saved) return saved
        }
        throw err
      }
    },
  })
  if (query.data) return { bundle: query.data, status: 'ready', error: null }
  if (query.error) return { bundle: null, status: 'error', error: query.error.message }
  return { bundle: null, status: 'loading', error: null }
}
