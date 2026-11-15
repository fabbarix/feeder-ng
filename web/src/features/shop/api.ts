import { ApiError, http as defaultHttp, type HttpClient } from '../../lib/http'
import type { ChangeTickInput, ChangeTickResult, ExtraInput, ListQuery, NotNeededInput, ShoppingExtra, ShoppingList, TickInput, TickResult } from './types'

export interface ShopApi {
  list(query?: ListQuery): Promise<ShoppingList>
  addExtra(input: ExtraInput): Promise<ShoppingExtra>
  deleteExtra(id: number): Promise<void>
  tickExtra(id: number, quantity?: number, shopId?: number | null, clientUuid?: string): Promise<TickResult>
  untickExtra(id: number): Promise<void>
  tick(input: TickInput): Promise<TickResult>
  untick(ingredientId: number, to: string): Promise<void>
  /** B9-23 (SSP-01): PATCH /api/shopping/ticks. 0 is Take back (the tick stays); the old quantity again is Undo of Take back. */
  changeTick(input: ChangeTickInput): Promise<ChangeTickResult>
  /** B9-23: PATCH /api/shopping/extras/{id}/tick {quantity}. */
  changeExtraTick(id: number, quantity: number): Promise<ChangeTickResult>
  /**
   * B9-34: take ONE addition off a Line, as if it was never made: a `shop_untick` op (POST /api/scan/sync) naming the addition's client
   * id. The Undo of a "more since your tick" tick: unlike a PATCH to 0 (which keeps the addition's cover, so the More stays covered),
   * the More comes back. A rejected op rejects with an ApiError of its code.
   */
  untickAddition(input: { tickClientUuid: string; clientUuid: string; scannedAt: string }): Promise<void>
  /** B5-SH: POST /api/shopping/not-needed; answers the list. */
  notNeeded(input: NotNeededInput): Promise<ShoppingList>
  /** B5-SH: DELETE /api/shopping/not-needed/{ingredientId}?to=&shop=; answers the list. */
  neededAfterAll(ingredientId: number, to: string, shopId?: number | null): Promise<ShoppingList>
}

/** Typed calls for /api/shopping. */
export function createShopApi(client: HttpClient): ShopApi {
  return {
    list(query = {}) {
      const q = new URLSearchParams()
      if (query.shopId != null) q.set('shop', String(query.shopId))
      if (query.to) q.set('to', query.to)
      const qs = q.toString()
      return client.get<ShoppingList>(`/api/shopping/list${qs ? `?${qs}` : ''}`)
    },
    addExtra: (input) => client.post<ShoppingExtra>('/api/shopping/extras', input),
    deleteExtra: (id) => client.delete<void>(`/api/shopping/extras/${id}`),
    tickExtra: (id, quantity = 0, shopId, clientUuid) => client.post<TickResult>(`/api/shopping/extras/${id}/tick`, { quantity, shopId, clientUuid }),
    untickExtra: (id) => client.delete<void>(`/api/shopping/extras/${id}/tick`),
    tick: (input) => client.post<TickResult>('/api/shopping/ticks', input),
    untick: (ingredientId, to) => client.delete<void>(`/api/shopping/ticks?ingredientId=${ingredientId}&to=${to}`),
    changeTick: (input) => client.patch<ChangeTickResult>('/api/shopping/ticks', input),
    changeExtraTick: (id, quantity) => client.patch<ChangeTickResult>(`/api/shopping/extras/${id}/tick`, { quantity }),
    async untickAddition({ tickClientUuid, clientUuid, scannedAt }) {
      const op = { clientUuid, scannedAt, kind: 'shop_untick', tickClientUuid }
      const answer = await client.post<{ results?: { status: string; error?: { code: string } }[] }>('/api/scan/sync', { ops: [op] })
      const result = answer?.results?.[0]
      if (result?.status === 'rejected') throw new ApiError(409, result.error?.code ?? 'rejected', 'The tick could not be taken back.')
    },
    notNeeded: (input) => client.post<ShoppingList>('/api/shopping/not-needed', input),
    neededAfterAll: (ingredientId, to, shopId) =>
      client.delete<ShoppingList>(`/api/shopping/not-needed/${ingredientId}?to=${to}${shopId != null ? `&shop=${shopId}` : ''}`),
  }
}

export const shopApi: ShopApi = createShopApi(defaultHttp)
