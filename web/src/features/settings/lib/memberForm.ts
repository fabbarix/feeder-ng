import type { Member, MemberInput } from '../types'
import { MAX_PORTION_FACTOR, MIN_PORTION_FACTOR } from './portions'

export const DEFAULT_MEMBER_COLOUR = '#3366cc'

/** WP11: the Member colour swatches (ColorSwatches, plus Custom). The Member colour rings the Avatar everywhere. */
export const MEMBER_COLOURS: ReadonlyArray<{ value: string; name: string }> = [
  { value: '#3366cc', name: 'Blue' },
  { value: '#e07a5f', name: 'Terracotta' },
  { value: '#81b29a', name: 'Sage' },
  { value: '#e0a92f', name: 'Mustard' },
  { value: '#7b3f8c', name: 'Plum' },
  { value: '#0f766e', name: 'Teal' },
  { value: '#d6457a', name: 'Rose' },
  { value: '#475569', name: 'Slate' },
]

/** The Avatar emoji on offer (one code point each, so well within the API's 4-character limit). */
export const MEMBER_AVATARS: ReadonlyArray<{ value: string; name: string }> = [
  { value: '🦊', name: 'Fox' },
  { value: '🐻', name: 'Bear' },
  { value: '🐼', name: 'Panda' },
  { value: '🦁', name: 'Lion' },
  { value: '🐸', name: 'Frog' },
  { value: '🐙', name: 'Octopus' },
  { value: '🦉', name: 'Owl' },
  { value: '🐢', name: 'Turtle' },
  { value: '🐰', name: 'Rabbit' },
  { value: '🐶', name: 'Dog' },
  { value: '🐱', name: 'Cat' },
  { value: '🐝', name: 'Bee' },
  { value: '🌻', name: 'Sunflower' },
  { value: '🍕', name: 'Pizza' },
  { value: '🥕', name: 'Carrot' },
  { value: '🍓', name: 'Strawberry' },
]

/** The editor's starting state: an existing Member, or a new one at Portion Factor 1. */
export function memberDraft(member?: Member): MemberInput {
  return member
    ? { name: member.name, colour: member.colour, avatar: member.avatar, portionFactor: member.portionFactor }
    : { name: '', colour: DEFAULT_MEMBER_COLOUR, avatar: '', portionFactor: 1 }
}

/** The first thing wrong with the draft, or null. */
export function memberProblem(draft: MemberInput): string | null {
  if (draft.name.trim() === '') return 'Enter a name for the Member.'
  if (draft.portionFactor < MIN_PORTION_FACTOR || draft.portionFactor > MAX_PORTION_FACTOR) {
    return `Portion Factor must be between ${MIN_PORTION_FACTOR} and ${MAX_PORTION_FACTOR}.`
  }
  return null
}

/** The request body: name and avatar trimmed. */
export function memberFromDraft(draft: MemberInput): MemberInput {
  return { ...draft, name: draft.name.trim(), avatar: draft.avatar.trim() }
}

/** WP11 (QA: "Linked User" offered already-linked Users): the Users a Member may be linked to, in the given order.
 *  A User linked to ANOTHER Member is left out; the User linked to `editing` (and every unlinked User) stays. */
export function availableUsers<U extends { id: number }>(users: U[], members: Pick<Member, 'id' | 'userId'>[], editing?: Pick<Member, 'id'>): U[] {
  const linked = new Set(members.filter((m) => m.id !== editing?.id && m.userId !== null).map((m) => m.userId))
  return users.filter((u) => !linked.has(u.id))
}

/** Whether "This is me" is offered: the signed-in User is known, no Member other than `editing` is linked to them,
 *  and the draft is not already linked to them. */
export function canLinkMe(
  members: Pick<Member, 'id' | 'userId'>[],
  editing: Pick<Member, 'id'> | undefined,
  userId: number | null,
  currentUserId: number | undefined,
): boolean {
  if (currentUserId === undefined || userId === currentUserId) return false
  return !members.some((m) => m.id !== editing?.id && m.userId === currentUserId)
}
