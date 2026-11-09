import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { AddLotInput, IngredientStock, StockLot, StockWarning, WasteRecord } from './types'

export interface StockApi {
  totals(): Promise<IngredientStock[]>
  lots(ingredientId?: number): Promise<StockLot[]>
  addLot(input: AddLotInput): Promise<StockLot>
  setTotal(ingredientId: number, total: number): Promise<{ ingredient: IngredientStock; lots: StockLot[] }>
  spoiled(): Promise<StockLot[]>
  throwOut(lotId: number): Promise<WasteRecord>
  keep(lotId: number): Promise<StockLot>
  cooked(needs: { ingredientId: number; quantity: number }[]): Promise<StockWarning[]>
}

/** Typed calls for /api/stock. See docs/dev/design/t10-stock.md for the routes. */
export function createStockApi(client: HttpClient): StockApi {
  return {
    async totals() {
      return (await client.get<{ ingredients: IngredientStock[] }>('/api/stock')).ingredients
    },
    async lots(ingredientId) {
      const path = ingredientId === undefined ? '/api/stock/lots' : `/api/stock/lots?ingredientId=${ingredientId}`
      return (await client.get<{ lots: StockLot[] }>(path)).lots
    },
    addLot(input) {
      return client.post<StockLot>('/api/stock/lots', input)
    },
    setTotal(ingredientId, total) {
      return client.put<{ ingredient: IngredientStock; lots: StockLot[] }>(`/api/stock/ingredients/${ingredientId}/total`, { total })
    },
    async spoiled() {
      return (await client.get<{ lots: StockLot[] }>('/api/stock/spoiled')).lots
    },
    throwOut(lotId) {
      return client.post<WasteRecord>(`/api/stock/lots/${lotId}/throw-out`)
    },
    keep(lotId) {
      return client.post<StockLot>(`/api/stock/lots/${lotId}/keep`)
    },
    async cooked(needs) {
      return (await client.post<{ warnings: StockWarning[] }>('/api/stock/cooked', { needs })).warnings
    },
  }
}

export const stockApi: StockApi = createStockApi(defaultHttp)
