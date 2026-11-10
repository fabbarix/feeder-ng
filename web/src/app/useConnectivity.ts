// Online/offline state for the shell's OfflineBanner slot. React hook; no domain logic.
import { useEffect, useState } from 'react'

export interface Connectivity {
  offline: boolean
  /** When the data on screen was last known fresh: the moment the connection dropped; null while online. */
  savedAt: Date | null
}

/** Follows `navigator.onLine` and the window `online` / `offline` events. */
export function useConnectivity(): Connectivity {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [savedAt, setSavedAt] = useState<Date | null>(() => (navigator.onLine ? null : new Date()))

  useEffect(() => {
    const goOffline = () => {
      setOffline(true)
      setSavedAt((previous) => previous ?? new Date())
    }
    const goOnline = () => {
      setOffline(false)
      setSavedAt(null)
    }
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
    }
  }, [])

  return { offline, savedAt }
}
