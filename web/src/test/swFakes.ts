// Fakes for the service worker tests (B9-21). No real worker is ever registered: the page side is tested against a fake
// ServiceWorkerContainer, the worker side against an in-memory Cache API.
import { vi } from 'vitest'

export class FakeWorker extends EventTarget {
  state: string
  postMessage = vi.fn()
  constructor(state = 'installed') {
    super()
    this.state = state
  }
  setState(state: string) {
    this.state = state
    this.dispatchEvent(new Event('statechange'))
  }
}

export class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null
  installing: FakeWorker | null = null
  active: FakeWorker | null = null
  update = vi.fn(async () => undefined)
  /** a new worker starts installing: fires updatefound */
  startInstalling(worker = new FakeWorker('installing')) {
    this.installing = worker
    this.dispatchEvent(new Event('updatefound'))
    return worker
  }
  /** the installing worker finished and waits */
  finishInstalling(worker: FakeWorker) {
    this.installing = null
    this.waiting = worker
    worker.setState('installed')
  }
}

export class FakeContainer extends EventTarget {
  controller: FakeWorker | null
  registration = new FakeRegistration()
  register = vi.fn(async (_url: string) => this.registration)
  constructor(controlled = true) {
    super()
    this.controller = controlled ? new FakeWorker('activated') : null
  }
  controllerChange() {
    this.dispatchEvent(new Event('controllerchange'))
  }
}

export function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
  document.dispatchEvent(new Event('visibilitychange'))
}

/** let pending promise callbacks run */
export const flush = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

// ---- the Cache API, in memory, keyed by URL
export class MemoryCache {
  entries = new Map<string, Response>()
  private key = (r: Request | string) => (typeof r === 'string' ? r : r.url)
  async put(r: Request | string, res: Response) { this.entries.set(this.key(r), res) }
  async match(r: Request | string) { return this.entries.get(this.key(r))?.clone() }
  async keys() { return [...this.entries.keys()].map((u) => new Request(u)) }
  async delete(r: Request | string) { return this.entries.delete(this.key(r)) }
}
export class MemoryCaches {
  stores = new Map<string, MemoryCache>()
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache())
    return this.stores.get(name)!
  }
  async keys() { return [...this.stores.keys()] }
  async delete(name: string) { return this.stores.delete(name) }
}

/** a Response whose `redirected` flag is set, as the browser does after following a 301 */
export function redirected(body: string, init: ResponseInit = {}): Response {
  const res = new Response(body, { status: 200, ...init })
  Object.defineProperty(res, 'redirected', { value: true })
  return res
}
