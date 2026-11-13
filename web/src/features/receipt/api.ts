// Typed calls for /api/scan/receipt (docs/design/receipt-reading.md section 7). Plain TypeScript over the shared HTTP client.
import { ApiError, createHttpClient, type HttpClient, type RequestOptions } from '../../lib/http'
import type { ApplyBody, ApplyOutcome, ReadView, ScanResult, StartReadBody } from './types'

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>

export interface ReceiptApi {
  /** POST /api/scan/receipt/reads: 202 {id}. Rejects with ApiError (409, 429, 422, network). */
  startRead(body: StartReadBody): Promise<{ id: string }>
  /** GET /api/scan/receipt/reads/{id}. Rejects with ApiError (404 = lost). */
  getRead(id: string, opts?: RequestOptions): Promise<ReadView>
  /** DELETE /api/scan/receipt/reads/{id}: 204. */
  cancelRead(id: string, opts?: { keepalive?: boolean }): Promise<void>
  /** POST /api/scan/receipt/apply. Never rejects: a refusal, a 500 and a lost connection are all `ok: false`. */
  apply(body: ApplyBody): Promise<ApplyOutcome>
}

const globalFetch: FetchFn = (input, init) => globalThis.fetch(input, init)

interface ApplyJson {
  applied?: number
  results?: unknown
}

const resultsOf = (body: unknown): ScanResult[] => {
  const results = (body as ApplyJson | null | undefined)?.results
  return Array.isArray(results) ? (results as ScanResult[]) : []
}

/** The apply never rejects: a refusal, a 500 (whose body keeps the put-back scans beside the error, ApiError.body) and a lost
 *  connection are all `ok: false`. */
async function applyCall(client: HttpClient, body: ApplyBody): Promise<ApplyOutcome> {
  try {
    const out = await client.post<ApplyJson | undefined>('/api/scan/receipt/apply', body)
    return { ok: true, applied: out?.applied ?? 0, results: resultsOf(out) }
  } catch (err) {
    if (!(err instanceof ApiError)) return { ok: false, status: 0, code: 'unknown', message: 'The answer could not be read', results: [] }
    const id = err.details.id
    return { ok: false, status: err.status, code: err.code, message: err.message, ...(typeof id === 'string' ? { id } : {}), results: resultsOf(err.body) }
  }
}

/** The receipt calls over `fetchFn` (the global fetch by default; tests pass a fake). */
export function createReceiptApi(fetchFn: FetchFn = globalFetch): ReceiptApi {
  const client = createHttpClient({ fetch: fetchFn })
  return {
    startRead: (body) => client.post<{ id: string }>('/api/scan/receipt/reads', body),
    getRead: (id, opts) => client.get<ReadView>(`/api/scan/receipt/reads/${encodeURIComponent(id)}`, opts),
    cancelRead: (id, opts) => client.delete<void>(`/api/scan/receipt/reads/${encodeURIComponent(id)}`, opts),
    apply: (body) => applyCall(client, body),
  }
}

export const receiptApi: ReceiptApi = createReceiptApi()
