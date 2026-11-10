import { useMemo, useState } from 'react'
import { useMe } from '../../../app/useMe'
import type { MemberChoice } from '../../../ui/Select/options'
import { useMembers } from '../../settings/hooks/useMembers'
import { selectedMemberId, singleMember } from '../lib/memberPick'

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
  const settings = useMembers()
  const me = useMe()
  const [chosen, setChosen] = useState<number | undefined>(undefined)
  const members = useMemo(() => settings.members.map((m) => ({ id: m.id, name: m.name })), [settings.members])
  const refs = useMemo(() => settings.members.map((m) => ({ id: m.id, name: m.name, userId: m.userId })), [settings.members])
  const selectedId = selectedMemberId(refs, me.data?.id ?? null, chosen)
  return {
    members,
    selectedId,
    memberId: chosen,
    select: (ids) => setChosen(singleMember(selectedId, ids) ?? undefined),
    isLoading: settings.isPending || me.isLoading,
  }
}
