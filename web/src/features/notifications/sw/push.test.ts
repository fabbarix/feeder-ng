import { describe, expect, it, vi } from 'vitest'
import {
  parsePushPayload,
  registerPushHandlers,
  safeTargetUrl,
  toShownNotification,
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

/** B9-49 (TB-14): a window the worker can see: its url, focus() and postMessage(). The worker never calls navigate() (a full reload). */
function win(url: string): WindowClientLike & { focus: ReturnType<typeof vi.fn>; postMessage: ReturnType<typeof vi.fn> } {
  return { url: `https://feeder.example${url}`, focus: vi.fn(async () => {}), postMessage: vi.fn(), navigate: vi.fn(async () => {}) } as never
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

// B9-49 (TB-14): which window opens a notification's url (chapter "Which window opens it"):
//   1. a window already showing the target (path and query) is only focused;
//   2. otherwise a window that is NOT chromeless (not /cook, /board, /scan/receipt) is focused and sent postMessage({ type: 'navigate', url }),
//      which the app's useServiceWorkerNavigate turns into the router's navigate(url): no reload;
//   3. otherwise a new window is opened. A window in Cook Mode (or on the board, or a receipt screen) is never navigated away.
describe('which window opens a notification (TB-14)', () => {
  async function click(windows: WindowClientLike[], url: string) {
    const { scope, listeners, openWindow } = fakeScope(windows)
    registerPushHandlers(scope)
    const waits: Promise<unknown>[] = []
    const close = vi.fn()
    listeners['notificationclick']!({ notification: { close, data: { url } }, waitUntil: (p: Promise<unknown>) => void waits.push(p) } as never)
    await Promise.all(waits)
    return { openWindow, close }
  }

  it('a window already on the target is only focused: no message, no new window', async () => {
    const w = win('/plan?mark=2026-11-09:3')
    const { openWindow, close } = await click([w], '/plan?mark=2026-11-09:3')
    expect(close).toHaveBeenCalled()
    expect(w.focus).toHaveBeenCalled()
    expect(w.postMessage).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('a window on the same page but another query still gets the landing parameter (the Step to ring, the sheet to open)', async () => {
    const w = win('/')
    await click([w], '/?step=meal:2026-11-09/3/5:1')
    expect(w.focus).toHaveBeenCalled()
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'navigate', url: '/?step=meal:2026-11-09/3/5:1' })
  })

  it('a window on another page is focused and told to navigate; it is never reloaded (navigate() is not called)', async () => {
    const w = win('/pantry')
    const { openWindow } = await click([w], '/plan?mark=2026-11-09:3')
    expect(w.focus).toHaveBeenCalled()
    expect(w.postMessage).toHaveBeenCalledWith({ type: 'navigate', url: '/plan?mark=2026-11-09:3' })
    expect((w as unknown as { navigate: ReturnType<typeof vi.fn> }).navigate).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it.each(['/cook/meal/2026-11-09/3/5', '/cook/recipe/4', '/board', '/scan/receipt', '/scan/receipt/review'])('a window on %s is never navigated away: a new window opens instead', async (path) => {
    const w = win(path)
    const { openWindow } = await click([w], '/plan?mark=2026-11-09:3')
    expect(w.postMessage).not.toHaveBeenCalled()
    expect((w as unknown as { navigate: ReturnType<typeof vi.fn> }).navigate).not.toHaveBeenCalled()
    expect(openWindow).toHaveBeenCalledWith('/plan?mark=2026-11-09:3')
  })

  it('Timer finished on a phone in Cook Mode of that very Course just focuses it (the target is the window)', async () => {
    const w = win('/cook/meal/2026-11-09/3/5')
    const { openWindow } = await click([w], '/cook/meal/2026-11-09/3/5')
    expect(w.focus).toHaveBeenCalled()
    expect(w.postMessage).not.toHaveBeenCalled()
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('with several windows it picks the right one, not just the first: a chromeless first window is skipped', async () => {
    const cook = win('/cook/recipe/4')
    const plan = win('/plan')
    const { openWindow } = await click([cook, plan], '/pantry?status=useSoon&lot=9')
    expect(cook.focus).not.toHaveBeenCalled()
    expect(cook.postMessage).not.toHaveBeenCalled()
    expect(plan.focus).toHaveBeenCalled()
    expect(plan.postMessage).toHaveBeenCalledWith({ type: 'navigate', url: '/pantry?status=useSoon&lot=9' })
    expect(openWindow).not.toHaveBeenCalled()
  })

  it('an exact match anywhere wins over a window that would have to navigate', async () => {
    const other = win('/plan')
    const exact = win('/pantry?status=useSoon&lot=9')
    await click([other, exact], '/pantry?status=useSoon&lot=9')
    expect(exact.focus).toHaveBeenCalled()
    expect(other.postMessage).not.toHaveBeenCalled()
  })

  it('no window at all opens one; an off-origin url is replaced by "/" before any of this (safeTargetUrl)', async () => {
    const { openWindow } = await click([], 'https://evil.example/x')
    expect(openWindow).toHaveBeenCalledWith('/')
  })
})
