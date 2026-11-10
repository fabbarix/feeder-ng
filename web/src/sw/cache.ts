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
