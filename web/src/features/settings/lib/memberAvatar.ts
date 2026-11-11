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
 * `kept` is what the sheet remembers from the modes the Admin left (not saved yet): switching back restores it, so Photo, Emoji, Photo
 * does not lose the chosen photo. Without `kept`, switching to a mode starts it empty.
 */
export function withAvatarMode(draft: MemberInput, mode: AvatarMode, kept?: Pick<MemberInput, 'avatar' | 'photo'>): MemberInput {
  return {
    ...draft,
    avatar: mode === 'emoji' ? draft.avatar || (kept?.avatar ?? '') : '',
    photo: mode === 'photo' ? draft.photo || (kept?.photo ?? '') : '',
  }
}

/** What to remember when the choice leaves `mode`: the photo of Photo, the emoji of Emoji; nothing else changes. */
export function keepOnLeaving(kept: Pick<MemberInput, 'avatar' | 'photo'>, draft: MemberInput, mode: AvatarMode): Pick<MemberInput, 'avatar' | 'photo'> {
  if (mode === 'photo') return { ...kept, photo: draft.photo ?? '' }
  if (mode === 'emoji') return { ...kept, avatar: draft.avatar }
  return kept
}
