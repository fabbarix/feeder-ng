// "Scan session active": true while the Scan screen is open in Shop mode, so Home can switch to the list later.
// A module-level store read with useSyncExternalStore. Stubs until implemented.

export interface ScanSessionStore {
  /** a session started; returns the function that ends it. Overlapping sessions are counted. */
  start(): () => void
  isActive(): boolean
  subscribe(listener: () => void): () => void
}

export function createScanSessionStore(): ScanSessionStore {
  throw new Error('not implemented')
}

/** The app-wide store. */
export const scanSession: ScanSessionStore = {
  start: () => {
    throw new Error('not implemented')
  },
  isActive: () => false,
  subscribe: () => () => {},
}

/** Reactive read of scanSession.isActive(). */
export function useScanSessionActive(): boolean {
  throw new Error('not implemented')
}

/** Marks a session active while `active` is true and the component is mounted (the Scan screen calls it with mode === 'shop'). */
export function useScanSession(active: boolean): void {
  void active
  throw new Error('not implemented')
}
