import { http as defaultHttp, type HttpClient } from '../../lib/http'
import type { OfflineData, Op, ScanResult } from './types'

export interface ScanApi {
  offlineData(shopId?: number | null): Promise<OfflineData>
  /** A rejected operation answers 422 `{status:'rejected', error:{code}}`, which lib/http raises as an ApiError with that code. */
  apply(op: Op): Promise<ScanResult>
  sync(ops: Op[]): Promise<ScanResult[]>
  undo(clientUuid: string): Promise<{ undone: boolean; alreadyUndone?: boolean }>
  setPrice(clientUuid: string, priceCents: number): Promise<ScanResult>
}

export interface ScanApiOptions {
  /** how long a sync may hang before it is given up as offline (ApiError 0 'timeout'); 20 s by default */
  syncTimeoutMs?: number
  /** a signal that aborts after `ms` (AbortSignal.timeout by default); injectable for tests */
  timeoutSignal?: (ms: number) => AbortSignal
}

/** Typed calls for /api/scan. */
export function createScanApi(client: HttpClient, opts: ScanApiOptions = {}): ScanApi {
  const syncTimeoutMs = opts.syncTimeoutMs ?? 20_000
  const timeoutSignal = opts.timeoutSignal ?? ((ms: number) => AbortSignal.timeout(ms))
  return {
    offlineData: (shopId) => client.get<OfflineData>(`/api/scan/offline${shopId != null ? `?shop=${shopId}` : ''}`),
    apply: (op) => client.post<ScanResult>('/api/scan', op),
    async sync(ops) {
      const signal = timeoutSignal(syncTimeoutMs)
      return (await client.post<{ results: ScanResult[] }>('/api/scan/sync', { ops }, { signal })).results
    },
    undo: (uuid) => client.post(`/api/scan/${encodeURIComponent(uuid)}/undo`),
    setPrice: (uuid, priceCents) => client.patch<ScanResult>(`/api/scan/${encodeURIComponent(uuid)}`, { priceCents }),
  }
}

export const scanApi: ScanApi = createScanApi(defaultHttp)
