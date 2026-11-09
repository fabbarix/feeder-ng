// The Shopping List query with live updates and an offline snapshot (functional spec §9, §10.3). React hook.
// Stubs until implemented.
import type { SnapshotStore } from '../../scan/lib/snapshots'
import type { ShoppingList } from '../types'

export const shopKeys = {
  all: ['shopping'] as const,
  list: (shopId: number | null, to: string | undefined) => ['shopping', 'list', shopId, to ?? null] as const,
}

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
}

/**
 * react-query on shopApi.list({ shopId, to }) under shopKeys.list. After every successful fetch the list is saved as
 * a snapshot (key snapshotKeys.list(shopId, list.to)); when the fetch fails with a network error (ApiError status 0)
 * the saved snapshot is returned with stale = true (and an error is still reported only when there is none).
 * Live updates: one SSE connection (lib/sse) subscribed to the topics `shopping`, `plan`, `stock` and `products`;
 * any event, and a reconnect, invalidates shopKeys.all. Closes the connection on unmount; does nothing where there
 * is no EventSource.
 */
export function useShoppingList(options: UseShoppingListOptions): UseShoppingListResult {
  void options
  throw new Error('not implemented')
}
