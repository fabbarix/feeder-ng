import type { MemberChoice } from '../../../ui/Select/options'

export interface UseMemberPicker {
  members: MemberChoice[]
  /** The Member shown as chosen (see lib/memberPick.selectedMemberId), or null. */
  selectedId: number | null
  /** What to pass to useRecipePreferences: the explicit pick, else undefined (the API defaults to the signed-in User's Member). */
  memberId: number | undefined
  /** MemberSelect's onChange: lib/memberPick.singleMember decides the new pick. */
  select: (ids: number[]) => void
  isLoading: boolean
}

/**
 * Members (settings feature's useMembers) and the signed-in User (app/useMe), plus the picked Member for the
 * Recipe detail's preferences. The pick lives in component state; it starts unset.
 */
export function useMemberPicker(): UseMemberPicker {
  throw new Error('not implemented')
}
