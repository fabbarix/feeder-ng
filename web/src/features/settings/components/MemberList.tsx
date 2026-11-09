import type { Member } from '../types'

export interface MemberListProps {
  members: Member[]
  canEdit: boolean
  /** Display names of linked Users by User id, shown as a chip on the Member. */
  linkedUserNames?: Record<number, string>
  onAdd: () => void
  onEdit: (member: Member) => void
}

/** Member tiles (Avatar, name, "Portion Factor 0.5", linked-User chip). Admins get "Add Member" and "Edit <name>". */
export function MemberList(_props: MemberListProps) {
  return null
}
