// B9-49 (RES-07): the one place that sums the features' useShellStatus hooks (AppRoot and AppUpdate read it). React hook.
import type { ShellStatusHook } from './features'

export interface ShellStatusTotals {
  pendingScans: number
  pendingTicks: number
  pendingAccessRequests: number
  /** Scans plus Ticks: what waits to sync (the update prompt holds back for it). An access request is not a sync. */
  syncCount: number
}

/** Calls every hook on every render, in order (the list is fixed for the app's life), and sums what they report. */
export function useShellStatus(hooks: readonly ShellStatusHook[]): ShellStatusTotals {
  let pendingScans = 0
  let pendingTicks = 0
  let pendingAccessRequests = 0
  for (const useStatus of hooks) {
    const status = useStatus()
    pendingScans += status.pendingScans ?? 0
    pendingTicks += status.pendingTicks ?? 0
    pendingAccessRequests += status.pendingAccessRequests ?? 0
  }
  return new Totals(pendingScans, pendingTicks, pendingAccessRequests)
}

class Totals implements ShellStatusTotals {
  readonly pendingScans: number
  readonly pendingTicks: number
  readonly pendingAccessRequests: number

  constructor(pendingScans: number, pendingTicks: number, pendingAccessRequests: number) {
    this.pendingScans = pendingScans
    this.pendingTicks = pendingTicks
    this.pendingAccessRequests = pendingAccessRequests
  }

  /** Derived, so the counts stay the object's own data. */
  get syncCount(): number {
    return this.pendingScans + this.pendingTicks
  }
}
