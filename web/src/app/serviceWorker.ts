// B9-21 (RES-10, A11Y-12): registers the service worker (src/sw/sw.ts, built to /sw.js) and tells the app when a new
// version is waiting. A new worker never takes over on its own: the page posts SKIP_WAITING when the User asks (Reload),
// and reloads once when the new worker takes control. Plain TypeScript; the toast is app/useAppUpdate.ts's.
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

/** How often an open page looks for a new version, besides each time it becomes visible again. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

/** The message the waiting worker acts on (src/sw/shell.ts handleWorkerMessage). */
const SKIP_WAITING = { type: 'SKIP_WAITING' } as const

interface WorkerLike extends EventTarget {
  state: string
  postMessage(message: unknown): void
}
interface RegistrationLike extends EventTarget {
  waiting: WorkerLike | null
  installing: WorkerLike | null
  active: WorkerLike | null
  update(): Promise<unknown> | void
}
interface ContainerLike extends EventTarget {
  controller: WorkerLike | null
  register(url: string): Promise<RegistrationLike>
}

const listeners = new Set<(controls: UpdateControls) => void>()
/** The newest update that is ready (it may be ready before React mounts, and the shell may mount again after a crash). */
let latest: UpdateControls | null = null

function announce(controls: UpdateControls, onUpdateReady?: (controls: UpdateControls) => void): void {
  latest = controls
  onUpdateReady?.(controls)
  for (const listener of [...listeners]) listener(controls)
}

/**
 * Subscribes to "an update is ready". A listener added after it became ready (a shell mounted late, or again after the
 * page error boundary's "Go to Today") is called at once with the newest one. Returns the unsubscribe function.
 */
export function onAppUpdateReady(listener: (controls: UpdateControls) => void): () => void {
  listeners.add(listener)
  if (latest) listener(latest)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * B9-59: the server runs a newer version than this page (a route chunk of the old build is gone): the same "new version,
 * Reload" prompt, whose Reload reloads the page into the new version. Nothing else is touched: a worker that waits still
 * announces itself as usual.
 */
export function announceNewVersion(reload: () => void = () => globalThis.location.reload()): void {
  announce({ checkForUpdate: async () => {}, applyUpdate: reload })
}

function isContainer(value: unknown): value is ContainerLike {
  return typeof value === 'object' && value !== null && typeof (value as ContainerLike).register === 'function'
}

export function registerServiceWorker(options: RegisterOptions = {}): void {
  if (!(options.enabled ?? import.meta.env.PROD)) return
  const container = (options.nav ?? globalThis.navigator)?.serviceWorker
  if (!isContainer(container)) return
  const reload = options.reload ?? (() => globalThis.location.reload())
  container
    .register('/sw.js')
    .then((registration) => watch(container, registration, reload, options.onUpdateReady))
    .catch(() => {
      // Offline support is an enhancement; the app works without the worker.
    })
}

function watch(container: ContainerLike, registration: RegistrationLike, reload: () => void, onUpdateReady?: (controls: UpdateControls) => void): void {
  const announced = new WeakSet<WorkerLike>()
  let requested = false
  let reloading = false
  /** a new worker took control without this page asking (another tab's Reload, or the beta.8 worker's own claim) */
  let takenOver = false

  const check = (): void => {
    try {
      void Promise.resolve(registration.update()).catch(() => {})
    } catch {
      // a failed check is tried again at the next trigger
    }
  }
  // One controls object per waiting worker, so a caller can tell a newer version from one it already handled.
  const makeControls = (): UpdateControls => ({
    checkForUpdate: async () => {
      try {
        await registration.update()
      } catch {
        // offline or the server down: nothing to report
      }
    },
    applyUpdate: () => {
      const waiting = registration.waiting
      if (waiting) {
        requested = true
        waiting.postMessage(SKIP_WAITING)
        return
      }
      // Nothing waits any more because another Feeder tab applied the update: the new worker already controls this page,
      // which still runs the old code, so Reload just reloads it (once).
      if (takenOver && !reloading) {
        reloading = true
        reload()
      }
    },
  })

  const reportWaiting = (): void => {
    const waiting = registration.waiting
    // The very first install has nothing to update: no worker controls the page yet.
    if (!waiting || !(container.controller ?? registration.active)) return
    if (announced.has(waiting)) return
    announced.add(waiting)
    announce(makeControls(), onUpdateReady)
  }

  container.addEventListener('controllerchange', () => {
    // Only the change the User asked for reloads: the beta.8 worker still claims on its own, and so does a first install.
    if (!requested) takenOver = true
    if (!requested || reloading) return
    reloading = true
    reload()
  })
  registration.addEventListener('updatefound', () => {
    const installing = registration.installing
    if (!installing) return
    installing.addEventListener('statechange', () => {
      if (installing.state === 'installed') reportWaiting()
    })
  })
  globalThis.document?.addEventListener('visibilitychange', () => {
    if (globalThis.document.visibilityState === 'visible') check()
  })
  setInterval(check, UPDATE_CHECK_INTERVAL_MS)
  reportWaiting()
}
