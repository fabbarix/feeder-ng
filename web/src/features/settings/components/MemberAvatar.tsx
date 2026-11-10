import { Avatar, type AvatarProps } from '../../../ui'
import type { CSSProperties } from 'react'
import '../settings.css'

export interface MemberAvatarProps extends Pick<AvatarProps, 'size'> {
  name: string
  /** The Member colour, "#rrggbb": rings the Avatar and tints its background. */
  colour: string
  /** Optional emoji; shown instead of initials. */
  avatar?: string
}

/**
 * The shared Avatar inside a ring in the Member colour: `<span data-member-colour style="--member-colour">`; the feature
 * CSS draws the 2 px ring from the custom property. An emoji `avatar` replaces the initials.
 */
export function MemberAvatar({ name, colour, avatar, size = 'md' }: MemberAvatarProps) {
  const style = { '--member-colour': colour } as CSSProperties
  return (
    <span className="member-avatar" data-member-colour={colour} style={style}>
      {avatar ? (
        <span className="avatar" data-size={size} role="img" aria-label={name}>
          {avatar}
        </span>
      ) : (
        <Avatar name={name} size={size} />
      )}
    </span>
  )
}
