import type { AllowedUser, Member, MemberInput } from '../types'

export interface MemberEditorProps {
  open: boolean
  /** Absent = adding a new Member. */
  member?: Member
  users: Pick<AllowedUser, 'id' | 'displayName' | 'email'>[]
  saving?: boolean
  error?: string
  onSave: (input: MemberInput, userId: number | null) => void | Promise<void>
  onDelete?: () => void | Promise<void>
  onClose: () => void
}

/** A BottomSheet "Add Member" / "Edit Member": Name, Colour, Avatar (optional), Portion Factor stepper
 *  (0.25..3, step 0.25), Linked User select; buttons "Save Member" and "Remove Member" (editing only). */
export function MemberEditor(_props: MemberEditorProps) {
  return null
}
