// "Who eats it": the attending Members as toggle pills for one Course. Rules: lib/slotCourses (the summary in words).
import { MemberPill } from '../../../ui'
import { eatersSummary } from '../lib/slotCourses'
import type { Member } from '../types'

export interface CourseEatersProps {
  courseName: string
  /** The group's accessible name ("Who eats Dessert", "Who eats Dessert on this date"). */
  groupLabel: string
  /** The Members offered: the ones who attend (the caller filters). */
  members: readonly Member[]
  /** Members who opt out of this Course; an id that is not in `members` is ignored. */
  optOutMemberIds: readonly number[]
  disabled?: boolean
  /** A pill was pressed: `eats` is the new state of that Member. */
  onChange: (memberId: number, eats: boolean) => void
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

export function CourseEaters({ courseName, groupLabel, members, optOutMemberIds, disabled, onChange }: CourseEatersProps) {
  const optOut = new Set(optOutMemberIds)
  const outNames = members.filter((m) => optOut.has(m.id)).map((m) => m.name)
  const summary = eatersSummary(courseName, outNames)
  return (
    <div className="course-eaters">
      <div role="group" aria-label={groupLabel} className="course-eaters__pills">
        {members.map((m) => {
          const eats = !optOut.has(m.id)
          return (
            <button
              key={m.id}
              type="button"
              aria-pressed={eats}
              aria-label={m.name}
              disabled={disabled}
              className="course-eaters__pill"
              onClick={() => onChange(m.id, !eats)}
            >
              <MemberPill name={firstName(m.name)} colour={m.colour} glyph={m.avatar || undefined} photoUrl={m.photoUrl || undefined} />
            </button>
          )
        })}
      </div>
      {summary ? <p className="course-eaters__summary">{summary}</p> : null}
    </div>
  )
}
