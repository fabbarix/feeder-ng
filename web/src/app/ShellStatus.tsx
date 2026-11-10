// The shell's status slot under the top bar: today only the OfflineBanner (WP4's ui/OfflineBanner).
// This file is the ONLY shell file that imports it, so AppShell tests can mock './ShellStatus'.
import { OfflineBanner } from '../ui/OfflineBanner'
import { useConnectivity } from './useConnectivity'

export interface ShellStatusProps {
  /** Scans waiting to sync, from the scan feature's queue; 0 or missing hides that line. */
  pendingScans?: number
}

/** Renders the OfflineBanner from `useConnectivity()`; nothing while online. */
export function ShellStatus({ pendingScans }: ShellStatusProps) {
  const { offline, savedAt } = useConnectivity()
  return <OfflineBanner offline={offline} savedAt={savedAt} pendingScans={pendingScans} />
}
