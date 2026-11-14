// B9-21 (RES-10, A11Y-12): the page side of the update flow, against a fake ServiceWorkerContainer. No real worker is registered.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeContainer, FakeWorker, flush, setVisibility } from '../test/swFakes'
import { onAppUpdateReady, registerServiceWorker, UPDATE_CHECK_INTERVAL_MS, type UpdateControls } from './serviceWorker'

let container: FakeContainer
const reload = vi.fn()

function start(opts: { controlled?: boolean; enabled?: boolean } = {}) {
  container = new FakeContainer(opts.controlled ?? true)
  const onUpdateReady = vi.fn<(controls: UpdateControls) => void>()
  registerServiceWorker({ enabled: opts.enabled ?? true, nav: { serviceWorker: container }, onUpdateReady, reload })
  return { onUpdateReady }
}

beforeEach(() => {
  reload.mockReset()
  setVisibility('visible')
})
afterEach(() => vi.useRealTimers())

describe('registration', () => {
  it('registers /sw.js', async () => {
    start()
    await flush()
    expect(container.register).toHaveBeenCalledTimes(1)
    expect(container.register.mock.calls[0]![0]).toBe('/sw.js')
  })

  it('registers nothing when not enabled (development keeps no worker, so the dev server is never answered from a cache)', async () => {
    start({ enabled: false })
    await flush()
    expect(container.register).not.toHaveBeenCalled()
  })

  it('is enabled only in production builds by default', async () => {
    container = new FakeContainer()
    registerServiceWorker({ nav: { serviceWorker: container } }) // vitest is not a PROD build
    await flush()
    expect(container.register).not.toHaveBeenCalled()
  })

  it('does nothing in a browser without service workers', () => {
    expect(() => registerServiceWorker({ enabled: true, nav: {} })).not.toThrow()
    expect(() => registerServiceWorker({ enabled: true, nav: { serviceWorker: undefined } })).not.toThrow()
  })

  it('a failed registration is swallowed: the app works without the worker', async () => {
    container = new FakeContainer()
    container.register.mockRejectedValueOnce(new Error('SecurityError'))
    const onUpdateReady = vi.fn()
    expect(() => registerServiceWorker({ enabled: true, nav: { serviceWorker: container }, onUpdateReady, reload })).not.toThrow()
    await flush()
    expect(onUpdateReady).not.toHaveBeenCalled()
  })
})

describe('"an update is ready" (a worker is waiting while another controls the page)', () => {
  it('is reported when a worker is already waiting at registration (the update installed in an earlier visit)', async () => {
    container = new FakeContainer(true)
    container.registration.waiting = new FakeWorker('installed')
    const onUpdateReady = vi.fn()
    registerServiceWorker({ enabled: true, nav: { serviceWorker: container }, onUpdateReady, reload })
    await flush()
    expect(onUpdateReady).toHaveBeenCalledTimes(1)
  })

  it('is reported when a new worker finishes installing while the page is open', async () => {
    const { onUpdateReady } = start()
    await flush()
    const worker = container.registration.startInstalling()
    expect(onUpdateReady).not.toHaveBeenCalled() // still installing
    container.registration.finishInstalling(worker)
    expect(onUpdateReady).toHaveBeenCalledTimes(1)
  })

  it('is NOT reported for the very first install: no worker controls the page, so there is nothing to update', async () => {
    const { onUpdateReady } = start({ controlled: false })
    await flush()
    container.registration.finishInstalling(container.registration.startInstalling())
    expect(onUpdateReady).not.toHaveBeenCalled()
  })

  it('is reported once for one waiting worker, however often updates are checked', async () => {
    const { onUpdateReady } = start()
    await flush()
    container.registration.finishInstalling(container.registration.startInstalling())
    setVisibility('hidden')
    setVisibility('visible')
    setVisibility('visible')
    await flush()
    expect(onUpdateReady).toHaveBeenCalledTimes(1)
  })

  it('a second new version while the first still waits is reported again (the toast then offers the newest)', async () => {
    const { onUpdateReady } = start()
    await flush()
    container.registration.finishInstalling(container.registration.startInstalling())
    container.registration.finishInstalling(container.registration.startInstalling())
    expect(onUpdateReady).toHaveBeenCalledTimes(2)
  })
})

