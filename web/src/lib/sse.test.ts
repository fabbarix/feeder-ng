import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { connectEvents, resetSharedEvents, type EventSourceLike } from './sse'

class FakeEventSource implements EventSourceLike {
  static all: FakeEventSource[] = []
  static get last() {
    return FakeEventSource.all[FakeEventSource.all.length - 1]!
  }
  listeners = new Map<string, Set<(e: MessageEvent) => void>>()
  closed = false
  readyState = 1 // OPEN
  constructor(public url: string) {
    FakeEventSource.all.push(this)
  }
  addEventListener(type: string, fn: (e: MessageEvent) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(fn)
  }
  removeEventListener(type: string, fn: (e: MessageEvent) => void) {
    this.listeners.get(type)?.delete(fn)
  }
  close() {
    this.closed = true
    this.readyState = 2
  }
  emit(type: string, data?: string) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data } as MessageEvent)
  }
}

const connect = () => connectEvents({ eventSourceFactory: (url) => new FakeEventSource(url) })

beforeEach(() => {
  resetSharedEvents()
  FakeEventSource.all = []
})
afterEach(() => {
  resetSharedEvents()
  vi.useRealTimers()
})

describe('connectEvents (one shared, reference-counted connection)', () => {
  it('connects to /api/events by default', () => {
    connect()
    expect(FakeEventSource.last.url).toBe('/api/events')
  })

  it('opens exactly ONE EventSource for any number of subscribers', () => {
    const handles = Array.from({ length: 18 }, () => connect())
    handles.forEach((h, i) => h.subscribe(`topic${i}`, () => {}))
    expect(FakeEventSource.all).toHaveLength(1)
  })

  it('keeps the connection open until the last holder closes', () => {
    const a = connect()
    const b = connect()
    a.close()
    expect(FakeEventSource.last.closed).toBe(false)
    b.close()
    expect(FakeEventSource.last.closed).toBe(true)
  })

  it('opens a fresh connection when a subscriber arrives after the last one closed', () => {
    connect().close()
    connect()
    expect(FakeEventSource.all).toHaveLength(2)
    expect(FakeEventSource.last.closed).toBe(false)
  })

  it('close() is idempotent per handle and does not release another holder', () => {
    const a = connect()
    const b = connect()
    a.close()
    a.close()
    expect(FakeEventSource.last.closed).toBe(false)
    b.close()
    expect(FakeEventSource.last.closed).toBe(true)
  })

  it('delivers parsed JSON to topic subscribers only', () => {
    const c = connect()
    const plan = vi.fn()
    const shopping = vi.fn()
    c.subscribe('plan', plan)
    c.subscribe('shopping', shopping)
    FakeEventSource.last.emit('plan', '{"week":46}')
    expect(plan).toHaveBeenCalledWith({ week: 46 })
    expect(shopping).not.toHaveBeenCalled()
  })

  it('delivers one event to subscribers of the same topic on different handles', () => {
    const h1 = vi.fn()
    const h2 = vi.fn()
    connect().subscribe('plan', h1)
    connect().subscribe('plan', h2)
    FakeEventSource.last.emit('plan', '{"n":1}')
    expect(h1).toHaveBeenCalledTimes(1)
    expect(h2).toHaveBeenCalledTimes(1)
  })

  it('stops delivering after unsubscribe, without affecting other subscribers of the topic', () => {
    const a = connect()
    const b = connect()
    const ha = vi.fn()
    const hb = vi.fn()
    const off = a.subscribe('plan', ha)
    b.subscribe('plan', hb)
    off()
    FakeEventSource.last.emit('plan', '{}')
    expect(ha).not.toHaveBeenCalled()
    expect(hb).toHaveBeenCalledTimes(1)
  })

  it('closing a handle drops its subscriptions and reconnect callbacks, not the others', () => {
    const a = connect()
    const b = connect()
    const ha = vi.fn()
    const hb = vi.fn()
    const ra = vi.fn()
    a.subscribe('plan', ha)
    a.onReconnect(ra)
    b.subscribe('plan', hb)
    a.close()
    const es = FakeEventSource.last
    es.emit('plan', '{}')
    es.emit('error')
    es.emit('open')
    expect(ha).not.toHaveBeenCalled()
    expect(ra).not.toHaveBeenCalled()
    expect(hb).toHaveBeenCalledTimes(1)
  })

  it('ignores unparsable data instead of throwing', () => {
    const c = connect()
    const h = vi.fn()
    c.subscribe('plan', h)
    expect(() => FakeEventSource.last.emit('plan', 'not json')).not.toThrow()
    expect(h).not.toHaveBeenCalled()
  })

  it('a throwing handler does not stop the other subscribers', () => {
    const c = connect()
    const ok = vi.fn()
    c.subscribe('plan', () => {
      throw new Error('boom')
    })
    c.subscribe('plan', ok)
    FakeEventSource.last.emit('plan', '{}')
    expect(ok).toHaveBeenCalledTimes(1)
  })

  it('fires every holder\'s onReconnect when the stream re-opens after an error', () => {
    const r1 = vi.fn()
    const r2 = vi.fn()
    connect().onReconnect(r1)
    connect().onReconnect(r2)
    const es = FakeEventSource.last
    es.emit('open')
    expect(r1).not.toHaveBeenCalled()
    es.emit('error')
    es.emit('open')
    expect(r1).toHaveBeenCalledOnce()
    expect(r2).toHaveBeenCalledOnce()
  })

  it('a holder that joins after the first open is told about later reconnects', () => {
    const first = connect()
    FakeEventSource.last.emit('open')
    const late = vi.fn()
    connect().onReconnect(late)
    first.close()
    FakeEventSource.last.emit('error')
    FakeEventSource.last.emit('open')
    expect(late).toHaveBeenCalledOnce()
  })
})

describe('auth failure (the browser gives up: readyState CLOSED after an error)', () => {
  it('re-opens a new EventSource after a back-off and then fires onReconnect', () => {
    vi.useFakeTimers()
    const r = vi.fn()
    connect().onReconnect(r)
    const first = FakeEventSource.last
    first.emit('open')
    first.readyState = 2
    first.emit('error')
    expect(FakeEventSource.all).toHaveLength(1)
    vi.advanceTimersByTime(30_000)
    expect(first.closed).toBe(true)
    expect(FakeEventSource.all).toHaveLength(2)
    FakeEventSource.last.emit('open')
    expect(r).toHaveBeenCalledOnce()
  })

  it('moves subscribers to the new EventSource', () => {
    vi.useFakeTimers()
    const h = vi.fn()
    connect().subscribe('plan', h)
    const first = FakeEventSource.last
    first.readyState = 2
    first.emit('error')
    vi.advanceTimersByTime(30_000)
    FakeEventSource.last.emit('plan', '{"n":2}')
    expect(h).toHaveBeenCalledWith({ n: 2 })
  })

  it('backs off: retries are spaced further apart while the failure persists, never a tight loop', () => {
    vi.useFakeTimers()
    connect()
    const fail = () => {
      FakeEventSource.last.readyState = 2
      FakeEventSource.last.emit('error')
    }
    fail()
    vi.advanceTimersByTime(60_000)
    fail()
    vi.advanceTimersByTime(1_000)
    expect(FakeEventSource.all.length).toBeLessThanOrEqual(3)
  })

  it('does not retry once the last holder closed', () => {
    vi.useFakeTimers()
    const c = connect()
    FakeEventSource.last.readyState = 2
    FakeEventSource.last.emit('error')
    c.close()
    vi.advanceTimersByTime(120_000)
    expect(FakeEventSource.all).toHaveLength(1)
  })
})
