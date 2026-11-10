import type { AccessRequest } from '../types'

export interface AccessRequestListProps {
  requests: AccessRequest[]
  now?: Date
  error?: string
  onApprove: (id: number) => void
  onDeny: (id: number) => void
}

/** A row per pending request: avatar, name, email, "asked N days ago", days left, Approve and Deny. */
export function AccessRequestList(_props: AccessRequestListProps) {
  return null
}
