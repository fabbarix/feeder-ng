// Mutations on the Shopping List: tick by hand, untick, manual extras. React hook; each success asks for a list refresh
// through liveRefreshFor(queryClient) (WP7: one refetch per burst; stub below still invalidates directly) and, for a
// tick that added a Stock Lot, invalidates ['stock']. A failed call rejects and refreshes nothing.
import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { newClientUuid } from '../../scan/lib/queue'
import { shopApi } from '../api'
import type { ExtraInput, TickResult } from '../types'
import { shopKeys } from './useShoppingList'

export interface ShoppingActions {
  tick(input: { ingredientId: number; to: string; quantity: number; shopId?: number | null }): Promise<TickResult>
  untick(ingredientId: number, to: string): Promise<void>
  addExtra(input: ExtraInput): Promise<void>
  deleteExtra(id: number): Promise<void>
  tickExtra(id: number, quantity: number, shopId?: number | null, clientUuid?: string): Promise<TickResult>
  untickExtra(id: number): Promise<void>
}

/**
 * Every tick by hand (and every extra tick) is sent with a fresh clientUuid (lib newClientUuid), so a retried request
 * adds one Lot.
 * A failure rejects with the ApiError (the screen shows it) and invalidates nothing.
 */
export function useShoppingActions(): ShoppingActions {
  const queryClient = useQueryClient()

  return useMemo<ShoppingActions>(() => {
    const refreshList = () => queryClient.invalidateQueries({ queryKey: shopKeys.all })
    const refreshStock = () => queryClient.invalidateQueries({ queryKey: ['stock'] })

    return {
      async tick(input) {
        const result = await shopApi.tick({ ...input, clientUuid: newClientUuid() })
        await refreshList()
        if (result.created) await refreshStock()
        return result
      },
      async untick(ingredientId, to) {
        await shopApi.untick(ingredientId, to)
        await refreshList()
      },
      async addExtra(input) {
        await shopApi.addExtra(input)
        await refreshList()
      },
      async deleteExtra(id) {
        await shopApi.deleteExtra(id)
        await refreshList()
      },
      async tickExtra(id, quantity, shopId, clientUuid = newClientUuid()) {
        const result = await shopApi.tickExtra(id, quantity, shopId, clientUuid)
        await refreshList()
        if (result.created) await refreshStock()
        return result
      },
      async untickExtra(id) {
        await shopApi.untickExtra(id)
        await refreshList()
      },
    }
  }, [queryClient])
}
