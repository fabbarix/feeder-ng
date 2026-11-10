/// <reference lib="webworker" />
// The service worker (vite-plugin-pwa, strategies 'injectManifest'). It precaches the app shell and static assets,
// answers navigations from the precached index.html, leaves /api and the SSE stream to the network, and then loads
// every extension in ./extensions (push for notifications later). Classification lives in ./cache.ts and extension
// loading in ./extensions.ts; the cache is the Cache API directly, so no Workbox runtime is needed.
import { classifyRequest, staleCacheUrls } from './cache'
import { registerExtensions, type SwExtension, type WorkerScope } from './extensions'

declare const self: ServiceWorkerGlobalScope

const SHELL_CACHE = 'feeder-shell-v1'
const SHELL_ENTRY = 'index.html'

interface ManifestEntry {
  url: string
  revision: string | null
}

const manifest: ManifestEntry[] = (self as unknown as { __WB_MANIFEST?: ManifestEntry[] }).__WB_MANIFEST ?? []

async function precache(): Promise<void> {
  const cache = await caches.open(SHELL_CACHE)
  await cache.addAll(manifest.map((entry) => new Request(entry.url, { cache: 'reload' })))
}

async function networkFirstPage(request: Request): Promise<Response> {
  try {
    return await fetch(request)
  } catch {
    const shell = await caches.match(new URL(SHELL_ENTRY, self.registration.scope).href)
    return shell ?? Response.error()
  }
}

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) {
    const cache = await caches.open(SHELL_CACHE)
    await cache.put(request, response.clone())
  }
  return response
}

self.addEventListener('install', (event) => {
  event.waitUntil(precache().then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== SHELL_CACHE) await caches.delete(key)
      }
      // Entries of an earlier build that the current manifest no longer lists go.
      const cache = await caches.open(SHELL_CACHE)
      const stale = staleCacheUrls((await cache.keys()).map((r) => r.url), manifest.map((e) => e.url), self.registration.scope)
      await Promise.all(stale.map((url) => cache.delete(url)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const kind = classifyRequest({ url: request.url, method: request.method, mode: request.mode }, self.location.origin)
  if (kind === 'navigation') event.respondWith(networkFirstPage(request))
  else if (kind === 'static') event.respondWith(cacheFirst(request))
  // api, events and bypass are left to the browser: data is the SPA's job, in IndexedDB.
})

registerExtensions(import.meta.glob('./extensions/*.ts', { eager: true }) as Record<string, SwExtension>, self as unknown as WorkerScope)
