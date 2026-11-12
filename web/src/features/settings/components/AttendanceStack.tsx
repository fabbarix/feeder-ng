import { Avatar } from '../../../ui'
import { attendanceText, type CardAttendance } from '../lib/mealSlotCards'
import { settingsStrings } from '../strings'
import type { Member } from '../types'
import '../mealSlotCards.css'

export interface AttendanceStackProps {
  attendance: CardAttendance
  members: Member[]
  /** Avatars before "+N" (default 4). */
  max?: number
  /** Names the list for assistive technology, e.g. "Attending Dinner". */
  label: string
}

/** The Members who attend, as an Avatar stack (Members order, at most `max`, then "+N") and the words "Fabio only". Nothing for everyone or nobody. */
export function AttendanceStack({ attendance, members, max = 4, label }: AttendanceStackProps) {
  if (attendance.state !== 'some') return null
  const present = members.filter((m) => attendance.memberIds.includes(m.id))
  const shown = present.slice(0, max)
  const more = present.length - shown.length
  return (
    <div className="ms-attendance">
      <ul className="ms-stack" aria-label={label}>
        {shown.map((m) => (
          <li key={m.id} className="ms-stack__item">
            <Avatar name={m.name} imageUrl={m.photoUrl || undefined} colour={m.colour} size="sm" />
          </li>
        ))}
        {more > 0 ? <li className="ms-stack__more">{settingsStrings.slot.moreMembers(more)}</li> : null}
      </ul>
      <span className="ms-attendance__text">{attendanceText(attendance, members)}</span>
    </div>
  )
}
