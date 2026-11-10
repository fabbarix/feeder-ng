import type { ReactNode } from 'react'
import { MemberSelect } from '../../../ui'
import type { MemberChoice } from '../../../ui/Select/options'
import { recipeStrings } from '../strings'

export interface MemberPickerProps {
  members: MemberChoice[]
  /** The chosen Member, or null. */
  selectedId: number | null
  onPick: (ids: number[]) => void
}

/**
 * Who the preferences are for (G1): a single-valued ui/MemberSelect labelled strings.memberPicker.label. Renders
 * nothing when there are no Members.
 */
export function MemberPicker({ members, selectedId, onPick }: MemberPickerProps): ReactNode {
  if (members.length === 0) return null
  return (
    <MemberSelect
      single
      label={recipeStrings.memberPicker.label}
      members={members}
      value={selectedId}
      onChange={(id) => onPick([id])}
    />
  )
}
