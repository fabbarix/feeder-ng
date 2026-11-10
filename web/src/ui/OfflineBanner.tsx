import type { ReactNode } from 'react'

export interface OfflineBannerProps {
  offline: boolean
  /** When the saved data was last refreshed; shown as 24 h clock time. */
  savedAt?: Date | null
  /** Scans waiting to sync; the line is hidden at 0. */
  pendingScans?: number
}

/** STUB (WP4 designer). Polite live region under the top bar; renders nothing while online. */
export function OfflineBanner(_props: OfflineBannerProps): ReactNode {
  throw new Error('not implemented')
}
