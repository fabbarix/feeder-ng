// B9-59 (RES-04): warming route chunks before they are needed. Plain TypeScript, no React. main.tsx asks for the
// bottom-bar destinations once Today has painted and the browser is idle; the shell's nav links ask for their own route on
// pointerdown and focus. Nothing is prefetched on a data-saver connection (`navigator.connection.saveData`).
import type { RouteChunk } from './routeChunks'

export interface ConnectionLike {
  saveData?: boolean
}

export interface PrefetchEnv {
  /** Read at each call: the User may turn data saver on at any time. Default: navigator.connection. */
  connection?: () => ConnectionLike | null | undefined
  /** Runs `run` when the browser is idle. Default: requestIdleCallback (5 s timeout), else a 2 s timer. */
  onIdle?: (run: () => void) => void
}

export interface Prefetcher {
  /** Loads the chunk of the route at `path` (a nav link's pointerdown or focus). */
  prefetch(path: string): void
  /** Once idle, loads the chunks of `paths` one after another. */
  prefetchOnIdle(paths: readonly string[]): void
}

export function saveDataOn(connection: ConnectionLike | null | undefined): boolean {
  return connection?.saveData === true
}

function browserConnection(): ConnectionLike | undefined {
  return (globalThis.navigator as (Navigator & { connection?: ConnectionLike }) | undefined)?.connection
}

function browserIdle(run: () => void): void {
  const w = globalThis as typeof globalThis & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number }
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(run, { timeout: 5000 })
  else setTimeout(run, 2000)
}

export function createPrefetcher(resolve: (path: string) => RouteChunk<unknown> | undefined, env: PrefetchEnv = {}): Prefetcher {
  const connection = env.connection ?? browserConnection
  const onIdle = env.onIdle ?? browserIdle
  const wanted = (path: string): RouteChunk<unknown> | undefined => {
    if (saveDataOn(connection())) return undefined
    const chunk = resolve(path)
    return chunk && chunk.status === 'idle' ? chunk : undefined
  }
  return {
    prefetch(path) {
      wanted(path)?.load('prefetch').catch(() => {})
    },
    prefetchOnIdle(paths) {
      onIdle(() => {
        void (async () => {
          for (const path of paths) {
            const chunk = wanted(path)
            if (!chunk) continue
            try {
              await chunk.load('prefetch')
            } catch {
              // offline or a passing fault: the visit itself loads it
            }
          }
        })()
      })
    },
  }
}
