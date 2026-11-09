import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { Bundle, Op, ScanResult } from './types'

export interface ScanApi {
  bundle(shopId?: number | null): Promise<Bundle>
  /** A rejected operation answers 422 `{status:'rejected', error:{code}}`, which lib/http raises as an ApiError with that code. */
  apply(op: Op): Promise<ScanResult>
  sync(ops: Op[]): Promise<ScanResult[]>
  undo(clientUuid: string): Promise<{ undone: boolean; alreadyUndone?: boolean }>
  setPrice(clientUuid: string, priceCents: number): Promise<ScanResult>
}

/** Typed calls for /api/scan. */
export function createScanApi(client: HttpClient): ScanApi {
  return {
    bundle: (shopId) => client.get<Bundle>(`/api/scan/bundle${shopId != null ? `?shop=${shopId}` : ''}`),
    apply: (op) => client.post<ScanResult>('/api/scan', op),
    async sync(ops) {
      return (await client.post<{ results: ScanResult[] }>('/api/scan/sync', { ops })).results
    },
    undo: (uuid) => client.post(`/api/scan/${encodeURIComponent(uuid)}/undo`),
    setPrice: (uuid, priceCents) => client.patch<ScanResult>(`/api/scan/${encodeURIComponent(uuid)}`, { priceCents }),
  }
}

export const scanApi: ScanApi = createScanApi(defaultHttp)
