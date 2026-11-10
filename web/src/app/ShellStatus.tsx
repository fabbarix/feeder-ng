// The shell's status slot under the top bar: today only the OfflineBanner (WP4's ui/OfflineBanner).
// This file is the ONLY shell file that imports it, so AppShell tests can mock './ShellStatus'.
// It cannot resolve until the branch is synced with team/wp4-primitives-b: the Developer syncs first.

export interface ShellStatusProps {
  /** Scans waiting to sync, from the scan feature's queue; 0 or missing hides that line. */
  pendingScans?: number
}

/** STUB (WP5 designer). Renders `<OfflineBanner offline savedAt pendingScans>` from `useConnectivity()`. */
export function ShellStatus(_props: ShellStatusProps): null {
  throw new Error('not implemented')
}
