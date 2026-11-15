// B9-54 (RES-03): the stack of SyncNotices above the Shop's metrics: what a sync of queued Ticks said (ticked twice, refused). Renders and
// wires events only; the notices and their copy come from lib/tickNotices.
import { SyncNoticeStack } from '../../../ui/SyncNotice'
import type { TickNotice, TickNoticeAction } from '../lib/tickNotices'

export interface TickSyncNoticesProps {
  /** oldest first; the stack shows the newest three, newest first, then "and N more" */
  notices: readonly TickNotice[]
  onAction: (notice: TickNotice, action: TickNoticeAction) => void
}

export function TickSyncNotices({ notices, onAction }: TickSyncNoticesProps) {
  if (notices.length === 0) return null
  return (
    <SyncNoticeStack
      notices={notices.map((n) => ({
        id: n.id,
        tone: n.tone,
        title: n.title,
        subtitle: n.subtitle,
        rows: n.rows,
        // P38: two notices both offer Dismiss, so each button is named after its notice ("Dismiss: Carrot was ticked twice")
        actions: n.actions.map((a) => ({ label: a.label, ariaLabel: `${a.label}: ${n.title}`, onClick: () => onAction(n, a.id) })),
      }))}
    />
  )
}
