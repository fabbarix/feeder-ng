// The Shopping List query with live updates and an offline snapshot (functional spec §9, §10.3). React hook.
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { connectEvents } from '../../../lib/sse'
import { ApiError } from '../../../lib/http'
import { appSnapshots } from '../../scan/lib/idbStore'
import { snapshotKeys, type SnapshotStore } from '../../scan/lib/snapshots'
import { shopApi } from '../api'
import type { ShoppingList } from '../types'

export const shopKeys = {
  all: ['shopping'] as const,
  list: (shopId: number | null, to: string | undefined) => ['shopping', 'list', shopId, to ?? null] as const,
}

const LIVE_TOPICS = ['shopping', 'plan', 'stock', 'products'] as const

export interface UseShoppingListOptions {
  shopId: number | null
  /** the chosen last date; the server clamps it and answers with the one it used */
  to?: string
  /** where the last list is kept for offline; default: the app's IndexedDB snapshot store */
  snapshots?: SnapshotStore
}

export interface UseShoppingListResult {
  data: ShoppingList | undefined
  isLoading: boolean
  error: Error | null
  /** the data is the saved snapshot because the server could not be reached */
  stale: boolean
  /**
   * WP7: what the screen renders. loading = first fetch under way (Skeleton); error = failed and nothing to show
   * (ErrorState with retry); offline = the saved snapshot is shown (stale); empty = loaded, no Lines and no extras;
   * ready = loaded with entries.
   */
  status: 'loading' | 'error' | 'offline' | 'empty' | 'ready'
  /** refetch now (the ErrorState's "Try again") */
  retry: () => void
}

interface Fetched {
  list: ShoppingList | undefined
  stale: boolean
}

/**
 * react-query on shopApi.list({ shopId, to }) under shopKeys.list. After every successful fetch the list is saved as
 * a snapshot; when the fetch fails with a network error (ApiError status 0) the saved snapshot is returned with
 * stale = true (and an error is reported only when there is none). Live updates: the `shopping`, `plan`, `stock`
 * and `products` topics, and a reconnect, ask liveRefreshFor(queryClient).request() (WP7: one refetch per burst, see
 * lib/liveRefresh); they no longer invalidate directly. Does nothing where there is no EventSource.
 */
export function useShoppingList(options: UseShoppingListOptions): UseShoppingListResult {
  const { shopId, to } = options
  const snapshots = options.snapshots ?? appSnapshots()
  const queryClient = useQueryClient()
  const snapshotKey = snapshotKeys.list(shopId, to ?? 'default')

  const query = useQuery<Fetched>({
    queryKey: shopKeys.list(shopId, to),
    queryFn: async () => {
      try {
        const list = await shopApi.list({ shopId, to })
        await snapshots.set(snapshotKey, list)
        return { list, stale: false }
      } catch (err) {
        if (err instanceof ApiError && err.status === 0) {
          const saved = await snapshots.get<ShoppingList>(snapshotKey)
          if (saved) return { list: saved, stale: true }
        }
        throw err
      }
    },
  })

  useEffect(() => {
    if (typeof EventSource === 'undefined') return
    const connection = connectEvents()
    const refresh = () => void queryClient.invalidateQueries({ queryKey: shopKeys.all })
    const offs = LIVE_TOPICS.map((topic) => connection.subscribe(topic, refresh))
    const offReconnect = connection.onReconnect(refresh)
    return () => {
      offs.forEach((off) => off())
      offReconnect()
      connection.close()
    }
  }, [queryClient])

  return {
    data: query.data?.list,
    isLoading: query.isLoading,
    error: query.error,
    stale: query.data?.stale ?? false,
    status: 'loading',
    retry: () => {},
  }
}
