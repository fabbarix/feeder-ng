import type { CSSProperties } from 'react'
import { Avatar } from '../Avatar'
import './MemberPill.css'

export interface MemberPillProps {
  name: string
  /** The Member colour, "#rrggbb". */
  colour: string
  /** Optional emoji; without one the Avatar shows initials. */
  glyph?: string
  /** PE: the Member's Photo address ("/api/images/<id>"); shown first, then the emoji, then the initials. */
  photoUrl?: string
}

/** Avatar (sm, Member colour ring) + first name in a pill. A shared primitive. */
export function MemberPill({ name, colour, glyph }: MemberPillProps) {
  const style = { '--member-colour': colour } as CSSProperties
  const first = name.trim().split(/\s+/)[0] ?? name
  return (
    <span className="member-pill" data-member-colour={colour} style={style}>
      <Avatar name={name} size="sm" colour={colour} glyph={glyph} />
      <span className="member-pill__name">{first}</span>
    </span>
  )
}
