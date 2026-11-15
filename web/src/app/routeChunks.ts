// B9-59 (RES-04, route splitting): the code of a route, loaded on demand. Plain TypeScript, no React: app/lazyScreen.tsx
// renders a chunk, app/prefetch.ts warms one, and PageErrorBoundary's Try again calls retryFailedChunks().
//
// A chunk is loaded once and kept. Two kinds of load differ only in what a failure leaves behind:
// - a load for a page on screen ('render') keeps the failure, so the page shows its error state once instead of asking
//   again on every render; Try again (retryFailedChunks) clears it and the next render imports again;
// - a prefetch ('prefetch') forgets its failure at once: nobody is looking, and the visit itself tries again.

export type ChunkStatus = 'idle' | 'loading' | 'loaded' | 'failed'
export type LoadOrigin = 'render' | 'prefetch'

export interface RouteChunk<T> {
  readonly status: ChunkStatus
  /** The loaded value, or undefined while it is not loaded. */
  peek(): T | undefined
  /** The one promise of the current attempt: a new attempt starts only from idle (never loaded, or retried). */
  load(origin?: LoadOrigin): Promise<T>
  /** A failed chunk goes back to idle, so the next load imports again. Returns true when it was failed. */
  retry(): boolean
}

/** Told about every failed load of a page on screen (not about prefetches): app/staleChunk.ts decides what it means. */
export type ChunkFailureListener = (error: unknown) => void

const registry = new Set<RouteChunk<unknown>>()
const failureListeners = new Set<ChunkFailureListener>()

export function onChunkFailure(listener: ChunkFailureListener): () => void {
  failureListeners.add(listener)
  return () => {
    failureListeners.delete(listener)
  }
}

/** A promise React's `use` reads without suspending once settled (React reads `status` and `value` on a thenable). */
type Tracked<T> = Promise<T> & { status?: 'pending' | 'fulfilled' | 'rejected'; value?: T; reason?: unknown }

export function routeChunk<T>(importer: () => Promise<T>): RouteChunk<T> {
  let status: ChunkStatus = 'idle'
  let value: T | undefined
  let current: Tracked<T> | null = null

  const chunk: RouteChunk<T> = {
    get status() {
      return status
    },
    peek: () => value,
    load(origin: LoadOrigin = 'render') {
      if (current && status !== 'idle') return current
      status = 'loading'
      let attempt: Tracked<T>
      try {
        attempt = Promise.resolve(importer()) as Tracked<T>
      } catch (error) {
        attempt = Promise.reject(error) as Tracked<T>
      }
      attempt.status = 'pending'
      current = attempt
      attempt.then(
        (loaded) => {
          attempt.status = 'fulfilled'
          attempt.value = loaded
          if (current !== attempt) return
          value = loaded
          status = 'loaded'
        },
        (error: unknown) => {
          attempt.status = 'rejected'
          attempt.reason = error
          if (current !== attempt) return
          if (origin === 'prefetch') {
            status = 'idle'
            current = null
            return
          }
          status = 'failed'
          for (const listener of [...failureListeners]) listener(error)
        },
      )
      return attempt
    },
    retry() {
      if (status !== 'failed') return false
      status = 'idle'
      current = null
      return true
    },
  }
  registry.add(chunk as RouteChunk<unknown>)
  return chunk
}

/** Try again: every failed chunk goes back to idle. Returns how many were failed. */
export function retryFailedChunks(): number {
  let count = 0
  for (const chunk of registry) if (chunk.retry()) count++
  return count
}

/** True while some route's code failed to load and has not been retried. */
export function hasFailedChunk(): boolean {
  for (const chunk of registry) if (chunk.status === 'failed') return true
  return false
}
