// Client for the server's single Server-Sent Events stream. Plain TypeScript.

export interface EventSourceLike {
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
  close(): void
}

export function connectEvents(opts: ConnectEventsOptions = {}): EventsConnection {
  const url = opts.url ?? '/api/events'
  const factory = opts.eventSourceFactory ?? ((u: string) => new EventSource(u) as unknown as EventSourceLike)
  const source = factory(url)

  let hadError = false
  const reconnectCallbacks = new Set<() => void>()
  source.addEventListener('error', () => {
    hadError = true
  })
  source.addEventListener('open', () => {
    if (!hadError) return
    hadError = false
    for (const cb of reconnectCallbacks) cb()
  })

  return {
    subscribe(topic, handler) {
      const listener = (e: MessageEvent) => {
        let data: unknown
        try {
          data = JSON.parse(String(e.data))
        } catch {
          return
        }
        handler(data)
      }
      source.addEventListener(topic, listener)
      return () => source.removeEventListener(topic, listener)
    },
    onReconnect(callback) {
      reconnectCallbacks.add(callback)
      return () => {
        reconnectCallbacks.delete(callback)
      }
    },
    close() {
      source.close()
    },
  }
}
