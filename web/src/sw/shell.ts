// B9-21 (RES-01, RES-10): the service worker's behaviour with its environment injected (Cache API, fetch, clients), so it is
// unit-tested without registering a worker. sw.ts only wires these to the worker's events. STUBS: the developer implements them.
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
export async function precacheShell(_env: ShellEnv, _manifestUrls: readonly string[]): Promise<void> {
  throw new Error('not implemented: precacheShell')
}

/** Network first; the cached shell on a thrown fetch, on 502/503/504, and after NAVIGATION_TIMEOUT_MS without an answer. */
export async function answerNavigation(_env: ShellEnv, _request: Request, _timeoutMs?: number): Promise<Response> {
  throw new Error('not implemented: answerNavigation')
}

/** Activation: drops every cache but SHELL_CACHE, then the entries the manifest no longer lists, then claims the open pages. */
export async function activateWorker(_env: ShellEnv, _manifestUrls: readonly string[], _claim: () => Promise<void>): Promise<void> {
  throw new Error('not implemented: activateWorker')
}

/** Handles a message to the worker: `{type: 'SKIP_WAITING'}` calls skipWaiting; anything else is ignored. */
export function handleWorkerMessage(_data: unknown, _skipWaiting: () => Promise<void> | void): void {
  throw new Error('not implemented: handleWorkerMessage')
}
