/// <reference lib="webworker" />
// The service worker (vite-plugin-pwa, strategies 'injectManifest'). Owned by the shopping/scan team (T13).
// It precaches the app shell and static assets, answers navigations from the precached index.html, leaves /api and
// the SSE stream to the network, and then loads every extension in ./extensions (push for notifications later).
// Stub until the Developer implements it; classification lives in ./cache.ts, extension loading in ./extensions.ts.
//
// Intended body:
//   import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
//   import { NavigationRoute, registerRoute } from 'workbox-routing'
//   declare const self: ServiceWorkerGlobalScope
//   precacheAndRoute(self.__WB_MANIFEST); cleanupOutdatedCaches()
//   registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html'), { denylist: [/^\/api\//] }))
//   self.skipWaiting(); self.clients.claim()   // registerType 'autoUpdate'
//   registerExtensions(import.meta.glob('./extensions/*.ts', { eager: true }), self)
export {}
