import type { AllowedUser } from '../types'

export interface AllowlistPanelProps {
  users: AllowedUser[]
  currentUserId: number
  error?: string
  /** Resolves when added; the panel clears its field then, and keeps the text if it rejects. */
  onAdd: (email: string) => Promise<unknown>
  onSetAdmin: (id: number, isAdmin: boolean) => void
  onRemove: (id: number) => void
}

/** Field "Email to allow" + "Add to allowlist"; a row per User with checkbox "Admin: <email>" and a two-step
 *  "Remove <email>" -> "Confirm remove <email>". The only Admin's row is locked ("Last Admin"). */
export function AllowlistPanel(_props: AllowlistPanelProps) {
  return null
}
