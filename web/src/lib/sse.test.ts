import { describe, expect, it, vi } from 'vitest'
import { connectEvents, type EventSourceLike } from './sse'

class FakeEventSource implements EventSourceLike {
  static last: FakeEventSource
  listeners = new Map<string, Set<(e: MessageEvent) => void>>()
  closed = false
  constructor(public url: string) {
    FakeEventSource.last = this
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
  }
  emit(type: string, data?: string) {
    for (const fn of this.listeners.get(type) ?? []) fn({ data } as MessageEvent)
  }
}

const connect = () => connectEvents({ eventSourceFactory: (url) => new FakeEventSource(url) })

describe('connectEvents', () => {
  it('connects to /api/events by default', () => {
    connect()
    expect(FakeEventSource.last.url).toBe('/api/events')
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

  it('stops delivering after unsubscribe', () => {
    const c = connect()
    const h = vi.fn()
    const off = c.subscribe('plan', h)
    off()
    FakeEventSource.last.emit('plan', '{}')
    expect(h).not.toHaveBeenCalled()
  })

  it('ignores unparsable data instead of throwing', () => {
    const c = connect()
    const h = vi.fn()
    c.subscribe('plan', h)
    expect(() => FakeEventSource.last.emit('plan', 'not json')).not.toThrow()
    expect(h).not.toHaveBeenCalled()
  })

  it('fires onReconnect only when the stream re-opens after an error', () => {
    const c = connect()
    const r = vi.fn()
    c.onReconnect(r)
    const es = FakeEventSource.last
    es.emit('open')
    expect(r).not.toHaveBeenCalled()
    es.emit('error')
    es.emit('open')
    expect(r).toHaveBeenCalledOnce()
  })

  it('close() closes the EventSource', () => {
    const c = connect()
    c.close()
    expect(FakeEventSource.last.closed).toBe(true)
  })
})
