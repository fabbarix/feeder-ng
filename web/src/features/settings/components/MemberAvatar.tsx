import { Avatar, type AvatarProps } from '../../../ui'
import type { CSSProperties } from 'react'
import '../settings.css'

export interface MemberAvatarProps extends Pick<AvatarProps, 'size'> {
  name: string
  /** The Member colour, "#rrggbb": the Avatar draws it as its ring. */
  colour: string
  /** Optional emoji, shown instead of the initials. */
  avatar?: string
  /** IM2: the photo's image id ('' or absent = none). Shown instead of the emoji; if it cannot load, the Avatar falls back to the emoji, then the initials. */
  photo?: string
}

/**
 * The shared Avatar with its ring in the Member colour. The `colour` prop is the Avatar's own ring, so the fill and the
 * initials keep the primitive's contrast. The wrapper carries `--member-colour` for the feature CSS.
 */
export function MemberAvatar({ name, colour, avatar, photo, size = 'md' }: MemberAvatarProps) {
  const style = { '--member-colour': colour } as CSSProperties
  return (
    <span className="member-avatar" data-member-colour={colour} style={style}>
      <Avatar name={name} size={size} colour={colour} glyph={avatar} imageUrl={photo ? `/api/images/${photo}` : undefined} />
    </span>
  )
}
