// Pure request classification for the service worker (functional spec §10.3). The worker precaches the app shell
// and static assets only; data (the Shopping List, the offline data, the queue) lives in IndexedDB, owned by the
// SPA. No DOM or worker globals here, so it is unit-tested.

export type RequestClass =
  /** a page load: answer from the precached index.html when the network fails */
  | 'navigation'
  /** the SSE stream: never touched by the worker */
  | 'events'
  /** any other /api call: network only, never cached */
  | 'api'
  /** a built asset (hashed JS/CSS, fonts, icons): served from the precache */
  | 'static'
  /** anything else (cross-origin, non-GET): the browser handles it */
  | 'bypass'

export interface RequestInfo {
  url: string
  method: string
  /** Request.mode */
  mode: string
}

/** `origin` is the worker's own origin; cross-origin requests are bypassed. */
export function classifyRequest(req: RequestInfo, origin: string): RequestClass {
  const url = new URL(req.url)
  if (url.origin !== origin) return 'bypass'
  if (req.method.toUpperCase() !== 'GET') return 'bypass'
  if (url.pathname === '/api/events') return 'events'
  if (url.pathname.startsWith('/api/')) return 'api'
  if (req.mode === 'navigate') return 'navigation'
  return 'static'
}

/**
 * The cached URLs that the current precache manifest no longer lists: removed when the worker activates, so an old
 * build's assets do not pile up. `manifestUrls` are as the manifest writes them (relative to `scope`).
 */
export function staleCacheUrls(cachedUrls: readonly string[], manifestUrls: readonly string[], scope: string): string[] {
  const wanted = new Set(manifestUrls.map((u) => new URL(u, scope).href))
  return cachedUrls.filter((u) => !wanted.has(u))
}

/**
 * The precache manifest URLs without duplicates (first occurrence wins, order kept), resolved against `scope`.
 * Cache.addAll rejects with InvalidStateError on duplicate requests, which stops the worker from installing.
 */
export function uniquePrecacheUrls(manifestUrls: readonly string[], scope: string): string[] {
  const seen = new Set<string>()
  const urls: string[] = []
  for (const u of manifestUrls) {
    const href = new URL(u, scope).href
    if (seen.has(href)) continue
    seen.add(href)
    urls.push(href)
  }
  return urls
}

/** B9-21 stubs (RES-01): the tests pin these; the developer implements them. */
/** The shell cache. The name is the FORMAT of what is stored (v2: the redirected index.html of v1 is dropped), not the build. */
export const SHELL_CACHE = 'feeder-shell-v2'
/** A navigation the network has not answered after this long (lie-fi) is answered from the cached shell. */
export const NAVIGATION_TIMEOUT_MS = 4000

/** The shell's cache key: the scope URL itself (`https://host/`), never `index.html`. */
export function shellUrl(_scope: string): string {
  throw new Error('not implemented: shellUrl')
}

/** True when a cached shell may answer a navigation: a 200 that is not a redirected response. */
export function isUsableShell(_response: Pick<Response, 'ok' | 'status' | 'redirected'> | undefined | null): boolean {
  throw new Error('not implemented: isUsableShell')
}
