import { describe, expect, it, vi } from 'vitest'
import {
  parsePushPayload,
  registerPushHandlers,
  safeTargetUrl,
  toShownNotification,
  type ClickEventLike,
  type PushEventLike,
  type SwScope,
  type WindowClientLike,
} from './push'

const payload = JSON.stringify({
  type: 'advanceStep',
  title: 'Advance Step',
  body: 'Marinate the chicken now for 19:30',
  url: '/',
  tag: 'advanceStep:2026-11-09:3:11@2026-11-09T14:30:00Z',
})

describe('parsePushPayload', () => {
  it('reads the fields the Feeder sends', () => {
    expect(parsePushPayload(payload)).toEqual({
      type: 'advanceStep',
      title: 'Advance Step',
      body: 'Marinate the chicken now for 19:30',
      url: '/',
      tag: 'advanceStep:2026-11-09:3:11@2026-11-09T14:30:00Z',
    })
  })

  it('falls back for empty, malformed or partial data', () => {
    expect(parsePushPayload(undefined)).toEqual({ type: '', title: 'Feeder', body: '', url: '/', tag: 'feeder' })
    expect(parsePushPayload('plain words')).toEqual({ type: '', title: 'Feeder', body: 'plain words', url: '/', tag: 'feeder' })
    expect(parsePushPayload('{"body":"Hi"}')).toMatchObject({ title: 'Feeder', body: 'Hi', url: '/' })
  })
})

describe('safeTargetUrl', () => {
  it.each([
    ['/plan', '/plan'],
    ['/', '/'],
    ['/cook/1?x=2', '/cook/1?x=2'],
    ['https://evil.example/x', '/'],
    ['//evil.example/x', '/'],
    ['javascript:alert(1)', '/'],
    ['', '/'],
  ])('%s -> %s', (input, want) => expect(safeTargetUrl(input)).toBe(want))
})

describe('toShownNotification', () => {
  it('shows title, body, tag and the target url', () => {
    const n = toShownNotification(parsePushPayload(payload))
    expect(n.title).toBe('Advance Step')
    expect(n.options).toMatchObject({ body: 'Marinate the chicken now for 19:30', data: { url: '/' } })
    expect(n.options.requireInteraction).toBeFalsy()
  })

  it('keeps Timer finished on screen and makes it ring again', () => {
    const n = toShownNotification(parsePushPayload('{"type":"timerFinished","title":"Timer finished","body":"Pasta","url":"/","tag":"t7"}'))
    expect(n.options.requireInteraction).toBe(true)
    expect(n.options.renotify).toBe(true)
  })
})

function fakeScope(clients: WindowClientLike[] = []) {
  const listeners: Record<string, (e: never) => void> = {}
  const showNotification = vi.fn(async () => {})
  const openWindow = vi.fn(async () => null)
  const scope: SwScope = {
    addEventListener: ((type: string, l: (e: never) => void) => {
      listeners[type] = l
    }) as SwScope['addEventListener'],
    registration: { showNotification },
    clients: { matchAll: vi.fn(async () => clients), openWindow },
  }
  return { scope, listeners, showNotification, openWindow }
}

describe('registerPushHandlers', () => {
  it('shows a notification for a push event, kept alive with waitUntil', async () => {
    const { scope, listeners, showNotification } = fakeScope()
    registerPushHandlers(scope)
    const waits: Promise<unknown>[] = []
    const event: PushEventLike = { data: { text: () => payload }, waitUntil: (p) => void waits.push(p) }
    listeners['push']!(event as never)
    await Promise.all(waits)
    expect(waits).toHaveLength(1)
    expect(showNotification).toHaveBeenCalledWith(
      'Advance Step',
      expect.objectContaining({ body: 'Marinate the chicken now for 19:30', data: { url: '/' } }),
    )
  })

  it('still shows something for a push with no data', async () => {
    const { scope, listeners, showNotification } = fakeScope()
    registerPushHandlers(scope)
    const waits: Promise<unknown>[] = []
    listeners['push']!({ data: null, waitUntil: (p: Promise<unknown>) => void waits.push(p) } as never)
    await Promise.all(waits)
    expect(showNotification).toHaveBeenCalledWith('Feeder', expect.anything())
  })

  it('focuses and navigates an open window on click, and closes the notification', async () => {
    const win: WindowClientLike = { focus: vi.fn(async () => {}), navigate: vi.fn(async () => {}) }
    const { scope, listeners, openWindow } = fakeScope([win])
    registerPushHandlers(scope)
    const close = vi.fn()
    const waits: Promise<unknown>[] = []
    const event: ClickEventLike = { notification: { close, data: { url: '/plan' } }, waitUntil: (p) => void waits.push(p) }
    listeners['notificationclick']!(event as never)
    await Promise.all(waits)
    expect(close).toHaveBeenCalled()
    expect(win.focus).toHaveBeenCalled()
    expect(win.navigate).toHaveBeenCalledWith('/plan')
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('opens a window when none is open', async () => {
    const { scope, listeners, openWindow } = fakeScope([])
    registerPushHandlers(scope)
    const waits: Promise<unknown>[] = []
    listeners['notificationclick']!({ notification: { close: () => {}, data: { url: '/' } }, waitUntil: (p: Promise<unknown>) => void waits.push(p) } as never)
    await Promise.all(waits)
    expect(openWindow).toHaveBeenCalledWith('/')
  })

  it('never opens an off-site url from a notification', async () => {
    const { scope, listeners, openWindow } = fakeScope([])
    registerPushHandlers(scope)
    const waits: Promise<unknown>[] = []
    listeners['notificationclick']!({ notification: { close: () => {}, data: { url: 'https://evil.example/' } }, waitUntil: (p: Promise<unknown>) => void waits.push(p) } as never)
    await Promise.all(waits)
    expect(openWindow).toHaveBeenCalledWith('/')
  })
})
