// The shell's status slot under the top bar: the OfflineBanner (ui/OfflineBanner) and the back-online notice.
// This file is the ONLY shell file that imports it, so AppShell tests can mock './ShellStatus'.
import { OfflineBanner } from '../ui/OfflineBanner'
import { readCachedTimeZone } from './meCache'
import { useBackOnlineNotice } from './useBackOnlineNotice'
import { useConnectivity } from './useConnectivity'

export interface ShellStatusProps {
  /** Scans waiting to sync, from the scan feature's queue; 0 or missing hides that part. */
  pendingScans?: number
  /** B9-49: Ticks waiting to sync (RES-03). */
  pendingTicks?: number
}

/** Renders the OfflineBanner from `useConnectivity()` (nothing while online), in the Household's time (RES-07). */
export function ShellStatus({ pendingScans = 0, pendingTicks = 0 }: ShellStatusProps) {
  const { offline, lastContact } = useConnectivity()
  useBackOnlineNotice({ offline, pendingScans, pendingTicks })
  return (
    <OfflineBanner
      offline={offline}
      savedAt={lastContact}
      timeZone={offline ? readCachedTimeZone() : null}
      now={offline ? new Date() : undefined}
      pendingScans={pendingScans}
      pendingTicks={pendingTicks}
    />
  )
}
