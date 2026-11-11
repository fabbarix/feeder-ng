import type { MemberInput } from '../types'

/** IM2: how a Member's avatar is drawn, and what the Member sheet's "Avatar" choice (Initials / Emoji / Photo) is set to. */
export type AvatarMode = 'initials' | 'emoji' | 'photo'

/** photo (a non-blank image id) > emoji (a non-blank avatar) > initials. */
export function avatarMode(_member: Pick<MemberInput, 'avatar' | 'photo'>): AvatarMode {
  throw new Error('TODO(im2): avatarMode')
}

/**
 * The draft after the choice is switched. Exactly one of avatar / photo survives: 'initials' clears both, 'emoji' keeps the emoji and
 * clears the photo, 'photo' keeps the photo and clears the emoji. Everything else is untouched. Pure; returns a copy.
 */
export function withAvatarMode(_draft: MemberInput, _mode: AvatarMode): MemberInput {
  throw new Error('TODO(im2): withAvatarMode')
}
