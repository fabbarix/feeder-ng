// DS-12 R-E: structured rows, not bullet sentences. A DetailRow is read-only and dense: a key (body-strong), a state at the
// row's end (body-strong, tabular figures, the tone's colour) and an optional muted detail under them. It sits on a tint, in a
// toast body or in a disclosure. A row the person acts on is a ListRow, not a DetailRow.
import type { ReactNode } from 'react'
import './DetailList.css'

export type DetailTone = 'info' | 'warn' | 'spoil' | 'danger' | 'leftover' | 'success' | 'neutral'

export interface DetailListProps {
  /** The tint it sits on; colours each row's state and the dividers. Default `neutral`. */
  tone?: DetailTone
  /** `surface`: a --color-surface fill, inside a disclosure. Default: no fill (on a tint). */
  fill?: 'none' | 'surface'
  className?: string
  /** The id of a visible label that names the list ("Goes with Sam"): a screen reader reads "Goes with Sam, list, 3 items". */
  'aria-labelledby'?: string
  /** DetailRow elements. */
  children?: ReactNode
}

export interface DetailRowProps {
  /** The key: what the row is about ("Flour"). */
  label: ReactNode
  /** The state, at the row's end ("200 g short"). */
  state?: ReactNode
  /** Muted detail under the key, spanning the row ("The Recipe used 300 g · Stock showed 100 g"). */
  detail?: ReactNode
}

/** A `<ul role="list">`; a screen reader reads each row as key, state, detail. */
export function DetailList({ tone = 'neutral', fill, className, 'aria-labelledby': labelledBy, children }: DetailListProps) {
  return (
    <ul
      role="list"
      className={['detail-list', className].filter(Boolean).join(' ')}
      data-tone={tone}
      data-fill={fill === 'surface' ? 'surface' : undefined}
      aria-labelledby={labelledBy}
    >
      {children}
    </ul>
  )
}

export function DetailRow({ label, state, detail }: DetailRowProps) {
  return (
    <li className="detail-row">
      <span className="detail-row__label">{label}</span>
      {state !== undefined && state !== null && state !== '' ? <span className="detail-row__state">{state}</span> : null}
      {detail !== undefined && detail !== null && detail !== '' ? <span className="detail-row__detail">{detail}</span> : null}
    </li>
  )
}
