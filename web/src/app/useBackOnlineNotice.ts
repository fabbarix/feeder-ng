// B9-49 (RES-07): "Back online · 2 Scans and 1 Tick synced", a plain toast (no icon, R-D+) once the queue has drained after the connection
// returned. Nothing waited: no toast. React hook; the counting is the pure `nextBackOnline` below.
import { useEffect, useRef } from 'react'
import { useToast } from '../ui/Toast'
import { overlayStrings } from '../ui/overlayStrings'

export interface BackOnlineInput {
  offline: boolean
  pendingScans: number
  pendingTicks: number
}

interface Held {
  scans: number
  ticks: number
}

/** The most that waited since the connection dropped (null when not following a return), and what to announce now, if anything. */
export function nextBackOnline(held: Held | null, input: BackOnlineInput): { held: Held | null; synced: Held | null } {
  const { offline, pendingScans, pendingTicks } = input
  if (offline) {
    return { held: { scans: Math.max(held?.scans ?? 0, pendingScans), ticks: Math.max(held?.ticks ?? 0, pendingTicks) }, synced: null }
  }
  if (!held) return { held: null, synced: null }
  const most = { scans: Math.max(held.scans, pendingScans), ticks: Math.max(held.ticks, pendingTicks) }
  if (pendingScans > 0 || pendingTicks > 0) return { held: most, synced: null } // back, still syncing
  return { held: null, synced: most.scans + most.ticks > 0 ? most : null }
}

export function useBackOnlineNotice(input: BackOnlineInput): void {
  const toast = useToast()
  const held = useRef<Held | null>(null)
  const { offline, pendingScans, pendingTicks } = input
  useEffect(() => {
    const next = nextBackOnline(held.current, { offline, pendingScans, pendingTicks })
    held.current = next.held
    if (next.synced) toast.show(overlayStrings.backOnlineSynced(next.synced.scans, next.synced.ticks), { status: 'neutral' })
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the toast API is stable; only the connection and the queue matter
  }, [offline, pendingScans, pendingTicks])
}
