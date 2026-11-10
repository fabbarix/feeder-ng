import { Button } from '../../../ui/Button'
import { uiStrings } from '../../../ui/strings'
import { scanStrings } from '../strings'
import type { SyncNotice } from '../lib/notices'

export interface ScanNoticesProps {
  online: boolean
  pendingCount: number
  /** operations the server rejected (removed from the queue); shown with a way to dismiss them */
  rejectedCount: number
  onDismissRejected: () => void
  notices: SyncNotice[]
  onDismiss: (clientUuid: string) => void
}

/** The offline note, the count of scans waiting to sync, and the sync notices (each dismissable). */
export function ScanNotices({ online, pendingCount, notices, onDismiss }: ScanNoticesProps) {
  return (
    <div className="scan-notices">
      {!online ? <p className="scan-notices__offline">{scanStrings.offline}</p> : null}
      {pendingCount > 0 ? <p className="scan-notices__queued">{scanStrings.queued(pendingCount)}</p> : null}
      {notices.map((n) => (
        <div key={`${n.kind}-${n.clientUuid}`} className="scan-notices__item" data-kind={n.kind}>
          <p>{n.text}</p>
          <Button variant="ghost" onClick={() => onDismiss(n.clientUuid)}>
            {uiStrings.dismiss}
          </Button>
        </div>
      ))}
    </div>
  )
}
