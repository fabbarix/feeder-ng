import { useId, type ReactNode } from 'react'
import { Checkbox, Muted, Stepper } from '../../../ui'
import { MemberAvatar } from './MemberAvatar'
import { effectiveFactor, formatPortionsNeeded, MAX_PORTION_FACTOR, MIN_PORTION_FACTOR, PORTION_STEP, portionsNeeded, withFactor } from '../lib/portions'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, Member } from '../types'
import '../settings.css'

export interface AttendanceEditorProps {
  members: Member[]
  value: AttendanceEntry[]
  onChange: (next: AttendanceEntry[]) => void
  /** B9-46 plugs the Away "Eats here anyway" control in here: rendered in the Member's row, under the name. */
  memberExtra?: (member: Member, entry: AttendanceEntry | undefined) => ReactNode
}

const text = settingsStrings.attendance

/**
 * SET-10: one row per Member, [checkbox 44] [Avatar 40] [name, two lines] [Portion Factor stepper, or a muted "Not eating"]; below
 * 20 rem of list width every stepper moves under its name, inside the same row. Then the status line "Portions needed: 2.5".
 */
export function AttendanceEditor({ members, value, onChange, memberExtra }: AttendanceEditorProps) {
  const baseId = useId()
  if (members.length === 0) return <Muted>{text.noMembers}</Muted>

  const toggle = (member: Member, attending: boolean) =>
    onChange(attending ? [...value, { memberId: member.id, portionFactorOverride: null }] : value.filter((e) => e.memberId !== member.id))
  const setFactor = (member: Member, entry: AttendanceEntry, factor: number) =>
    onChange(value.map((e) => (e === entry ? withFactor(member, entry, factor) : e)))

  return (
    <div className="attendance-editor">
      <ul className="attendance">
        {members.map((m) => {
          const entry = value.find((e) => e.memberId === m.id)
          const checkId = `${baseId}-${m.id}`
          const extra = memberExtra?.(m, entry)
          return (
            <li key={m.id} className="attendance__row">
              <span className="attendance__check">
                <Checkbox id={checkId} checked={Boolean(entry)} onChange={(attending) => toggle(m, attending)} />
              </span>
              {/* Decorative: the name beside it says whose row it is. */}
              <span className="attendance__av" aria-hidden="true">
                <MemberAvatar name={m.name} colour={m.colour} avatar={m.avatar} photo={m.photo} />
              </span>
              <div className="attendance__main">
                <label htmlFor={checkId} className="attendance__name">
                  {m.name}
                </label>
                {extra ?? null}
              </div>
              {entry ? (
                <div className="attendance__step">
                  <Stepper
                    label={text.portionFactorFor(m.name)}
                    value={effectiveFactor(m, entry)}
                    min={MIN_PORTION_FACTOR}
                    max={MAX_PORTION_FACTOR}
                    step={PORTION_STEP}
                    onChange={(factor) => setFactor(m, entry, factor)}
                  />
                </div>
              ) : (
                <span className="attendance__off">{text.notEating}</span>
              )}
            </li>
          )
        })}
      </ul>
      <div role="status">
        <Muted>{text.portionsNeeded(formatPortionsNeeded(portionsNeeded(members, value)))}</Muted>
      </div>
    </div>
  )
}
