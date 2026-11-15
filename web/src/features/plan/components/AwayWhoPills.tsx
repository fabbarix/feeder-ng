import { useId, type ReactNode } from 'react'
import { MemberPill, useRovingRadios } from '../../../ui'
import type { AwayMember } from '../api'

export interface AwayWhoPillsProps {
  label: string
  members: AwayMember[]
  value: number | null
  onChange: (memberId: number) => void
}

/** B9-46 (PC-08): "Who", one Member at a time: a radiogroup of Member pills (roving tabindex, arrows choose). */
export function AwayWhoPills({ label, members, value, onChange }: AwayWhoPillsProps): ReactNode {
  const labelId = useId()
  const options = members.map((m) => ({ value: String(m.id) }))
  const roving = useRovingRadios(options, value === null ? null : String(value), (v) => onChange(Number(v)))
  return (
    <div className="away-sheet__who">
      <span id={labelId} className="away-sheet__label">
        {label}
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="away-sheet__pills">
        {members.map((m) => {
          const v = String(m.id)
          return (
            <button
              key={m.id}
              ref={roving.register(v)}
              type="button"
              role="radio"
              aria-checked={m.id === value}
              aria-label={m.name}
              tabIndex={v === roving.tabStop ? 0 : -1}
              className="away-sheet__pill"
              onClick={() => onChange(m.id)}
              onKeyDown={(e) => roving.onKeyDown(e, v)}
            >
              <MemberPill name={m.name} colour={m.colour} glyph={m.avatar || undefined} photoUrl={m.photoUrl || undefined} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
