import type { AttendanceEntry, Member } from '../types'

export interface AttendanceEditorProps {
  members: Member[]
  value: AttendanceEntry[]
  onChange: (next: AttendanceEntry[]) => void
}

/** One checkbox per Member; attending Members get a "Portion Factor for <name>" stepper (override); a status line
 *  "Portions needed: 2.5". */
export function AttendanceEditor(_props: AttendanceEditorProps) {
  return null
}
