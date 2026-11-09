// How other features add behaviour to the service worker without editing sw.ts: every module in
// src/sw/extensions/*.ts may export `register(sw)`; sw.ts loads them all with import.meta.glob and calls
// registerExtensions. The notifications team adds src/sw/extensions/push.ts (push, notificationclick) and nothing else.
// Plain TypeScript. Stubs until implemented.

export interface WorkerScope {
  addEventListener(type: string, listener: (event: never) => void): void
}

export interface SwExtension {
  register?: (sw: WorkerScope) => void
}

/**
 * Calls `register(sw)` of each module in the order of its key (path), skipping modules that export none. An
 * extension that throws is reported with console.error and does not stop the others or the worker.
 * Returns the keys that registered.
 */
export function registerExtensions(modules: Record<string, SwExtension>, sw: WorkerScope): string[] {
  void modules
  void sw
  throw new Error('not implemented')
}
