// The Scan feature's contribution to the app shell's status banner (the WP5 extension point, see
// docs/dev/design/wp5-shell.md "useShellStatus"): how many scans sit in the persisted offline queue. It is called on
// EVERY screen, so it owns no sync queue and no network: it only counts the persisted entries. React hook.
import { useEffect, useMemo, useState } from 'react'
import { appOpStore } from '../lib/idbStore'
import type { OpStore } from '../lib/queue'
import { onQueueChange } from '../lib/queueEvents'

export interface ShellStatus {
  pendingScans: number
}

/**
 * Counts `store.all()` (rejected operations are not in the store, so this is "waiting to sync"). Reads on mount and again
 * on onQueueChange, on the window `online`/`offline` events and when the tab becomes visible. 0 until the first read;
 * a read that throws (no IndexedDB) counts 0. `store` is injectable for tests (default appOpStore(), which announces its changes).
 */
export function useShellStatus(store?: OpStore): ShellStatus {
  const source = useMemo(() => store ?? appOpStore(), [store])
  const [pendingScans, setPendingScans] = useState(0)

  useEffect(() => {
    let alive = true
    const read = () => {
      Promise.resolve()
        .then(() => source.all())
        .then(
          (entries) => alive && setPendingScans(entries.length),
          () => alive && setPendingScans(0),
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

  return { pendingScans }
}
