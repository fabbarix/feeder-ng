// Push handling for the service worker. Plain functions over a minimal `self`
// type, so they are unit-tested without a worker. T13 owns the service worker
// and only has to call registerPushHandlers(self) from its entry.
import { isChromeless } from '../../../app/chromeless'

export interface ParsedPush {
  type: string
  title: string
  body: string
  url: string
  tag: string
}

const FALLBACK_TITLE = 'Feeder'

/** Parses the JSON the Feeder sends ({type,title,body,url,tag}). Missing or malformed data gives title "Feeder", the raw text as body, url "/" and tag "feeder". */
export function parsePushPayload(text: string | null | undefined): ParsedPush {
  const fallback: ParsedPush = { type: '', title: FALLBACK_TITLE, body: text ?? '', url: '/', tag: 'feeder' }
  if (!text) return fallback
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    return fallback
  }
  if (typeof data !== 'object' || data === null) return fallback
  const o = data as Record<string, unknown>
  const str = (v: unknown, dflt: string) => (typeof v === 'string' && v !== '' ? v : dflt)
  return {
    type: str(o.type, ''),
    title: str(o.title, FALLBACK_TITLE),
    body: str(o.body, ''),
    url: safeTargetUrl(str(o.url, '/')),
    tag: str(o.tag, 'feeder'),
  }
}

/** Only same-origin paths ("/plan") are followed; anything else (absolute URLs, "//host", "javascript:") becomes "/". */
export function safeTargetUrl(url: string): string {
  if (!url.startsWith('/') || url.startsWith('//') || url.startsWith('/\\')) return '/'
  return url
}

export interface ShownNotification {
  title: string
  options: { body: string; tag: string; data: { url: string }; requireInteraction?: boolean; renotify?: boolean }
}

/** The title and options to show. Timer finished stays on screen (requireInteraction) and renotifies. */
export function toShownNotification(p: ParsedPush): ShownNotification {
  const options: ShownNotification['options'] = { body: p.body, tag: p.tag, data: { url: p.url } }
  if (p.type === 'timerFinished') {
    options.requireInteraction = true
    options.renotify = true
  }
  return { title: p.title, options }
}

export interface PushEventLike {
  data?: { text(): Promise<string> | string } | null
  waitUntil(p: Promise<unknown>): void
}
export interface ClickEventLike {
  notification: { close(): void; data?: { url?: string } | null }
  waitUntil(p: Promise<unknown>): void
}
export interface WindowClientLike {
  /** The window's absolute URL. */
  url?: string
  focus(): Promise<unknown>
  /** B9-49 (TB-14): the app's useServiceWorkerNavigate listens for { type: 'navigate', url }. */
  postMessage?(message: unknown): void
  /** Never called (a full reload would lose what the window shows); kept in the type because real clients have it. */
  navigate?(url: string): Promise<unknown>
}

/** B9-49 (TB-14): the path and query a window shows ("/plan?x"), or null when it cannot be read. */
function shownPath(win: WindowClientLike): string | null {
  if (!win.url) return null
  try {
    const u = new URL(win.url)
    return u.pathname + u.search
  } catch {
    return null
  }
}

/**
 * B9-49 (TB-14): which window opens a notification's target, and how. A window already showing the target (path and query) is only
 * focused. Otherwise a window that is not chromeless (Cook Mode, the board, a receipt screen are never navigated away) is focused and
 * told to navigate (no reload). Otherwise a new window opens.
 */
export function chooseWindow(windows: readonly WindowClientLike[], target: string): { win: WindowClientLike; message: boolean } | null {
  const exact = windows.find((w) => shownPath(w) === target)
  if (exact) return { win: exact, message: false }
  const free = windows.find((w) => {
    const path = shownPath(w)
    return path !== null && !isChromeless(path) && typeof w.postMessage === 'function'
  })
  return free ? { win: free, message: true } : null
}
export interface SwScope {
  addEventListener(type: 'push', listener: (e: PushEventLike) => void): void
  addEventListener(type: 'notificationclick', listener: (e: ClickEventLike) => void): void
  registration: { showNotification(title: string, options: ShownNotification['options']): Promise<void> }
  clients: {
    matchAll(opts: { type: 'window'; includeUncontrolled: boolean }): Promise<WindowClientLike[]>
    openWindow(url: string): Promise<unknown>
  }
}

/**
 * Adds the 'push' listener (shows the notification) and the 'notificationclick'
 * listener (closes it, then opens the target in the window `chooseWindow` picks, or
 * in a new window when none fits).
 */
export function registerPushHandlers(scope: SwScope): void {
  scope.addEventListener('push', (e) => {
    e.waitUntil(
      (async () => {
        const text = e.data ? await e.data.text() : null
        const shown = toShownNotification(parsePushPayload(text))
        await scope.registration.showNotification(shown.title, shown.options)
      })(),
    )
  })
  scope.addEventListener('notificationclick', (e) => {
    e.notification.close()
    const target = safeTargetUrl(e.notification.data?.url ?? '/')
    e.waitUntil(
      (async () => {
        const windows = await scope.clients.matchAll({ type: 'window', includeUncontrolled: true })
        const chosen = chooseWindow(windows, target)
        if (chosen) {
          await chosen.win.focus()
          if (chosen.message) chosen.win.postMessage?.({ type: 'navigate', url: target })
          return
        }
        await scope.clients.openWindow(target)
      })(),
    )
  })
}
