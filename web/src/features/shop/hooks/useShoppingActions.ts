// Mutations on the Shopping List: tick by hand, untick, manual extras. React hook; each success asks for a list refresh
// through liveRefreshFor(queryClient) (WP7: one refetch per burst) and, for a
// tick that added a Stock Lot or an untick that takes it back, invalidates ['stock']. A failed call rejects and refreshes nothing.
import { useQueryClient } from '@tanstack/react-query'
import { useMemo } from 'react'
import { newClientUuid } from '../../scan/lib/queue'
import { shopApi } from '../api'
import type { ChangeTickInput, ChangeTickResult, ExtraInput, NotNeededInput, TickResult } from '../types'
import { liveRefreshFor } from '../lib/liveRefresh'

export interface ShoppingActions {
  tick(input: { ingredientId: number; to: string; quantity: number; shopId?: number | null; clientUuid?: string }): Promise<TickResult>
  untick(ingredientId: number, to: string): Promise<void>
  /** B9-34 (SSP-01): change the amount of one hand addition; 0 takes it back and keeps the tick. Refreshes the list and Stock. */
  changeTick(input: ChangeTickInput): Promise<ChangeTickResult>
  /** B9-34: the same for an Ingredient extra. */
  changeExtraTick(id: number, quantity: number): Promise<ChangeTickResult>
  /** B9-34: take one addition (by its client id) off its Line as if never made; refreshes the list and Stock. */
  untickAddition(tickClientUuid: string): Promise<void>
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
 * Every tick by hand (and every extra tick) is sent with a clientUuid: the caller's (B9-34: the tick flow makes one per tap and keeps it),
 * else a fresh one (lib newClientUuid), so a retried request adds one Lot.
 * A failure rejects with the ApiError (the screen shows it) and invalidates nothing.
 */
export function useShoppingActions(): ShoppingActions {
  const queryClient = useQueryClient()

  return useMemo<ShoppingActions>(() => {
    const refreshList = () => liveRefreshFor(queryClient).request()
    const refreshStock = () => queryClient.invalidateQueries({ queryKey: ['stock'] })

    return {
      async tick(input) {
        // B9-34: the caller's client id is kept (the tick flow Undoes and Changes that one addition by it; B9-54 queues the same id)
        const result = await shopApi.tick({ ...input, clientUuid: input.clientUuid ?? newClientUuid() })
        await refreshList()
        if (result.created) await refreshStock()
        return result
      },
      async changeTick(input) {
        const result = await shopApi.changeTick(input)
        // an amount moved in Stock (0 takes the Lot's rest back)
        await refreshStock()
        await refreshList()
        return result
      },
      async changeExtraTick(id, quantity) {
        const result = await shopApi.changeExtraTick(id, quantity)
        await refreshStock()
        await refreshList()
        return result
      },
      async untickAddition(tickClientUuid) {
        await shopApi.untickAddition({ tickClientUuid, clientUuid: newClientUuid(), scannedAt: new Date().toISOString() })
        await refreshStock()
        await refreshList()
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
