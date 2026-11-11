import type { AttendanceEntry, Member } from '../types'

export interface AttendeePillsModel {
  state: 'nobody' | 'some'
  /** At most `max` Members, in the Members list order. */
  shown: Member[]
  /** The rest, behind "+N". */
  more: Member[]
}
/** STUB (R15 step 2). Attendees whose Member no longer exists are ignored; none left means 'nobody'. */
export function attendeePills(_attendance: AttendanceEntry[], _members: Member[], _max = 4): AttendeePillsModel {
  throw new Error('not implemented')
}
