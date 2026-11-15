// B9-44 (TB-12, decision TB 5): the Scan session this phone has open (the persisted Scanned list, lib/sessionStore), for Today's
// "Shopping at <Shop>" tile. It is read again when the store changes in this tab, each minute (a session stops being active 60 min
// after its last Scan) and when the tab becomes visible. `end` is Done shopping; `resume` makes /scan open straight on that Shop.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { setLastShopId } from '../lib/lastShop'
import { appSessionStore, type ActiveSession } from '../lib/sessionStore'

export interface ActiveScanSession extends ActiveSession {
  end: () => Promise<void>
  resume: () => void
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

/** The active session on the Household's `day`, or null (also while the day is not known). */
export function useActiveScanSession(day: string | null): ActiveScanSession | null {
  const store = useMemo(() => appSessionStore(), [])
  const [session, setSession] = useState<ActiveSession | null>(null)
  useEffect(() => {
    if (day === null) {
      setSession(null)
      return
    }
    let alive = true
    const check = () => {
      void store.active(day).then((s) => {
        if (alive) setSession((prev) => (same(prev, s) ? prev : s))
      })
    }
    check()
    const off = store.subscribe(check)
    const timer = setInterval(check, 60_000)
    const onVisible = () => {
      if (document.visibilityState !== 'hidden') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      off()
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [store, day])
  const end = useCallback(() => store.end(), [store])
  const shopId = session?.shopId
  const resume = useCallback(() => {
    if (shopId !== undefined) setLastShopId(storage(), shopId)
  }, [shopId])
  return session ? { ...session, end, resume } : null
}

function same(a: ActiveSession | null, b: ActiveSession | null): boolean {
  return a === b || (a !== null && b !== null && a.shopId === b.shopId && a.scanned === b.scanned && a.lastScanAt === b.lastScanAt)
}
