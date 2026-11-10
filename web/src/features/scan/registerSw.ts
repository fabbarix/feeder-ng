// Registers the service worker (src/sw/sw.ts, built to /sw.js) in production builds. Development keeps no worker,
// so Vite's dev server is never answered from a stale cache.
export function registerServiceWorker(nav: Pick<Navigator, 'serviceWorker'> | undefined = globalThis.navigator): void {
  if (!import.meta.env.PROD) return
  if (!nav || !('serviceWorker' in nav) || !nav.serviceWorker) return
  void nav.serviceWorker.register('/sw.js').catch(() => {
    // Offline support is an enhancement; the app works without the worker.
  })
}
