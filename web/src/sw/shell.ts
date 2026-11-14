// B9-21 (RES-01, RES-10): the service worker's behaviour with its environment injected (Cache API, fetch, clients), so it is
// unit-tested without registering a worker. sw.ts only wires these to the worker's events.
import { isUsableShell, NAVIGATION_TIMEOUT_MS, SHELL_CACHE, shellUrl, staleCacheUrls, uniquePrecacheUrls } from './cache'

export interface CacheLike {
  put(request: Request | string, response: Response): Promise<void>
  match(request: Request | string): Promise<Response | undefined>
  keys(): Promise<readonly Request[]>
  delete(request: Request | string): Promise<boolean>
}
export interface CacheStorageLike {
  open(name: string): Promise<CacheLike>
  keys(): Promise<string[]>
  delete(name: string): Promise<boolean>
}
export interface ShellEnv {
  caches: CacheStorageLike
  fetch: (request: Request | string) => Promise<Response>
  /** the registration scope, e.g. `https://feeder.test/` */
  scope: string
}

/** Fetches every manifest URL (index.html as the scope root) with cache: 'reload', stores each 200 (a redirected one rebuilt as a plain 200) in SHELL_CACHE; rejects when any is not ok. */
export async function precacheShell(env: ShellEnv, manifestUrls: readonly string[]): Promise<void> {
  const urls = uniquePrecacheUrls(manifestUrls, env.scope)
  // Fetch everything first, so a failed install leaves the cache as it was.
  const responses = await Promise.all(
    urls.map(async (url) => {
      const res = await env.fetch(new Request(url, { cache: 'reload' }))
      if (!res.ok) throw new Error(`precache: ${url} answered ${res.status}`)
      return [url, await plain(res)] as const
    }),
  )
  const cache = await env.caches.open(SHELL_CACHE)
  await Promise.all(responses.map(([url, res]) => cache.put(url, res)))
}

/** A redirected response rebuilt as a plain 200: a browser refuses a redirected response for a navigation. */
async function plain(res: Response): Promise<Response> {
  if (!res.redirected) return res
  return new Response(await res.arrayBuffer(), { status: 200, statusText: 'OK', headers: res.headers })
}

/** The gateway answered, but with no page: a proxy in front of a Feeder that is down. */
const GATEWAY_DOWN = new Set([502, 503, 504])

/** Network first; the cached shell on a thrown fetch, on 502/503/504, and after NAVIGATION_TIMEOUT_MS without an answer. */
export async function answerNavigation(env: ShellEnv, request: Request, timeoutMs = NAVIGATION_TIMEOUT_MS): Promise<Response> {
  const cachedShell = async (): Promise<Response | undefined> => {
    const cache = await env.caches.open(SHELL_CACHE)
    const shell = await cache.match(shellUrl(env.scope))
    return isUsableShell(shell) ? shell : undefined
  }
  const network = env.fetch(request).then(
    (res) => ({ res }),
    (error: unknown) => ({ error }),
  )
  let timer: ReturnType<typeof setTimeout> | undefined
  const timedOut = new Promise<'timeout'>((resolve) => {
    timer = setTimeout(() => resolve('timeout'), timeoutMs)
  })
  const first = await Promise.race([network, timedOut])
  clearTimeout(timer)
  if (first === 'timeout') {
    // lie-fi: the phone believes it is online. With no usable shell there is nothing better than waiting on.
    const shell = await cachedShell()
    if (shell) return shell
    return settle(await network, cachedShell)
  }
  return settle(first, cachedShell)
}

async function settle(outcome: { res: Response } | { error: unknown }, cachedShell: () => Promise<Response | undefined>): Promise<Response> {
  if ('res' in outcome && !GATEWAY_DOWN.has(outcome.res.status)) return outcome.res
  const shell = await cachedShell()
  if (shell) return shell
  return 'res' in outcome ? outcome.res : Response.error()
}

/** Activation: drops every cache but SHELL_CACHE, then the entries the manifest no longer lists, then claims the open pages. */
export async function activateWorker(env: ShellEnv, manifestUrls: readonly string[], claim: () => Promise<void>): Promise<void> {
  for (const key of await env.caches.keys()) {
    if (key !== SHELL_CACHE) await env.caches.delete(key)
  }
  const cache = await env.caches.open(SHELL_CACHE)
  const cached = (await cache.keys()).map((r) => r.url)
  const stale = staleCacheUrls(cached, manifestUrls, env.scope)
  await Promise.all(stale.map((url) => cache.delete(url)))
  await claim()
}

/** The message a page posts to let the waiting worker take over (RES-10). */
export const SKIP_WAITING = 'SKIP_WAITING'

/** Handles a message to the worker: `{type: 'SKIP_WAITING'}` calls skipWaiting; anything else is ignored. */
export function handleWorkerMessage(data: unknown, skipWaiting: () => Promise<void> | void): void {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return
  if ((data as { type?: unknown }).type !== SKIP_WAITING) return
  void skipWaiting()
}
