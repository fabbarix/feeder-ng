// Typed JSON client for the Feeder API. Plain TypeScript, no React.

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface HttpClientOptions {
  fetch?: FetchLike
  baseUrl?: string
  onUnauthenticated?: () => void
}

export interface HttpClient {
  get<T>(path: string): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  put<T>(path: string, body?: unknown): Promise<T>
  patch<T>(path: string, body?: unknown): Promise<T>
  delete<T>(path: string): Promise<T>
}

// Resolved at call time so tests can stub the global fetch after import.
const globalFetch: FetchLike = (input, init) => globalThis.fetch(input, init)

export function createHttpClient(opts: HttpClientOptions = {}): HttpClient {
  const doFetch = opts.fetch ?? globalFetch
  const baseUrl = opts.baseUrl ?? ''

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {}
    let payload: string | undefined
    if (body !== undefined) {
      headers['Content-Type'] = 'application/json'
      payload = JSON.stringify(body)
    }
    let res: Response
    try {
      res = await doFetch(baseUrl + path, { method, headers, body: payload, credentials: 'same-origin' })
    } catch {
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
    get: <T>(path: string) => request<T>('GET', path),
    post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
    put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body),
    patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body),
    delete: <T>(path: string) => request<T>('DELETE', path),
  }
}

async function readError(res: Response): Promise<ApiError> {
  try {
    const parsed = JSON.parse(await res.text()) as { error?: { code?: unknown; message?: unknown } }
    const code = parsed.error?.code
    if (typeof code === 'string') {
      const message = typeof parsed.error?.message === 'string' ? parsed.error.message : res.statusText
      return new ApiError(res.status, code, message)
    }
  } catch {
    // Not the error shape; fall through.
  }
  return new ApiError(res.status, 'http_error', res.statusText || 'The request failed')
}

/** The default client: same-origin, JSON. */
export const http: HttpClient = createHttpClient()
