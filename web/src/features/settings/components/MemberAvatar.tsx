import type { AvatarProps } from '../../../ui'

export interface MemberAvatarProps extends Pick<AvatarProps, 'size'> {
  name: string
  /** The Member colour, "#rrggbb": rings the Avatar and tints its background. */
  colour: string
  /** Optional emoji; shown instead of initials. */
  avatar?: string
}

/**
 * STUB (WP11). The shared Avatar wrapped in `<span class="member-avatar" data-member-colour={colour} style={{'--member-colour': colour}}>`;
 * CSS (feature CSS, tokens + the custom property) draws the ring and a tinted fill. An emoji `avatar` replaces the initials.
 * Replaced by an Avatar `colour` prop if the PM accepts the PRIMITIVE REQUEST.
 */
export function MemberAvatar(_props: MemberAvatarProps) {
  return null
}
