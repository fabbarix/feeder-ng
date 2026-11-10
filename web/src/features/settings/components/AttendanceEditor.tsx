import { Checkbox, Stepper } from '../../../ui'
import { MemberAvatar } from './MemberAvatar'
import { effectiveFactor, formatPortionsNeeded, MAX_PORTION_FACTOR, MIN_PORTION_FACTOR, PORTION_STEP, portionsNeeded, withFactor } from '../lib/portions'
import { settingsStrings } from '../strings'
import type { AttendanceEntry, Member } from '../types'
import '../settings.css'

export interface AttendanceEditorProps {
  members: Member[]
  value: AttendanceEntry[]
  onChange: (next: AttendanceEntry[]) => void
}

const text = settingsStrings.attendance

/** One checkbox per Member; attending Members get a "Portion Factor for <name>" stepper (override); a status line
 *  "Portions needed: 2.5". */
export function AttendanceEditor({ members, value, onChange }: AttendanceEditorProps) {
  if (members.length === 0) return <p className="settings__muted">{text.noMembers}</p>

  const toggle = (member: Member, attending: boolean) =>
    onChange(attending ? [...value, { memberId: member.id, portionFactorOverride: null }] : value.filter((e) => e.memberId !== member.id))
  const setFactor = (member: Member, entry: AttendanceEntry, factor: number) =>
    onChange(value.map((e) => (e === entry ? withFactor(member, entry, factor) : e)))

  return (
    <div className="attendance">
      {members.map((m) => {
        const entry = value.find((e) => e.memberId === m.id)
        return (
          <div key={m.id} className="attendance__row">
            <span className="settings__row">
              <MemberAvatar name={m.name} colour={m.colour} avatar={m.avatar} size="sm" />
              <Checkbox label={m.name} checked={Boolean(entry)} onChange={(attending) => toggle(m, attending)} />
            </span>
            {entry ? (
              <Stepper
                label={text.portionFactorFor(m.name)}
                value={effectiveFactor(m, entry)}
                min={MIN_PORTION_FACTOR}
                max={MAX_PORTION_FACTOR}
                step={PORTION_STEP}
                onChange={(factor) => setFactor(m, entry, factor)}
              />
            ) : null}
          </div>
        )
      })}
      <p role="status" className="settings__muted">
        {text.portionsNeeded(formatPortionsNeeded(portionsNeeded(members, value)))}
      </p>
    </div>
  )
}
