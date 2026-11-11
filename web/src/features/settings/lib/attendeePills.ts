import type { AttendanceEntry, Member } from '../types'

export interface AttendeePillsModel {
  state: 'nobody' | 'some'
  /** At most `max` Members, in the Members list order. */
  shown: Member[]
  /** The rest, behind "+N". */
  more: Member[]
}
/** Attendees whose Member no longer exists are ignored; none left means 'nobody'. */
export function attendeePills(attendance: AttendanceEntry[], members: Member[], max = 4): AttendeePillsModel {
  const ids = new Set(attendance.map((a) => a.memberId))
  const present = members.filter((m) => ids.has(m.id))
  if (present.length === 0) return { state: 'nobody', shown: [], more: [] }
  return { state: 'some', shown: present.slice(0, max), more: present.slice(max) }
}
