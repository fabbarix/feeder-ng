// The Scan feature's contribution to the app shell's status banner (the WP5 extension point, see
// docs/dev/design/wp5-shell.md "useShellStatus"): how many scans sit in the persisted offline queue. It is called on
// EVERY screen, so it owns no sync queue and no network: it only counts the persisted entries. React hook.
// B9-54: Ticks by hand (shop_tick, shop_untick) are counted apart from the Scans.
import { useEffect, useMemo, useState } from 'react'
import { appOpStore } from '../lib/idbStore'
import type { OpStore } from '../lib/queue'
import { onQueueChange } from '../lib/queueEvents'
import { countPending } from '../../shop/lib/pendingTicks'

export interface ShellStatus {
  pendingScans: number
  /** B9-54 (RES-03): Ticks by hand waiting in the same queue (a shop_tick or shop_untick); the banner says "2 Scans and 1 Tick waiting to sync" */
  pendingTicks: number
}

/**
 * Counts `store.all()` (rejected operations are not in the store, so this is "waiting to sync"). Reads on mount and again
 * on onQueueChange, on the window `online`/`offline` events and when the tab becomes visible. 0 until the first read;
 * a read that throws (no IndexedDB) counts 0. `store` is injectable for tests (default appOpStore(), which announces its changes).
 */
export function useShellStatus(store?: OpStore): ShellStatus {
  const source = useMemo(() => store ?? appOpStore(), [store])
  const [counts, setCounts] = useState<ShellStatus>(NONE)

  useEffect(() => {
    let alive = true
    const read = () => {
      Promise.resolve()
        .then(() => source.all())
        .then(
          (entries) => {
            if (!alive) return
            const { scans, ticks } = countPending(entries.map((e) => e.op))
            setCounts((prev) => (prev.pendingScans === scans && prev.pendingTicks === ticks ? prev : { pendingScans: scans, pendingTicks: ticks }))
          },
          () => alive && setCounts(NONE),
        )
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') read()
    }
    read()
    const offChange = onQueueChange(read)
    window.addEventListener('online', read)
    window.addEventListener('offline', read)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      offChange()
      window.removeEventListener('online', read)
      window.removeEventListener('offline', read)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [source])

  return counts
}

const NONE: ShellStatus = { pendingScans: 0, pendingTicks: 0 }
