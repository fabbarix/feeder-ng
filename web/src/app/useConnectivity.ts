// Online/offline state for the shell's OfflineBanner slot. React hook; no domain logic.
import { useEffect, useState } from 'react'
import { lastServerContact, subscribeServerContact } from '../lib/serverContact'

export interface Connectivity {
  offline: boolean
  /** B9-49 (RES-07): the newest successful server answer (lib/serverContact), kept on the device; null when none was ever seen. */
  lastContact: Date | null
}

/** Follows `navigator.onLine`, the window `online` / `offline` events and the server answers the HTTP client records. */
export function useConnectivity(): Connectivity {
  const [offline, setOffline] = useState(() => !navigator.onLine)
  const [lastContact, setLastContact] = useState<Date | null>(lastServerContact)

  useEffect(() => {
    const goOffline = () => setOffline(true)
    const goOnline = () => setOffline(false)
    window.addEventListener('offline', goOffline)
    window.addEventListener('online', goOnline)
    const off = subscribeServerContact((at) => setLastContact(at))
    // An answer may have landed between the first render and this effect.
    setLastContact(lastServerContact())
    return () => {
      window.removeEventListener('offline', goOffline)
      window.removeEventListener('online', goOnline)
      off()
    }
  }, [])

  return { offline, lastContact }
}