describe('looking for updates (A11Y-12 / RES-10: when the page becomes visible, and once an hour)', () => {
  it('calls registration.update() when the page becomes visible again', async () => {
    start()
    await flush()
    container.registration.update.mockClear()
    setVisibility('hidden')
    expect(container.registration.update).not.toHaveBeenCalled() // hiding the page checks nothing
    setVisibility('visible')
    expect(container.registration.update).toHaveBeenCalledTimes(1)
  })

  it('calls registration.update() once an hour while the page is open', async () => {
    vi.useFakeTimers()
    start()
    await vi.advanceTimersByTimeAsync(0)
    container.registration.update.mockClear()
    expect(UPDATE_CHECK_INTERVAL_MS).toBe(3_600_000)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS - 1)
    expect(container.registration.update).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(container.registration.update).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(UPDATE_CHECK_INTERVAL_MS)
    expect(container.registration.update).toHaveBeenCalledTimes(2)
  })

  it('a failed check (offline, the server down) is swallowed, tells nobody and is tried again at the next trigger', async () => {
    const { onUpdateReady } = start()
    await flush()
    container.registration.update.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    setVisibility('hidden')
    setVisibility('visible')
    await flush()
    await flush()
    // an unhandled rejection would fail this run: vitest reports it as an error
    expect(onUpdateReady).not.toHaveBeenCalled()
    setVisibility('hidden')
    setVisibility('visible')
    expect(container.registration.update).toHaveBeenCalledTimes(2) // the failed check and the retry
  })

  it('the controls offer the same check on demand', async () => {
    const { onUpdateReady } = start()
    await flush()
    container.registration.finishInstalling(container.registration.startInstalling())
    const controls = onUpdateReady.mock.calls[0]![0]
    container.registration.update.mockClear()
    await controls.checkForUpdate()
    expect(container.registration.update).toHaveBeenCalledTimes(1)
    container.registration.update.mockRejectedValueOnce(new Error('offline'))
    await expect(controls.checkForUpdate()).resolves.toBeUndefined()
  })
})

describe('applying the update (Reload)', () => {
  async function ready() {
    const { onUpdateReady } = start()
    await flush()
    const worker = container.registration.startInstalling()
    container.registration.finishInstalling(worker)
    return { controls: onUpdateReady.mock.calls[0]![0], worker }
  }

  it('posts {type: "SKIP_WAITING"} to the waiting worker, and does not reload yet', async () => {
    const { controls, worker } = await ready()
    controls.applyUpdate()
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' })
    expect(reload).not.toHaveBeenCalled()
  })

  it('reloads when the new worker takes control (controllerchange), once even if the event fires twice', async () => {
    const { controls } = await ready()
    controls.applyUpdate()
    container.controllerChange()
    container.controllerChange()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads on a controllerchange the User did not ask for (the beta.8 worker still auto-claims, and a first install claims too)', async () => {
    await ready()
    container.controllerChange()
    expect(reload).not.toHaveBeenCalled()
  })

  it('two tabs: after the other tab applied the update (a controllerchange this tab did not ask for), Reload here reloads once', async () => {
    const { controls, worker } = await ready()
    // the other tab posted SKIP_WAITING: the worker activated and claimed this page too
    container.registration.waiting = null
    container.controllerChange()
    expect(reload).not.toHaveBeenCalled() // never on its own: this page may be in the middle of something
    controls.applyUpdate()
    controls.applyUpdate()
    expect(worker.postMessage).not.toHaveBeenCalled()
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('does nothing when no worker is waiting any more (nothing posted, no reload)', async () => {
    const { controls, worker } = await ready()
    container.registration.waiting = null
    controls.applyUpdate()
    expect(worker.postMessage).not.toHaveBeenCalled()
    container.controllerChange()
    expect(reload).not.toHaveBeenCalled()
  })
})

describe('onAppUpdateReady (what the shell subscribes to)', () => {
  it('calls the listener when an update is ready, and a listener that subscribes later at once (the update may be ready before React mounts)', async () => {
    container = new FakeContainer(true)
    container.registration.waiting = new FakeWorker('installed')
    registerServiceWorker({ enabled: true, nav: { serviceWorker: container }, reload })
    await flush()
    const late = vi.fn()
    const off = onAppUpdateReady(late)
    expect(late).toHaveBeenCalledTimes(1)
    expect(late.mock.calls[0]![0]).toEqual(expect.objectContaining({ applyUpdate: expect.any(Function), checkForUpdate: expect.any(Function) }))
    off()
  })

  it('stops calling a listener after its unsubscribe function ran', async () => {
    const listener = vi.fn()
    const off = onAppUpdateReady(listener)
    off()
    start()
    await flush()
    container.registration.finishInstalling(container.registration.startInstalling())
    expect(listener).not.toHaveBeenCalled()
  })
})
