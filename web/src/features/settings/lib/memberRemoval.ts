// B9-36 (SAFE-02): what removing a Member says and does. Plain TypeScript. STUB: the developer writes the bodies (lib/memberRemoval.test.ts).
import type { ConfirmOptions } from '../../../ui'

/** `GET /api/members/{id}/impact`: counts and the sign-in that ends (null when no sign-in ends). */
export interface MemberImpact {
  preferences: number
  mealSlots: number
  signIn: { email: string } | null
}

export function removeMemberDialog(_name: string, _impact: MemberImpact): ConfirmOptions {
  throw new Error('not implemented: removeMemberDialog')
}

export interface MemberRemovedToast {
  headline: string
  undoAriaLabel: string
  restored: string
}

export function memberRemovedToast(_name: string): MemberRemovedToast {
  throw new Error('not implemented: memberRemovedToast')
}
