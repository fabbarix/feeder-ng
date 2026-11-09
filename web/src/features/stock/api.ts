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
  void client
  const todo = (): never => {
    throw new Error('TODO')
  }
  return { totals: todo, lots: todo, addLot: todo, setTotal: todo, spoiled: todo, throwOut: todo, keep: todo, cooked: todo }
}

export const stockApi: StockApi = createStockApi(defaultHttp)
