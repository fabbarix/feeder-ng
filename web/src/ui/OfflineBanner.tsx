import { Icon } from './Icon'
import { ActionSurface } from './lib/actionSurface'
import { overlayStrings } from './overlayStrings'
import { savedMoment } from '../lib/savedMoment'
import './OfflineBanner.css'

export interface OfflineBannerProps {
  offline: boolean
  /** B9-49 (RES-07): the newest successful server answer; none ever known reads just "Offline". */
  savedAt?: Date | null
  /** The Household's IANA zone the moment is named in; without one, the device clock. */
  timeZone?: string | null
  /** What "today" is measured against: a moment on an earlier day gets its weekday. Without it, the time alone. */
  now?: Date
  /** Scans waiting to sync. */
  pendingScans?: number
  /** Ticks waiting to sync (RES-03). */
  pendingTicks?: number
}

/** Polite live region under the top bar; renders nothing while online. */
export function OfflineBanner({ offline, savedAt, timeZone, now, pendingScans = 0, pendingTicks = 0 }: OfflineBannerProps) {
  if (!offline) return null
  let text: string = overlayStrings.offline
  if (savedAt) {
    const moment = savedMoment(savedAt, now ?? savedAt, timeZone)
    // "saved at 04:30" today, "saved Sat 18:05" on an earlier day
    text += ` · ${overlayStrings.showingSaved}${/^\d/.test(moment) ? overlayStrings.savedAt(moment) : ` ${moment}`}`
  }
  const queue = overlayStrings.queueWaiting(pendingScans, pendingTicks)
  return (
    <div role="status" aria-live="polite" className="offline-banner">
      <ActionSurface>
        <Icon name="offline" size={16} />
        <span>{text}</span>
        {queue ? <span className="offline-banner__queue">{queue}</span> : null}
      </ActionSurface>
    </div>
  )
}
