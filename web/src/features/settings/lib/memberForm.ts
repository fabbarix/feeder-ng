import type { Member, MemberInput } from '../types'
import { MAX_PORTION_FACTOR, MIN_PORTION_FACTOR } from './portions'

export const DEFAULT_MEMBER_COLOUR = '#3366cc'

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
