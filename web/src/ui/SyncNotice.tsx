// RES-03: the notice for what did not sync ("Couldn't sync the Tick of Carrot.") or synced twice ("Carrot was ticked twice").
// A tile in the danger or info tone: a 24 px icon, a body-strong headline, an optional muted subline, optional R-E rows (a DetailList) and
// secondary small Buttons (R-A). It renders and wires events only; the copy comes from the caller.
import type { ReactNode } from 'react'
import { Button } from './Button'
import { DetailList, DetailRow } from './DetailList'
import { Icon } from './Icon'
import './SyncNotice.css'

export interface SyncNoticeRow {
  /** The key, body-strong ("Sam", "You"). */
  key: ReactNode
  /** The amount at the row's end, tabular, in the notice's tone. */
  amount?: ReactNode
  /** The time, muted, under the key. */
  time?: ReactNode
}

export interface SyncNoticeAction {
  label: string
  onClick: () => void
}

export interface SyncNoticeProps {
  tone: 'danger' | 'info'
  /** The headline, body-strong. */
  title: ReactNode
  /** The muted subline. */
  subtitle?: ReactNode
  /** R-E rows, one per addition. */
  rows?: SyncNoticeRow[]
  /** Secondary small Buttons, in order. */
  actions?: SyncNoticeAction[]
}

/**
 * A refused sync is an alert (danger, a loss); a Line ticked twice is a status (info): it can arrive while nobody is looking, so it
 * is announced politely and focus stays where it was.
 */
export function SyncNotice({ tone, title, subtitle, rows, actions }: SyncNoticeProps) {
  return (
    <div className="sync-notice" data-tone={tone} role={tone === 'danger' ? 'alert' : 'status'}>
      <span className="sync-notice__icon">
        <Icon name={tone === 'danger' ? 'spoiled' : 'info'} size={24} />
      </span>
      <div className="sync-notice__body">
        <p className="sync-notice__title">{title}</p>
        {subtitle ? <p className="sync-notice__subline">{subtitle}</p> : null}
        {rows && rows.length > 0 ? (
          <DetailList tone={tone} className="sync-notice__rows">
            {rows.map((row, i) => (
              <DetailRow
                key={i}
                label={<span className="sync-notice__key">{row.key}</span>}
                state={row.amount ? <span className="sync-notice__amount">{row.amount}</span> : undefined}
                detail={row.time ? <span className="sync-notice__time">{row.time}</span> : undefined}
              />
            ))}
          </DetailList>
        ) : null}
      </div>
      {actions && actions.length > 0 ? (
        <div className="sync-notice__actions">
          {actions.map((a) => (
            <Button key={a.label} variant="secondary" size="sm" onClick={a.onClick}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  )
}

/** The notices to show: newest first (the input is oldest first), at most `max`, and how many were left out. */
export function stackNotices<T>(oldestFirst: readonly T[], max = 3): { shown: T[]; more: number } {
  const newestFirst = [...oldestFirst].reverse()
  return { shown: newestFirst.slice(0, max), more: Math.max(0, newestFirst.length - max) }
}

/** The stack of notices: the newest three, newest first, then "and N more". */
export function SyncNoticeStack({ notices }: { notices: readonly (SyncNoticeProps & { id: string })[] }) {
  const { shown, more } = stackNotices(notices)
  if (shown.length === 0) return null
  return (
    <div className="sync-notice-stack">
      {shown.map(({ id, ...props }) => (
        <SyncNotice key={id} {...props} />
      ))}
      {more > 0 ? <p className="sync-notice-stack__more">and {more} more</p> : null}
    </div>
  )
}
