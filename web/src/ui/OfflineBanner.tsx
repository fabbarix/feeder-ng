import { Icon } from './Icon'
import { overlayStrings } from './overlayStrings'
import { clockTime } from './lib/time24'
import './OfflineBanner.css'

export interface OfflineBannerProps {
  offline: boolean
  /** When the saved data was last refreshed; shown as 24 h clock time. */
  savedAt?: Date | null
  /** Scans waiting to sync; the line is hidden at 0. */
  pendingScans?: number
}

/** Polite live region under the top bar; renders nothing while online. */
export function OfflineBanner({ offline, savedAt, pendingScans = 0 }: OfflineBannerProps) {
  if (!offline) return null
  const saved = savedAt ? `${overlayStrings.showingSaved}${overlayStrings.savedAt(clockTime(savedAt))}` : overlayStrings.showingSaved
  return (
    <div role="status" aria-live="polite" className="offline-banner">
      <Icon name="offline" size={16} />
      <span>{`${overlayStrings.offline} · ${saved}`}</span>
      {pendingScans > 0 ? <span className="offline-banner__queue">{overlayStrings.scansWaiting(pendingScans)}</span> : null}
    </div>
  )
}
