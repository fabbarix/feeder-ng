import type { WeightRule } from '../scan/lib/barcode'
import { http } from '../../lib/http'
import type { Shop, ShopBarcode, ShopLocation, ShopRule } from './types'

export type RuleBody = Omit<WeightRule, 'id'>

export const shopsApi = {
  list: () => http.get<Shop[]>('/api/shops'),
  /** any User; `location` is the Shop Location when the User is standing in the Shop */
  create: (name: string, location?: ShopLocation | null) => http.post<Shop>('/api/shops', location ? { name, location } : { name }),
  /** any User: saves where the Shop is */
  setLocation: (id: number, location: ShopLocation) => http.put<Shop>(`/api/shops/${id}/location`, location),
  rename: (id: number, name: string) => http.patch<Shop>(`/api/shops/${id}`, { name }),
  remove: (id: number) => http.delete<void>(`/api/shops/${id}`),
  rules: (shopId: number) => http.get<ShopRule[]>(`/api/shops/${shopId}/weight-rules`),
  createRule: (shopId: number, body: RuleBody) => http.post<ShopRule>(`/api/shops/${shopId}/weight-rules`, body),
  updateRule: (id: number, body: RuleBody) => http.put<ShopRule>(`/api/weight-rules/${id}`, body),
  deleteRule: (id: number) => http.delete<void>(`/api/weight-rules/${id}`),
  barcodes: (shopId: number) => http.get<ShopBarcode[]>(`/api/shops/${shopId}/barcodes`),
  addBarcode: (shopId: number, body: { productId: number; code: string } | { productId: number; ruleId: number; itemCode: string }) =>
    http.post<ShopBarcode>(`/api/shops/${shopId}/barcodes`, body),
  deleteBarcode: (id: number) => http.delete<void>(`/api/shop-barcodes/${id}`),
}
