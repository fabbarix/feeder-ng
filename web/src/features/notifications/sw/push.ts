// Push handling for the service worker. Plain functions over a minimal `self`
// type, so they are unit-tested without a worker. T13 owns the service worker
// and only has to call registerPushHandlers(self) from its entry.

export interface ParsedPush {
  type: string
  title: string
  body: string
  url: string
  tag: string
}

/** Parses the JSON the Feeder sends ({type,title,body,url,tag}). Missing or malformed data gives title "Feeder", the raw text as body, url "/" and tag "feeder". Not implemented yet. */
export function parsePushPayload(_text: string | null | undefined): ParsedPush {
  throw new Error('parsePushPayload: not implemented')
}

/** Only same-origin paths ("/plan") are followed; anything else (absolute URLs, "//host", "javascript:") becomes "/". Not implemented yet. */
export function safeTargetUrl(_url: string): string {
  throw new Error('safeTargetUrl: not implemented')
}

export interface ShownNotification {
  title: string
  options: { body: string; tag: string; data: { url: string }; requireInteraction?: boolean; renotify?: boolean }
}

/** The title and options to show. Timer finished stays on screen (requireInteraction) and renotifies. Not implemented yet. */
export function toShownNotification(_p: ParsedPush): ShownNotification {
  throw new Error('toShownNotification: not implemented')
}

export interface PushEventLike {
  data?: { text(): string } | null
  waitUntil(p: Promise<unknown>): void
}
export interface ClickEventLike {
  notification: { close(): void; data?: { url?: string } | null }
  waitUntil(p: Promise<unknown>): void
}
export interface WindowClientLike {
  focus(): Promise<unknown>
  navigate?(url: string): Promise<unknown>
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
 * listener (closes it, then focuses an open Feeder window and navigates it to the
 * target url, or opens a new window when none is open). Not implemented yet.
 */
export function registerPushHandlers(_scope: SwScope): void {
  throw new Error('registerPushHandlers: not implemented')
}
