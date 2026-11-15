import type { ReactNode } from 'react'
import { Switch } from '../../../ui'
import { awayStrings } from '../../plan/strings/away'

const s = awayStrings.away

export interface AttendanceAwayProps {
  /** The Member's name: the switch is named "<Name> eats here anyway" (unique on the sheet). */
  name: string
  /** "Away Thu 12 – Sat 14". */
  line: string
  eatsHere: boolean
  onChange: (eatsHere: boolean) => void
}

/** B9-46 (PC-08): under an away Member's name in Who's eating: the Away's days (info) and the "Eats here anyway" switch. */
export function AttendanceAway({ name, line, eatsHere, onChange }: AttendanceAwayProps): ReactNode {
  return (
    <div className="attendance__away">
      <span className="attendance__away-line">{line}</span>
      <Switch label={s.eatsHereAnyway} aria-label={s.eatsHereAnywayFor(name)} checked={eatsHere} onChange={onChange} />
    </div>
  )
}
