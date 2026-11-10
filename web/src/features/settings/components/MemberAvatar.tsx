import { Avatar, type AvatarProps } from '../../../ui'
import type { CSSProperties } from 'react'
import '../settings.css'

export interface MemberAvatarProps extends Pick<AvatarProps, 'size'> {
  name: string
  /** The Member colour, "#rrggbb": the Avatar draws it as its ring. */
  colour: string
  /** Optional emoji. Not shown yet: the Avatar primitive has no glyph slot (follow-up), so initials are shown. */
  avatar?: string
}

/**
 * The shared Avatar with its ring in the Member colour. The `colour` prop is the Avatar's own ring, so the fill and the
 * initials keep the primitive's contrast. The wrapper carries `--member-colour` for the feature CSS.
 */
export function MemberAvatar({ name, colour, size = 'md' }: MemberAvatarProps) {
  const style = { '--member-colour': colour } as CSSProperties
  return (
    <span className="member-avatar" data-member-colour={colour} style={style}>
      <Avatar name={name} size={size} colour={colour} />
    </span>
  )
}
