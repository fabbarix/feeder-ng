import type { WeightRule } from '../scan/lib/barcode'
import { http } from '../../lib/http'
import type { Shop, ShopBarcode, ShopRule } from './types'

export type RuleBody = Omit<WeightRule, 'id'>

export const shopsApi = {
  list: () => http.get<Shop[]>('/api/shops'),
  create: (name: string) => http.post<Shop>('/api/shops', { name }),
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
