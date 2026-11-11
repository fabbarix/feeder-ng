import type { MemberInput } from '../types'

/** IM2: how a Member's avatar is drawn, and what the Member sheet's "Avatar" choice (Initials / Emoji / Photo) is set to. */
export type AvatarMode = 'initials' | 'emoji' | 'photo'

/** photo (a non-blank image id) > emoji (a non-blank avatar) > initials. */
export function avatarMode(member: Pick<MemberInput, 'avatar' | 'photo'>): AvatarMode {
  if (member.photo?.trim()) return 'photo'
  if (member.avatar.trim()) return 'emoji'
  return 'initials'
}

/**
 * The draft after the choice is switched. Exactly one of avatar / photo survives: 'initials' clears both, 'emoji' keeps the emoji and
 * clears the photo, 'photo' keeps the photo and clears the emoji. Everything else is untouched. Pure; returns a copy.
 */
export function withAvatarMode(draft: MemberInput, mode: AvatarMode): MemberInput {
  return {
    ...draft,
    avatar: mode === 'emoji' ? draft.avatar : '',
    photo: mode === 'photo' ? (draft.photo ?? '') : '',
  }
}
