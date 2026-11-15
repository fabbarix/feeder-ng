// B9-54 (RES-03): the stack of SyncNotices above the metrics. STUB (test author).
import type { TickNotice, TickNoticeAction } from '../lib/tickNotices'

export interface TickSyncNoticesProps {
  /** oldest first; the stack shows the newest three, newest first, then "and N more" */
  notices: readonly TickNotice[]
  onAction: (notice: TickNotice, action: TickNoticeAction) => void
}

export function TickSyncNotices(_props: TickSyncNoticesProps) {
  return null
}
