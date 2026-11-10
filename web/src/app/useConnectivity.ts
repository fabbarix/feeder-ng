// Online/offline state for the shell's OfflineBanner slot. React hook; no domain logic.

export interface Connectivity {
  offline: boolean
  /** When the data on screen was last known fresh: the moment the connection dropped; null while online. */
  savedAt: Date | null
}

/** STUB (WP5 designer). Follows `navigator.onLine` and the window `online` / `offline` events. */
export function useConnectivity(): Connectivity {
  throw new Error('not implemented')
}
