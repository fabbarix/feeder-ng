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
  /** DS-11: `false` is the outlined, struck-through pill (a Member who is not chosen, such as one who does not eat a Course); omitted or
   * `true` is the filled pill. Pair it with `aria-pressed` on the button that holds the pill: the state is shape and decoration, not fading. */
  selected?: boolean
}

/** Avatar (sm, Member colour ring) + first name in a pill. A shared primitive. */
export function MemberPill({ name, colour, glyph, photoUrl, selected }: MemberPillProps) {
  const style = { '--member-colour': colour } as CSSProperties
  const first = name.trim().split(/\s+/)[0] ?? name
  return (
    <span className="member-pill" data-member-colour={colour} data-selected={selected === undefined ? undefined : String(selected)} style={style}>
      <Avatar name={name} size="sm" colour={colour} glyph={glyph} imageUrl={photoUrl} />
      <span className="member-pill__name">{first}</span>
    </span>
  )
}
