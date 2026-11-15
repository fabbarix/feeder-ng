// B9-49 (RES-08): what AppRoot shows while /api/me is pending, instead of a bare "Loading". The same markup and classes as the skeleton
// in index.html (styled there: no app CSS is needed), so React takes over without a jump. One status, "Opening Feeder"; the blocks
// are decoration (aria-hidden).

import type { CSSProperties } from 'react'
import { shellStrings } from './strings'

const RAIL_PILLS = 7
const OPENING = shellStrings.opening

/** The Family Pot mark, as index.html draws it in the skeleton's top bar. */
function Mark() {
  return (
    <svg viewBox="0 0 512 512" width="24" height="24" aria-hidden="true" fill="currentColor">
      <g transform="translate(-36.71 -15.55) scale(1.1434)">
        <path fill="currentColor" d="M100 214 A156 52 0 0 1 412 214 Z M100 204 H412 A12 12 0 0 1 424 216 V216 A12 12 0 0 1 412 228 H100 A12 12 0 0 1 88 216 V216 A12 12 0 0 1 100 204 Z M172 250 H340 A56 56 0 0 1 396 306 V362 A56 56 0 0 1 340 418 H172 A56 56 0 0 1 116 362 V306 A56 56 0 0 1 172 250 Z M92 270 H116 A20 20 0 0 1 136 290 V290 A20 20 0 0 1 116 310 H92 A20 20 0 0 1 72 290 V290 A20 20 0 0 1 92 270 Z M396 270 H420 A20 20 0 0 1 440 290 V290 A20 20 0 0 1 420 310 H396 A20 20 0 0 1 376 290 V290 A20 20 0 0 1 396 270 Z" />
        <path fill="currentColor" d="M 256 146 C 196 110 196 62 226 58 C 242 56 252 66 256 76 C 260 66 270 56 286 58 C 316 62 316 110 256 146 Z" />
      </g>
    </svg>
  )
}

/** The colours index.html's skeleton reads, from the theme already applied (the cached one, or the defaults on a first visit). */
const LIVE_COLOURS = {
  '--boot-bg': 'var(--color-bg)',
  '--boot-surface': 'var(--color-surface)',
  '--boot-surface-2': 'var(--color-surface-2)',
  '--boot-line': 'var(--color-line)',
  '--boot-text': 'var(--color-text)',
  '--boot-accent': 'var(--color-accent)',
} as CSSProperties

export interface BootShellProps {
  /** A line under the skeleton when the server is slow to answer ("Still trying to reach Feeder."). */
  note?: string
}

export function BootShell({ note }: BootShellProps) {
  return (
    <div className="boot-shell" data-live="" style={LIVE_COLOURS} role="status" aria-busy="true" aria-label={OPENING}>
      <div className="boot-shell__top">
        <span className="boot-shell__brand">
          <Mark />
          Feeder
        </span>
        <span className="boot-shell__avatar" />
      </div>
      <div className="boot-shell__rail" aria-hidden="true">
        {Array.from({ length: RAIL_PILLS }, (_, i) => (
          <span key={i} />
        ))}
      </div>
      <div className="boot-shell__page" aria-hidden="true">
        <span className="boot-shell__title" />
        <span className="boot-shell__tile" />
        <span className="boot-shell__tile" />
      </div>
      <div className="boot-shell__bar" aria-hidden="true" />
      {note ? <p className="first-launch__slow">{note}</p> : null}
    </div>
  )
}
