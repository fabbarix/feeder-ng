import type { AccessMember, AccessRequest } from '../types'

export interface ApproveSheetProps {
  /** The request being approved; the sheet is open while this is set. */
  request: AccessRequest | null
  /** Members that can still be linked (those with no User). */
  members: AccessMember[]
  membersFailed?: boolean
  busy?: boolean
  /** A refusal to show inside the sheet, for example "That Member already has a User". */
  error?: string
  /** `memberId` is undefined when nobody was picked. */
  onApprove: (memberId?: number) => void
  onCancel: () => void
}

/**
 * Approve step (decision A3): a BottomSheet with an optional Member picker on the shared Select and the buttons
 * Cancel and Approve. STUB: renders nothing yet.
 */
export function ApproveSheet(_props: ApproveSheetProps) {
  return null
}
