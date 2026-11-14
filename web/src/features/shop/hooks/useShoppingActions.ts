// Mutations on the Shopping List: tick by hand, untick, manual extras. React hook; each success asks for a list refresh
// through liveRefreshFor(queryClient) (WP7: one refetch per burst) and, for a
// tick that added a Stock Lot or an untick that takes it back, invalidates ['stock']. A failed call rejects and refreshes nothing.
import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { newClientUuid } from '../../scan/lib/queue'
import { shopApi } from '../api'
import type { ExtraInput, NotNeededInput, TickResult } from '../types'
import { liveRefreshFor } from '../lib/liveRefresh'

export interface ShoppingActions {
  tick(input: { ingredientId: number; to: string; quantity: number; shopId?: number | null }): Promise<TickResult>
  untick(ingredientId: number, to: string): Promise<void>
  addExtra(input: ExtraInput): Promise<void>
  deleteExtra(id: number): Promise<void>
  tickExtra(id: number, quantity: number, shopId?: number | null, clientUuid?: string): Promise<TickResult>
  untickExtra(id: number): Promise<void>
  /** B5-SH: take a Line off the list for the range (no Stock, no purchase); refreshes the list only. */
  notNeeded(input: NotNeededInput): Promise<void>
  /** B5-SH: "Needed after all": put the Line back. */
  neededAfterAll(ingredientId: number, to: string, shopId?: number | null): Promise<void>
}

/**
 * Every tick by hand (and every extra tick) is sent with a fresh clientUuid (lib newClientUuid), so a retried request
 * adds one Lot.
 * A failure rejects with the ApiError (the screen shows it) and invalidates nothing.
 */
export function useShoppingActions(): ShoppingActions {
  const queryClient = useQueryClient()

  return useMemo<ShoppingActions>(() => {
    const refreshList = () => liveRefreshFor(queryClient).request()
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
        // Undo of a tick takes back the Stock it added (ADR 0019).
        await refreshStock()
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
        await refreshStock()
      },
      async notNeeded(input) {
        await shopApi.notNeeded(input)
        await refreshList()
      },
      async neededAfterAll(ingredientId, to, shopId) {
        await shopApi.neededAfterAll(ingredientId, to, shopId)
        await refreshList()
      },
    }
  }, [queryClient])
}
