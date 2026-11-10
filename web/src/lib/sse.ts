// Client for the server's single Server-Sent Events stream. Plain TypeScript.
//
// There is ONE EventSource per page. Every connectEvents() call returns a handle on that shared connection: the first
// handle opens it, and the last handle to close() releases it. Hooks therefore never open their own streams.

export interface EventSourceLike {
  readonly readyState?: number
  addEventListener(type: string, listener: (e: MessageEvent) => void): void
  removeEventListener(type: string, listener: (e: MessageEvent) => void): void
  close(): void
}

export interface ConnectEventsOptions {
  url?: string
  eventSourceFactory?: (url: string) => EventSourceLike
}

export interface EventsConnection {
  /** Calls handler with the parsed JSON of each event on topic. Returns an unsubscribe func. */
  subscribe(topic: string, handler: (data: unknown) => void): () => void
  /** Fires when the stream re-opens after an error, so consumers can refetch. */
  onReconnect(callback: () => void): () => void
  /** Releases this handle. Idempotent. The stream closes when the last handle is released. */
  close(): void
}

const DEFAULT_URL = '/api/events'
const CLOSED = 2 // EventSource.CLOSED
const RECONNECT_MIN_MS = 1_000
const RECONNECT_MAX_MS = 30_000

type Handler = (data: unknown) => void

/** One subscription on a topic, owned by the handle that made it. */
interface Entry {
  topic: string
  handler: Handler
}

/** What one connectEvents() call holds. */
interface Holder {
  entries: Set<Entry>
  reconnect: Set<() => void>
  released: boolean
}

/** The single shared connection. */
interface Shared {
  url: string
  factory: (url: string) => EventSourceLike
  source: EventSourceLike
  holders: Set<Holder>
  subs: Map<string, Set<Entry>>
  topicListeners: Map<string, (e: MessageEvent) => void>
  hadError: boolean
  backoff: number
  retry?: ReturnType<typeof setTimeout>
  closed: boolean
}

let shared: Shared | null = null

function defaultFactory(url: string): EventSourceLike {
  return new EventSource(url) as unknown as EventSourceLike
}

/** Opens a source for sh, attaches its lifecycle and topic listeners, and returns it. */
function openSource(sh: Shared): EventSourceLike {
  const source = sh.factory(sh.url)
  source.addEventListener('error', () => onError(sh, source))
  source.addEventListener('open', () => onOpen(sh, source))
  for (const [topic, listener] of sh.topicListeners) source.addEventListener(topic, listener)
  return source
}

function onError(sh: Shared, source: EventSourceLike): void {
  if (sh.closed || sh.source !== source) return
  if (source.readyState === CLOSED) {
    // The browser gave up (a 401 does this). Drop the dead source and retry with back-off.
    source.close()
    scheduleRetry(sh)
  } else {
    sh.hadError = true // the browser is retrying by itself
  }
}

function onOpen(sh: Shared, source: EventSourceLike): void {
  if (sh.closed || sh.source !== source) return
  sh.backoff = RECONNECT_MIN_MS
  if (!sh.hadError) return
  sh.hadError = false
  for (const holder of Array.from(sh.holders)) {
    for (const cb of Array.from(holder.reconnect)) {
      try {
        cb()
      } catch (err) {
        console.error('events: onReconnect callback failed', err)
      }
    }
  }
}

function scheduleRetry(sh: Shared): void {
  sh.hadError = true
  if (sh.retry !== undefined) return
  const delay = sh.backoff
  sh.backoff = Math.min(delay * 2, RECONNECT_MAX_MS)
  sh.retry = setTimeout(() => {
    sh.retry = undefined
    if (!sh.closed) sh.source = openSource(sh)
  }, delay)
}

function dispatch(sh: Shared, topic: string, e: MessageEvent): void {
  const set = sh.subs.get(topic)
  if (!set || set.size === 0) return
  let data: unknown
  try {
    data = JSON.parse(String(e.data))
  } catch {
    return
  }
  for (const entry of Array.from(set)) {
    if (!set.has(entry)) continue // unsubscribed by an earlier handler
    try {
      entry.handler(data)
    } catch (err) {
      console.error(`events: handler for ${topic} failed`, err)
    }
  }
}

function addEntry(sh: Shared, entry: Entry): void {
  let set = sh.subs.get(entry.topic)
  if (!set) {
    set = new Set()
    sh.subs.set(entry.topic, set)
    const listener = (e: MessageEvent) => dispatch(sh, entry.topic, e)
    sh.topicListeners.set(entry.topic, listener)
    sh.source.addEventListener(entry.topic, listener)
  }
  set.add(entry)
}

function removeEntry(sh: Shared, entry: Entry): void {
  const set = sh.subs.get(entry.topic)
  if (!set || !set.delete(entry) || set.size > 0) return
  sh.subs.delete(entry.topic)
  const listener = sh.topicListeners.get(entry.topic)
  if (listener) {
    sh.source.removeEventListener(entry.topic, listener)
    sh.topicListeners.delete(entry.topic)
  }
}

function releaseHolder(sh: Shared, holder: Holder): void {
  if (holder.released) return
  holder.released = true
  for (const entry of holder.entries) removeEntry(sh, entry)
  holder.entries.clear()
  holder.reconnect.clear()
  sh.holders.delete(holder)
  if (sh.holders.size === 0) {
    sh.closed = true
    if (sh.retry !== undefined) clearTimeout(sh.retry)
    sh.retry = undefined
    sh.source.close()
    if (shared === sh) shared = null
  }
}

function acquire(opts: ConnectEventsOptions): Shared {
  if (shared) return shared
  const sh: Shared = {
    url: opts.url ?? DEFAULT_URL,
    factory: opts.eventSourceFactory ?? defaultFactory,
    source: undefined as unknown as EventSourceLike,
    holders: new Set(),
    subs: new Map(),
    topicListeners: new Map(),
    hadError: false,
    backoff: RECONNECT_MIN_MS,
    closed: false,
  }
  sh.source = openSource(sh)
  shared = sh
  return sh
}

/** Returns a handle on the one shared connection, opening it if it is not open yet. */
export function connectEvents(opts: ConnectEventsOptions = {}): EventsConnection {
  const sh = acquire(opts)
  const holder: Holder = { entries: new Set(), reconnect: new Set(), released: false }
  sh.holders.add(holder)

  return {
    subscribe(topic, handler) {
      if (holder.released) return () => {}
      const entry: Entry = { topic, handler }
      holder.entries.add(entry)
      addEntry(sh, entry)
      return () => {
        if (holder.entries.delete(entry)) removeEntry(sh, entry)
      }
    },
    onReconnect(callback) {
      if (holder.released) return () => {}
      holder.reconnect.add(callback)
      return () => {
        holder.reconnect.delete(callback)
      }
    },
    close() {
      releaseHolder(sh, holder)
    },
  }
}

/** Test hook: drops the shared connection (and every handle on it) so each test starts clean. */
export function resetSharedEvents(): void {
  const sh = shared
  shared = null
  if (!sh) return
  for (const holder of sh.holders) {
    holder.released = true
    holder.entries.clear()
    holder.reconnect.clear()
  }
  sh.holders.clear()
  sh.closed = true
  if (sh.retry !== undefined) clearTimeout(sh.retry)
  sh.retry = undefined
  sh.source.close()
}
