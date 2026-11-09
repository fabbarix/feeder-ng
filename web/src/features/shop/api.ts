import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { ExtraInput, ListQuery, ShoppingExtra, ShoppingList, TickInput, TickResult } from './types'

export interface ShopApi {
  list(query?: ListQuery): Promise<ShoppingList>
  addExtra(input: ExtraInput): Promise<ShoppingExtra>
  deleteExtra(id: number): Promise<void>
  tickExtra(id: number, quantity?: number, shopId?: number | null): Promise<TickResult>
  untickExtra(id: number): Promise<void>
  tick(input: TickInput): Promise<TickResult>
  untick(ingredientId: number, to: string): Promise<void>
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
    tickExtra: (id, quantity = 0, shopId) => client.post<TickResult>(`/api/shopping/extras/${id}/tick`, { quantity, shopId }),
    untickExtra: (id) => client.delete<void>(`/api/shopping/extras/${id}/tick`),
    tick: (input) => client.post<TickResult>('/api/shopping/ticks', input),
    untick: (ingredientId, to) => client.delete<void>(`/api/shopping/ticks?ingredientId=${ingredientId}&to=${to}`),
  }
}

export const shopApi: ShopApi = createShopApi(defaultHttp)
