/// <reference lib="webworker" />
// The service worker (vite-plugin-pwa, strategies 'injectManifest'). It precaches the app shell (under the scope URL) and
// static assets, answers navigations network first with the cached shell as the fallback, leaves /api and the SSE stream
// to the network, and then loads every extension in ./extensions (push for notifications). It never skips waiting on its
// own: a new version waits until the page asks (RES-10). The behaviour lives in ./shell.ts and ./cache.ts; this file only
// wires it to the worker's events.
import { classifyRequest } from './cache'
import { registerExtensions, type SwExtension, type WorkerScope } from './extensions'
import { activateWorker, answerNavigation, handleWorkerMessage, precacheShell, type ShellEnv } from './shell'

declare const self: ServiceWorkerGlobalScope

interface ManifestEntry {
  url: string
  revision: string | null
}

const manifest: ManifestEntry[] = (self as unknown as { __WB_MANIFEST?: ManifestEntry[] }).__WB_MANIFEST ?? []
const manifestUrls = manifest.map((entry) => entry.url)

const env = (): ShellEnv => ({ caches, fetch: (r) => fetch(r), scope: self.registration.scope })

async function cacheFirst(request: Request): Promise<Response> {
  const cached = await caches.match(request)
  if (cached) return cached
  return fetch(request)
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheShell(env(), manifestUrls))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(activateWorker(env(), manifestUrls, () => self.clients.claim()))
})

self.addEventListener('message', (event) => {
  handleWorkerMessage(event.data, () => self.skipWaiting())
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const kind = classifyRequest({ url: request.url, method: request.method, mode: request.mode }, self.location.origin)
  if (kind === 'navigation') event.respondWith(answerNavigation(env(), request))
  else if (kind === 'static') event.respondWith(cacheFirst(request))
  // api, events and bypass are left to the browser: data is the SPA's job, in IndexedDB.
})

registerExtensions(import.meta.glob('./extensions/*.ts', { eager: true }) as Record<string, SwExtension>, self as unknown as WorkerScope)
