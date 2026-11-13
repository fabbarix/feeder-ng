// Typed calls for /api/scan/receipt (docs/design/receipt-reading.md section 7). Plain TypeScript over the shared HTTP client.
import { createHttpClient, type RequestOptions } from '../../lib/http'
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

/** The apply answers its results beside the error (a 500 keeps the put-back scans), which the typed client does not keep, so it reads the response itself. */
async function applyCall(doFetch: FetchFn, body: ApplyBody): Promise<ApplyOutcome> {
  let res: Response
  try {
    res = await doFetch('/api/scan/receipt/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'The network is unreachable'
    return { ok: false, status: 0, code: 'network', message, results: [] }
  }
  const parsed = await readJson(res)
  const results: ScanResult[] = Array.isArray(parsed?.results) ? parsed.results : []
  if (res.ok) return { ok: true, applied: parsed?.applied ?? 0, results }
  const error = parsed?.error
  if (error && typeof error.code === 'string') {
    return {
      ok: false,
      status: res.status,
      code: error.code,
      message: typeof error.message === 'string' ? error.message : res.statusText,
      ...(typeof error.id === 'string' ? { id: error.id } : {}),
      results,
    }
  }
  return { ok: false, status: res.status, code: 'http_error', message: res.statusText || 'The request failed', results }
}

interface ApplyJson {
  applied?: number
  results?: ScanResult[]
  error?: { code?: unknown; message?: unknown; id?: unknown }
}

async function readJson(res: Response): Promise<ApplyJson | undefined> {
  try {
    return JSON.parse(await res.text()) as ApplyJson
  } catch {
    return undefined
  }
}

/** The receipt calls over `fetchFn` (the global fetch by default; tests pass a fake). */
export function createReceiptApi(fetchFn: FetchFn = globalFetch): ReceiptApi {
  const client = createHttpClient({ fetch: fetchFn })
  return {
    startRead: (body) => client.post<{ id: string }>('/api/scan/receipt/reads', body),
    getRead: (id, opts) => client.get<ReadView>(`/api/scan/receipt/reads/${encodeURIComponent(id)}`, opts),
    cancelRead: (id, opts) => client.delete<void>(`/api/scan/receipt/reads/${encodeURIComponent(id)}`, opts),
    apply: (body) => applyCall(fetchFn, body),
  }
}

export const receiptApi: ReceiptApi = createReceiptApi()
