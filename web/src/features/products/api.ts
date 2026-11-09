import { http } from '../../lib/http'
import type { Catalog, Resolution } from '../scan/lib/barcode'
import type { NewProduct, Price, PriceBody, Product, ProductDetail } from './types'

const base = '/api/products'

export interface ProductFilter {
  q?: string
  ingredient?: number
  barcode?: string
}

function query(f: ProductFilter): string {
  const p = new URLSearchParams()
  if (f.q) p.set('q', f.q)
  if (f.ingredient) p.set('ingredient', String(f.ingredient))
  if (f.barcode) p.set('barcode', f.barcode)
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const productsApi = {
  list: (f: ProductFilter = {}) => http.get<Product[]>(`${base}${query(f)}`),
  get: (id: number) => http.get<ProductDetail>(`${base}/${id}`),
  create: (body: NewProduct) => http.post<ProductDetail>(base, body),
  patch: (id: number, body: { name?: string; packSize?: number }) => http.patch<ProductDetail>(`${base}/${id}`, body),
  remove: (id: number) => http.delete<void>(`${base}/${id}`),
  addBarcode: (id: number, code: string) => http.post<void>(`${base}/${id}/barcodes`, { code }),
  removeBarcode: (id: number, code: string) => http.delete<void>(`${base}/${id}/barcodes/${encodeURIComponent(code)}`),
  setSoldAt: (id: number, shopId: number) => http.put<void>(`${base}/${id}/shops/${shopId}`, {}),
  unsetSoldAt: (id: number, shopId: number) => http.delete<void>(`${base}/${id}/shops/${shopId}`),
  prices: (id: number, shopId?: number) => http.get<Price[]>(`${base}/${id}/prices${shopId ? `?shop=${shopId}` : ''}`),
  latestPrice: (id: number, shopId?: number) =>
    http.get<Price | null>(`${base}/${id}/prices/latest${shopId ? `?shop=${shopId}` : ''}`),
  recordPrice: (id: number, body: PriceBody) => http.put<Price>(`${base}/${id}/prices`, body),
  deletePrice: (priceId: number) => http.delete<void>(`/api/prices/${priceId}`),
  /** The Product last bought for an Ingredient (at the Shop if known); null when none was bought. */
  lastBought: async (ingredientId: number, shopId?: number): Promise<Product | null> => {
    try {
      return await http.get<Product>(`${base}/last-bought?ingredient=${ingredientId}${shopId ? `&shop=${shopId}` : ''}`)
    } catch (err) {
      if ((err as { status?: number }).status === 404) return null
      throw err
    }
  },
  recordPurchase: (productId: number, date: string, shopId?: number) =>
    http.post<{ id: number }>('/api/purchases', { productId, date, ...(shopId ? { shopId } : {}) }),
  deletePurchase: (id: number) => http.delete<void>(`/api/purchases/${id}`),
  /** The offline cache payload for one Shop (home when omitted). */
  catalog: (shopId?: number) => http.get<Catalog>(`/api/catalog${shopId ? `?shop=${shopId}` : ''}`),
  resolve: (barcode: string, format = '', shopId?: number) =>
    http.get<{ resolution: Resolution; product: Product | null }>(
      `/api/resolve?barcode=${encodeURIComponent(barcode)}${format ? `&format=${format}` : ''}${shopId ? `&shop=${shopId}` : ''}`,
    ),
}
