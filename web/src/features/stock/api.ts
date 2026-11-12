import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { AddLotInput, IngredientStock, LotPatch, StockLot, StockLotsResponse, StockWarning, StoragePlace, StoragePlaceInput, WasteRecord } from './types'

export interface StockApi {
  totals(): Promise<IngredientStock[]>
  lots(ingredientId?: number): Promise<StockLotsResponse>
  addLot(input: AddLotInput): Promise<StockLot>
  setTotal(ingredientId: number, total: number): Promise<{ ingredient: IngredientStock; lots: StockLot[] }>
  spoiled(): Promise<StockLotsResponse>
  throwOut(lotId: number): Promise<WasteRecord>
  keep(lotId: number): Promise<StockLot>
  cooked(needs: { ingredientId: number; quantity: number }[]): Promise<StockWarning[]>
  /** Pantry: moves a Lot, or `quantity` of it (absent = all), to a Storage Place. */
  moveLot(lotId: number, storagePlaceId: number, quantity?: number): Promise<StockLot>
  /** Beta.5: corrects a Lot (quantity, Bought on, Good until); resolves with the corrected Lot. */
  updateLot(lotId: number, patch: LotPatch): Promise<StockLot>
  /** Beta.5: deletes a Lot as a correction (not waste); a gone-off Lot's go-off goes with it. */
  deleteLot(lotId: number): Promise<void>
  storagePlaces(): Promise<StoragePlace[]>
  createPlace(input: StoragePlaceInput): Promise<StoragePlace>
  updatePlace(id: number, input: StoragePlaceInput): Promise<StoragePlace>
  deletePlace(id: number): Promise<void>
}

/** Typed calls for /api/stock. See docs/dev/design/t10-stock.md for the routes. */
export function createStockApi(client: HttpClient): StockApi {
  return {
    async totals() {
      return (await client.get<{ ingredients: IngredientStock[] }>('/api/stock')).ingredients
    },
    lots(ingredientId) {
      const path = ingredientId === undefined ? '/api/stock/lots' : `/api/stock/lots?ingredientId=${ingredientId}`
      return client.get<StockLotsResponse>(path)
    },
    addLot(input) {
      return client.post<StockLot>('/api/stock/lots', input)
    },
    setTotal(ingredientId, total) {
      return client.put<{ ingredient: IngredientStock; lots: StockLot[] }>(`/api/stock/ingredients/${ingredientId}/total`, { total })
    },
    spoiled() {
      return client.get<StockLotsResponse>('/api/stock/spoiled')
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
    moveLot(lotId, storagePlaceId, quantity) {
      return client.post<StockLot>(`/api/stock/lots/${lotId}/move`, quantity === undefined ? { storagePlaceId } : { storagePlaceId, quantity })
    },
    updateLot() {
      return Promise.reject(new Error('not implemented (b5-st)'))
    },
    deleteLot() {
      return Promise.reject(new Error('not implemented (b5-st)'))
    },
    storagePlaces() {
      return client.get<StoragePlace[]>('/api/storage-places')
    },
    createPlace(input) {
      return client.post<StoragePlace>('/api/storage-places', input)
    },
    updatePlace(id, input) {
      return client.patch<StoragePlace>(`/api/storage-places/${id}`, input)
    },
    deletePlace(id) {
      return client.delete<void>(`/api/storage-places/${id}`)
    },
  }
}

export const stockApi: StockApi = createStockApi(defaultHttp)
