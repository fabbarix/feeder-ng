// "Scan session active": true while the Scan screen is open in Shop mode, so Home can switch to the list later.
// A module-level store read with useSyncExternalStore.
import { useEffect, useSyncExternalStore } from 'react'

export interface ScanSessionStore {
  /** a session started; returns the function that ends it. Overlapping sessions are counted. */
  start(): () => void
  isActive(): boolean
  subscribe(listener: () => void): () => void
}

export function createScanSessionStore(): ScanSessionStore {
  let count = 0
  const listeners = new Set<() => void>()
  const notify = () => {
    for (const l of listeners) l()
  }
  return {
    start() {
      count += 1
      notify()
      let ended = false
      return () => {
        if (ended) return
        ended = true
        count -= 1
        notify()
      }
    },
    isActive: () => count > 0,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/** The app-wide store. */
export const scanSession: ScanSessionStore = createScanSessionStore()

/** Reactive read of scanSession.isActive(). */
export function useScanSessionActive(): boolean {
  return useSyncExternalStore(scanSession.subscribe, scanSession.isActive, () => false)
}

/** Marks a session active while `active` is true and the component is mounted (the Scan screen calls it with mode === 'shop'). */
export function useScanSession(active: boolean): void {
  useEffect(() => {
    if (!active) return
    return scanSession.start()
  }, [active])
}
