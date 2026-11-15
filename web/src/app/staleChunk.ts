// B9-59 (RES-04): what a route chunk that failed to load means. Plain TypeScript, no React.
// - Offline, the server down, a passing fault: the page's error state, and Try again imports again.
// - A new version was deployed and the old file is gone (a 404 for the old hashed name): the server's index.html now names
//   another entry script. Importing again cannot work, so the "new version, Reload" toast is announced (app/useAppUpdate)
//   and the page's Try again reloads Feeder.
import { onChunkFailure } from './routeChunks'

export interface StaleCheckEnv {
  online: () => boolean
  /** The entry script this page runs (index.html's module script), or null. */
  currentEntry: () => string | null
  /** The server's index.html now, past every cache. */
  fetchIndex: () => Promise<string>
  /** Shows the "A new version of Feeder is ready" toast with Reload. */
  announce: () => void
}

export type StaleCheck = 'offline' | 'same' | 'stale' | 'unknown'

/** The src of the first `<script type="module" src>` in an index.html, as written. */
export function entryScriptOf(html: string): string | null {
  for (const tag of html.match(/<script\b[^>]*>/gi) ?? []) {
    if (!/\btype=["']?module["']?/i.test(tag)) continue
    const src = tag.match(/\bsrc=["']([^"']+)["']/i)?.[1]
    if (src) return src
  }
  return null
}

const pathOf = (url: string): string => {
  try {
    return new URL(url, 'http://feeder.invalid').pathname
  } catch {
    return url
  }
}

export async function checkStaleBuild(env: StaleCheckEnv): Promise<StaleCheck> {
  if (!env.online()) return 'offline'
  const current = env.currentEntry()
  if (!current) return 'unknown'
  let served: string | null
  try {
    served = entryScriptOf(await env.fetchIndex())
  } catch {
    return 'unknown'
  }
  if (!served) return 'unknown'
  return pathOf(served) === pathOf(current) ? 'same' : 'stale'
}

let stale = false

/** True once a failed chunk was found to belong to an older build than the server's. */
export function staleBuildKnown(): boolean {
  return stale
}

/** For tests. */
export function resetStaleBuild(): void {
  stale = false
}

/** What the error state's Try again does after a chunk failed: reload into the new version, or import again. */
export function tryAgainMove(): 'reload' | 'retry' {
  return stale ? 'reload' : 'retry'
}

/** Checks each failed load of a page on screen; the first one found stale announces the new version. */
export function watchChunkFailures(env: StaleCheckEnv): () => void {
  let checking = false
  return onChunkFailure(() => {
    if (stale || checking) return
    checking = true
    void checkStaleBuild(env)
      .then((result) => {
        if (result !== 'stale' || stale) return
        stale = true
        env.announce()
      })
      .finally(() => {
        checking = false
      })
  })
}

/** The browser's side of StaleCheckEnv. The query string keeps the service worker's cache and the HTTP cache out of it. */
export function browserStaleCheckEnv(announce: () => void): StaleCheckEnv {
  return {
    online: () => globalThis.navigator?.onLine !== false,
    currentEntry: () => globalThis.document?.querySelector<HTMLScriptElement>('script[type="module"][src]')?.getAttribute('src') ?? null,
    fetchIndex: async () => {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      try {
        const response = await fetch(`/?fresh=${Date.now()}`, { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
        if (!response.ok) throw new Error(`index.html ${response.status}`)
        return await response.text()
      } finally {
        clearTimeout(timer)
      }
    },
    announce,
  }
}
