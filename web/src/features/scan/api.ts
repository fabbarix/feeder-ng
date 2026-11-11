import { http as defaultHttp, type HttpClient } from '../../lib/http'
import { IMAGE_UPLOAD_PATH } from '../../ui/ImagePicker/api'
import { blobToDataUrl } from '../../ui/ImagePicker/lib/imageUrl'
import type { ArchivedProduct } from './lib/archivedProduct'
import type { OfflineData, Op, ScanResult } from './types'

export interface ScanApi {
  offlineData(shopId?: number | null): Promise<OfflineData>
  /** A rejected operation answers 422 `{status:'rejected', error:{code}}`, which lib/http raises as an ApiError with that code. */
  apply(op: Op): Promise<ScanResult>
  sync(ops: Op[]): Promise<ScanResult[]>
  /** PPX: POST /api/images {dataUrl} for a Picture queued offline (the ImagePicker's endpoint); answers the image id. */
  uploadPicture(blob: Blob): Promise<string>
  undo(clientUuid: string): Promise<{ undone: boolean; alreadyUndone?: boolean }>
  setPrice(clientUuid: string, priceCents: number): Promise<ScanResult>
  /** R8: GET /api/resolve?barcode=&shop=; `archivedProduct` is set when only an archived Product owns the code */
  findArchived(barcode: string, shopId: number | null): Promise<ArchivedProduct | null>
  /** R8: GET /api/products/{id} (an archived Product is served too), for its name */
  product(id: number): Promise<ArchivedProduct>
  /** R8: POST /api/products/{id}/unarchive; answers the Product */
  unarchiveProduct(id: number): Promise<ArchivedProduct>
}

export interface ScanApiOptions {
  /** how long a sync may hang before it is given up as offline (ApiError 0 'timeout'); 20 s by default */
  syncTimeoutMs?: number
  /** how long a Picture upload may hang before it is given up as offline (ApiError 0 'timeout'); 20 s by default */
  uploadTimeoutMs?: number
  /** a signal that aborts after `ms` (AbortSignal.timeout by default); injectable for tests */
  timeoutSignal?: (ms: number) => AbortSignal
}

/** Typed calls for /api/scan. */
export function createScanApi(client: HttpClient, opts: ScanApiOptions = {}): ScanApi {
  const syncTimeoutMs = opts.syncTimeoutMs ?? 20_000
  const uploadTimeoutMs = opts.uploadTimeoutMs ?? 20_000
  const timeoutSignal = opts.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms))
  return {
    offlineData: (shopId) => client.get<OfflineData>(`/api/scan/offline${shopId != null ? `?shop=${shopId}` : ''}`),
    apply: (op) => client.post<ScanResult>('/api/scan', op),
    async sync(ops) {
      const signal = timeoutSignal(syncTimeoutMs)
      return (await client.post<{ results: ScanResult[] }>('/api/scan/sync', { ops }, { signal })).results
    },
    async uploadPicture(blob) {
      const dataUrl = await blobToDataUrl(blob)
      const signal = timeoutSignal(uploadTimeoutMs)
      return (await client.post<{ id: string }>(IMAGE_UPLOAD_PATH, { dataUrl }, { signal })).id
    },
    undo: (uuid) => client.post(`/api/scan/${encodeURIComponent(uuid)}/undo`),
    setPrice: (uuid, priceCents) => client.patch<ScanResult>(`/api/scan/${encodeURIComponent(uuid)}`, { priceCents }),
    async findArchived(barcode, shopId) {
      const q = new URLSearchParams({ barcode })
      if (shopId != null) q.set('shop', String(shopId))
      return (await client.get<{ archivedProduct: ArchivedProduct | null }>(`/api/resolve?${q}`)).archivedProduct
    },
    product: (id) => client.get<ArchivedProduct>(`/api/products/${id}`),
    unarchiveProduct: (id) => client.post<ArchivedProduct>(`/api/products/${id}/unarchive`),
  }
}

export const scanApi: ScanApi = createScanApi(defaultHttp)
