// Typed JSON client for the Feeder API. Plain TypeScript, no React.

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Every other key of the response's `error` object (e.g. `field`, `reason`, `unit`), for typed handling. */
  readonly details: Readonly<Record<string, unknown>>

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface HttpClientOptions {
  fetch?: FetchLike
  baseUrl?: string
  onUnauthenticated?: () => void
}

export interface RequestOptions {
  /** lets the request outlive the page (fetch keepalive), for a best-effort call on unmount or unload */
  keepalive?: boolean
  /** aborts the request; an abort with a TimeoutError reason is raised as ApiError(0, 'timeout') */
  signal?: AbortSignal
}

export interface HttpClient {
  get<T>(path: string, opts?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>
  put<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, opts?: RequestOptions): Promise<T>
  delete<T>(path: string, opts?: RequestOptions): Promise<T>
  /** BR-D: a DELETE with a JSON body (the unlink of a Base recipe line names the Ingredient). */
  deleteJson<T>(path: string, body: unknown): Promise<T>
}

// Resolved at call time so tests can stub the global fetch after import.
const globalFetch: FetchLike = (input, init) => globalThis.fetch(input, init)

export function createHttpClient(opts: HttpClientOptions = {}): HttpClient {
  const doFetch = opts.fetch ?? globalFetch
  const baseUrl = opts.baseUrl ?? ''

  async function request<T>(method: string, path: string, body?: unknown, reqOpts: RequestOptions = {}): Promise<T> {
    const headers: Record<string, string> = {}
    let payload: string | undefined
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    let res: Response
    try {
      res = await doFetch(baseUrl + path, { method, headers, body: payload, credentials: 'same-origin', signal: reqOpts.signal, ...(reqOpts.keepalive ? { keepalive: true } : {}) })
    } catch (err) {
      if (isTimeoutError(err)) throw new ApiError(0, 'timeout', 'The request timed out')
      throw new ApiError(0, 'network', 'The network is unreachable')
    }
    if (!res.ok) {
      const err = await readError(res)
      if (res.status === 401) opts.onUnauthenticated?.()
      throw err
    }
    if (res.status === 204) return undefined as T
    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  return {
    get: <T>(path: string, opts?: RequestOptions) => request<T>('GET', path, undefined, opts),
    post: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('POST', path, body, opts),
    put: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PUT', path, body, opts),
    patch: <T>(path: string, body?: unknown, opts?: RequestOptions) => request<T>('PATCH', path, body, opts),
    delete: <T>(path: string, opts?: RequestOptions) => request<T>('DELETE', path, undefined, opts),
    deleteJson: <T>(path: string, body: unknown) => request<T>('DELETE', path, body),
  }
}

/** The reason of a signal that fired by timeout (AbortSignal.timeout), as fetch rejects with it. */
const isTimeoutError = (err: unknown): boolean => (err as { name?: unknown } | null)?.name === 'TimeoutError'

async function readError(res: Response): Promise<ApiError> {
  try {
    const parsed = JSON.parse(await res.text()) as { error?: { code?: unknown; message?: unknown } & Record<string, unknown> }
    const code = parsed.error?.code
    if (typeof code === 'string') {
      const message = typeof parsed.error?.message === 'string' ? parsed.error.message : res.statusText
      const { code: _code, message: _message, ...details } = parsed.error ?? {}
      return new ApiError(res.status, code, message, details)
    }
  } catch {
    // Not the error shape; fall through.
  }
  return new ApiError(res.status, 'http_error', res.statusText || 'The request failed')
}

/** The default client: same-origin, JSON. */
export const http: HttpClient = createHttpClient()
