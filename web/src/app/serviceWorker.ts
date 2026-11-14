// B9-21 (RES-10, A11Y-12): registers the service worker and tells the app when a new version is waiting.
// STUBS: the developer implements them (and removes features/scan/registerSw.ts).
export interface UpdateControls {
  /** asks the browser to look for a new worker now (a failed check is swallowed) */
  checkForUpdate(): Promise<void>
  /** posts SKIP_WAITING to the waiting worker; the page reloads once, on controllerchange */
  applyUpdate(): void
}

export interface RegisterOptions {
  /** default: import.meta.env.PROD (development keeps no worker) */
  enabled?: boolean
  /** default: navigator */
  nav?: { serviceWorker?: unknown }
  /** called once per waiting worker, only when a worker already controls the page */
  onUpdateReady?: (controls: UpdateControls) => void
  /** default: location.reload() */
  reload?: () => void
}

export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

export function registerServiceWorker(_options?: RegisterOptions): void {
  throw new Error('not implemented: registerServiceWorker')
}

/** Subscribes to "an update is ready"; a listener added after it became ready is called at once. Returns the unsubscribe function. */
export function onAppUpdateReady(_listener: (controls: UpdateControls) => void): () => void {
  throw new Error('not implemented: onAppUpdateReady')
}
