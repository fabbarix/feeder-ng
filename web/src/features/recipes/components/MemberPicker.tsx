import type { ReactNode } from 'react'
import type { MemberChoice } from '../../../ui/Select/options'

export interface MemberPickerProps {
  members: MemberChoice[]
  /** The chosen Member, or null. */
  selectedId: number | null
  onPick: (ids: number[]) => void
}

/**
 * Who the preferences are for (G1): ui/MemberSelect labelled strings.memberPicker.label with the chosen Member
 * as its only value. Renders nothing when there are no Members.
 */
export function MemberPicker(props: MemberPickerProps): ReactNode {
  void props
  return null
}
